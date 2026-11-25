/* =========================================================
   ERP Horizonte Liberteño · Módulo Ventas y Atención
   Lógica de la interfaz (JavaScript sin dependencias).
   Persistencia local (localStorage) solo para la demostración:
   en producción estas operaciones llamarían a la API del ERP.
   ========================================================= */
(function () {
  'use strict';
  const D = window.DATOS_SIMULADOS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const STORE_KEY = 'erp_hl_ventas_demo_v1';
  const params = new URLSearchParams(location.search);

  /* ---------- Estado ---------- */
  const HOY = new Date(); HOY.setHours(0, 0, 0, 0);
  const viajes = D.generarViajes(HOY);
  const busPorId = Object.fromEntries(D.buses.map(b => [b.id_bus, b]));
  const rutaPorId = Object.fromEntries(D.rutas.map(r => [r.id_ruta, r]));
  const agenciaPorCod = Object.fromEntries(D.agencias.map(a => [a.codigo, a]));

  let state = cargar() || {
    rol: 'AGENTE_VENTAS',
    agencia: 'TRU1',
    clientes: D.clientes.map(c => ({ ...c })),
    boletos: [],        // ventas.boleto
    pagos: [],          // ventas.pago
    comprobantes: [],   // ventas.comprobante
    cierres: [],        // ventas.cierre_caja
    auditoria: [],      // administracion.registro_auditoria
    seq: { boleto: 0, B: 0, F: 0, cliente: 100, pago: 0 }
  };
  if (!state.boletos.length) sembrarBoletos();
  let venta = nuevaVenta();
  // Protección contra errores: advierte antes de cerrar o recargar si hay una venta sin completar
  window.addEventListener('beforeunload', (e) => { if (venta && venta.viaje) { e.preventDefault(); e.returnValue = ''; } });
  let simularFalla = params.get('fallo') === '1';

  function nuevaVenta() { return { viaje: null, asiento: null, cliente: null, promo: false, reservaId: null }; }

  function guardar() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* almacenamiento no disponible */ }
  }
  function cargar() {
    if (params.get('reset') === '1') { try { localStorage.removeItem(STORE_KEY); } catch (e) {} return null; }
    try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; }
  }

  // Boletos iniciales (simulados) para que los listados no arranquen vacíos
  function sembrarBoletos() {
    const hoyStr = D.isoDate(HOY);
    const delDia = viajes.filter(v => v.fecha_salida === hoyStr && rutaPorId[v.id_ruta].origen === 'TRU1');
    const muestras = [[0, 1, 5, 'EFECTIVO'], [0, 2, 6, 'TARJETA'], [1, 1, 9, 'BILLETERA'], [2, 5, 3, 'EFECTIVO'], [1, 2, 14, 'EFECTIVO']];
    muestras.forEach(([iv, idc, nro, medio], i) => {
      const v = delDia[iv % delDia.length];
      const as = D.asientosDeBus(busPorId[v.id_bus]).find(a => a.numero === nro);
      const b = crearBoleto(v, as, idc, 'VENDIDO', 'AGENCIA', 'Usuario Demo Ventas');
      b.fecha_hora_venta = new Date(HOY.getTime() + (8 + i) * 3600e3).toISOString();
      registrarPago(b, medio, medio === 'EFECTIVO' ? null : 'OP' + (723100 + i), b.precio);
      emitirComprobante(b, 'BOLETO_VIAJE', null);
    });
    guardar();
  }

  /* ---------- Utilidades ---------- */
  const soles = n => 'S/ ' + Number(n).toFixed(2);
  const fechaLarga = f => new Date(f + 'T00:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  const fechaCorta = f => new Date(f + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
  const hora = iso => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const espera = ms => new Promise(r => setTimeout(r, ms));
  const nombreCliente = c => c ? (c.razon_social || `${c.nombres} ${c.apellidos}`) : '—';
  const enmascararDoc = d => d ? d.slice(0, 2) + '•'.repeat(Math.max(0, d.length - 4)) + d.slice(-2) : '—';
  const enmascararTel = t => t ? '+51 ••• ••• •' + t.slice(-2) : '—';
  const enmascararCorreo = c => { if (!c) return '—'; const [u, dom] = c.split('@'); return u[0] + '•••@' + dom; };
  const clientePorId = id => state.clientes.find(c => c.id_cliente === id);
  const viajePorId = id => viajes.find(v => v.id_viaje === id);
  const usuario = () => D.usuarios[state.rol];

  function auditar(accion, detalle) {
    state.auditoria.unshift({ ts: new Date().toISOString(), usuario: usuario().nombre, rol: state.rol, accion, detalle });
    state.auditoria = state.auditoria.slice(0, 200);
    guardar();
  }

  function toast(msg, tipo = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + tipo; t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 4500);
  }

  function estadoVacio(titulo, texto, icono = 'M3 7h18M3 12h18M3 17h10') {
    return `<div class="state"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icono}"/></svg><strong>${esc(titulo)}</strong><p>${esc(texto)}</p></div>`;
  }

  /* ---------- Reglas de negocio (espejo de los CHECK de la BD) ---------- */
  const REGEX_DOC = { DNI: /^\d{8}$/, CE: /^[A-Z0-9]{6,12}$/, PAS: /^[A-Z0-9]{6,12}$/, RUC: /^(10|15|17|20)\d{9}$/ };   // = ck_cliente_numdoc
  const MSG_DOC = { DNI: 'El DNI debe tener 8 dígitos.', CE: 'El carné de extranjería debe tener de 6 a 12 letras o números.', PAS: 'El pasaporte debe tener de 6 a 12 letras o números.', RUC: 'El RUC debe tener 11 dígitos y empezar con 10, 15, 17 o 20.' };
  const REGEX_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]{2,60}$/;
  const REGEX_TEL = /^\+51 ?\d{9}$/;                     // = ck_cliente_telefono
  const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;           // = ck_cliente_correo
  const REGEX_REF = /^[A-Za-z0-9-]{6,20}$/;

  function setError(input, errEl, msg) {
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    errEl.textContent = msg || '';
    return !msg;
  }

  function asientoOcupado(idViaje, numero) {
    return state.boletos.find(b => b.id_viaje === idViaje && b.numero_asiento === numero && (b.estado === 'VENDIDO' || b.estado === 'RESERVADO' || b.estado === 'EMBARCADO'));
  }

  function precioAsiento(viaje, asiento) {
    return rutaPorId[viaje.id_ruta].tarifa_base + (D.recargoAsiento[asiento.tipo] || 0);
  }

  function crearBoleto(viaje, asiento, idCliente, estado, canal, vendedor) {
    state.seq.boleto++;
    const b = {
      id_boleto: state.seq.boleto,
      codigo: 'BT-' + String(state.seq.boleto).padStart(6, '0'),
      id_viaje: viaje.id_viaje,
      numero_asiento: asiento.numero,
      piso: asiento.piso,
      tipo_asiento: asiento.tipo,
      id_cliente: idCliente,
      precio: precioAsiento(viaje, asiento),
      estado, canal,
      agencia: state ? state.agencia : 'TRU1',
      vendedor,
      fecha_hora_venta: new Date().toISOString(),
      fecha_hora_expiracion: estado === 'RESERVADO' ? new Date(Date.now() + D.MINUTOS_RESERVA * 60000).toISOString() : null,
      motivo_anulacion: null
    };
    state.boletos.push(b);
    return b;
  }

  function registrarPago(boleto, medio, referencia, monto) {
    state.seq.pago++;
    state.pagos.push({ id_pago: state.seq.pago, id_boleto: boleto.id_boleto, medio, referencia_externa: referencia, monto, fecha_hora: new Date().toISOString(), agencia: boleto.agencia, usuario: boleto.vendedor });
  }

  function emitirComprobante(boleto, tipo, ruc) {
    const serie = tipo === 'FACTURA' ? 'F001' : 'B001';
    const k = tipo === 'FACTURA' ? 'F' : 'B';
    state.seq[k]++;
    const c = { id_comprobante: state.comprobantes.length + 1, id_boleto: boleto.id_boleto, tipo, serie, numero: state.seq[k], ruc_adquiriente: ruc, total: boleto.precio, fecha_emision: new Date().toISOString() };
    state.comprobantes.push(c);
    return c;
  }

  // Libera reservas vencidas (equivale al temporizador del proceso P01)
  function liberarVencidas() {
    const ahora = Date.now(); let n = 0;
    state.boletos.forEach(b => {
      if (b.estado === 'RESERVADO' && new Date(b.fecha_hora_expiracion).getTime() <= ahora) {
        b.estado = 'ANULADO'; b.motivo_anulacion = 'Reserva vencida (liberación automática)'; n++;
      }
    });
    if (n) { auditar('RESERVA_VENCIDA', `${n} reserva(s) liberada(s) automáticamente`); toast(`${n} reserva(s) vencida(s): asiento liberado.`); }
    return n;
  }

  /* ---------- Navegación ---------- */
  const VISTAS = ['inicio', 'venta', 'reservas', 'boletos', 'clientes', 'caja', 'privacidad'];
  function irA() {
    const v = (location.hash || '#inicio').slice(1);
    const vista = VISTAS.includes(v) ? v : 'inicio';
    $$('.view').forEach(s => { s.hidden = s.id !== 'view-' + vista; });
    $$('[data-view]').forEach(a => { if (a.dataset.view === vista) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    cerrarMenu();
    render(vista);
    const h = $('#view-' + vista + ' h1');
    document.title = (h ? h.textContent + ' · ' : '') + 'ERP Horizonte Liberteño';
    $('#main').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  function render(vista) {
    ({ inicio: renderInicio, venta: renderVenta, reservas: renderReservas, boletos: renderBoletos, clientes: renderClientes, caja: renderCaja, privacidad: renderPrivacidad })[vista]();
    actualizarContadores();
  }
  function abrirMenu() { $('#sidebar').classList.add('open'); $('#scrim').hidden = false; $('#menuToggle').setAttribute('aria-expanded', 'true'); }
  function cerrarMenu() { $('#sidebar').classList.remove('open'); $('#scrim').hidden = true; $('#menuToggle').setAttribute('aria-expanded', 'false'); }

  function actualizarContadores() {
    const n = state.boletos.filter(b => b.estado === 'RESERVADO').length;
    const el = $('#navReservas'); el.textContent = n; el.toggleAttribute('data-zero', n === 0);
  }

  function renderEncabezado() {
    const u = usuario();
    $('#userName').textContent = u.nombre;
    $('#userInitials').textContent = u.iniciales;
    $('#roleSelect').value = state.rol;
    const sel = $('#agencySelect');
    sel.innerHTML = D.agencias.map(a => `<option value="${a.codigo}">${esc(a.nombre)}</option>`).join('');
    sel.value = state.agencia;
  }

  /* ---------- Vista: Inicio ---------- */
  function renderInicio() {
    $('#todayLabel').textContent = `${fechaLarga(D.isoDate(HOY))} · ${agenciaPorCod[state.agencia].nombre}`;
    const hoyStr = D.isoDate(HOY);
    const vendidosHoy = state.boletos.filter(b => b.agencia === state.agencia && b.estado !== 'ANULADO' && b.estado !== 'RESERVADO' && b.fecha_hora_venta.slice(0, 10) === hoyStr);
    const totalHoy = vendidosHoy.reduce((s, b) => s + b.precio, 0);
    const reservas = state.boletos.filter(b => b.estado === 'RESERVADO' && b.agencia === state.agencia);
    const proximas = viajes.filter(v => rutaPorId[v.id_ruta].origen === state.agencia && v.fecha_salida === hoyStr);
    const ocup = proximas.map(v => tasaOcupacion(v));
    const prom = ocup.length ? Math.round(ocup.reduce((a, b) => a + b, 0) / ocup.length) : 0;
    $('#kpis').innerHTML = [
      ['Ventas del día', soles(totalHoy), `${vendidosHoy.length} boleto(s)`],
      ['Boletos emitidos', vendidosHoy.length, 'en esta agencia'],
      ['Reservas activas', reservas.length, `vencen en ${D.MINUTOS_RESERVA} min`],
      ['Ocupación promedio', prom + '%', 'salidas de hoy']
    ].map(([t, v, s]) => `<div class="kpi"><span>${t}</span><strong>${v}</strong><small>${s}</small></div>`).join('');

    const lista = proximas.slice(0, 5);
    $('#nextTrips').innerHTML = lista.length ? lista.map(v => {
      const r = rutaPorId[v.id_ruta]; const o = tasaOcupacion(v);
      return `<div class="list-item"><div class="grow"><strong>${v.hora_salida}</strong> · ${esc(agenciaPorCod[r.origen].ciudad)} → ${esc(agenciaPorCod[r.destino].ciudad)}<div class="muted small">${esc(busPorId[v.id_bus].servicio)} · desde ${soles(r.tarifa_base)}</div></div><span class="chip ${o > 80 ? 'chip-warn' : 'chip-info'}">${o}% ocupado</span></div>`;
    }).join('') : estadoVacio('Sin salidas hoy', 'Esta agencia no tiene salidas programadas para hoy.');

    $('#expiringList').innerHTML = reservas.length ? reservas.map(b => filaReserva(b, true)).join('') : estadoVacio('No hay reservas pendientes', 'Las reservas creadas aparecerán aquí con su tiempo restante.', 'M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18');
  }

  function tasaOcupacion(v) {
    const asientos = D.asientosDeBus(busPorId[v.id_bus]);
    const sim = D.ocupacionSimulada(v.id_viaje, asientos.length);
    const reales = state.boletos.filter(b => b.id_viaje === v.id_viaje && b.estado !== 'ANULADO' && !sim.has(b.numero_asiento)).length;
    return Math.round(((sim.size + reales) / asientos.length) * 100);
  }

  /* ---------- Vista: Venta (asistente) ---------- */
  function renderVenta() {
    const origen = $('#fOrigen'), destino = $('#fDestino'), fecha = $('#fFecha');
    if (!origen.options.length) {
      const opts = D.agencias.map(a => `<option value="${a.codigo}">${esc(a.ciudad)} (${a.codigo})</option>`).join('');
      origen.innerHTML = opts; destino.innerHTML = opts;
      origen.value = state.agencia;
      destino.value = state.agencia === 'TRU1' ? 'LIM1' : 'TRU1';
      fecha.value = D.isoDate(HOY);
      fecha.min = D.isoDate(HOY);
      const max = new Date(HOY); max.setDate(max.getDate() + 7); fecha.max = D.isoDate(max);
    }
    if (!venta.viaje) mostrarPaso(1);
  }

  function mostrarPaso(n) {
    $$('.step-panel').forEach(p => { p.hidden = Number(p.dataset.panel) !== n; });
    $$('#stepper li').forEach(li => {
      const s = Number(li.dataset.step);
      li.classList.toggle('active', s === n); li.classList.toggle('done', s < n);
      if (s === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    if (n === 2) renderAsientos();
    if (n === 3) prepararPasajero();
    if (n === 4) prepararPago();
    const panel = $(`.step-panel[data-panel="${n}"]`);
    const foco = panel.querySelector('h2, input, select');
    if (foco && n > 1) setTimeout(() => foco.focus && foco.focus({ preventScroll: false }), 0);
  }

  async function buscarViajes(ev) {
    ev.preventDefault();
    const o = $('#fOrigen').value, d = $('#fDestino').value, f = $('#fFecha').value;
    const err = $('#searchError');
    if (!f) { err.textContent = 'Seleccione la fecha de viaje.'; $('#fFecha').setAttribute('aria-invalid', 'true'); return; }
    if (o === d) { err.textContent = 'El origen y el destino deben ser distintos.'; $('#fDestino').setAttribute('aria-invalid', 'true'); return; }
    if (f < D.isoDate(HOY)) { err.textContent = 'No se puede vender para una fecha pasada.'; $('#fFecha').setAttribute('aria-invalid', 'true'); return; }
    err.textContent = ''; $('#fDestino').removeAttribute('aria-invalid'); $('#fFecha').removeAttribute('aria-invalid');

    const cont = $('#tripResults');
    const btn = ev.submitter || $('#searchForm button[type=submit]');
    btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
    cont.innerHTML = '<div class="trip-list" aria-label="Cargando viajes"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
    await espera(650);
    btn.removeAttribute('aria-busy'); btn.disabled = false;

    if (simularFalla || !navigator.onLine) {
      cont.innerHTML = `<div class="card state state-error" role="alert"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg><strong>No se pudo consultar la disponibilidad</strong><p>Sin conexión con el servidor del ERP. Revise la red e intente de nuevo; si persiste, use el procedimiento de contingencia (RNF-005).</p><button class="btn btn-primary" id="btnReintentar">Reintentar</button></div>`;
      $('#btnReintentar').addEventListener('click', () => $('#searchForm').requestSubmit());
      return;
    }

    const ahora = new Date();
    const lista = viajes.filter(v => {
      const r = rutaPorId[v.id_ruta];
      if (r.origen !== o || r.destino !== d || v.fecha_salida !== f) return false;
      return new Date(`${v.fecha_salida}T${v.hora_salida}:00`) > ahora;   // no vender salidas pasadas
    });
    if (!lista.length) {
      const hayRuta = D.rutas.some(r => r.origen === o && r.destino === d);
      cont.innerHTML = '<div class="card">' + estadoVacio(hayRuta ? 'No quedan salidas para esta fecha' : 'Ruta no operada',
        hayRuta ? 'Pruebe con otra fecha: las salidas de hoy ya partieron o no hay horarios.' : `La empresa no opera la ruta ${agenciaPorCod[o].ciudad} → ${agenciaPorCod[d].ciudad}.`) + '</div>';
      return;
    }
    cont.innerHTML = `<p class="muted small">${lista.length} salida(s) · ${fechaLarga(f)}</p><div class="trip-list">` + lista.map(v => {
      const r = rutaPorId[v.id_ruta]; const bus = busPorId[v.id_bus];
      const libres = asientosLibres(v);
      const lleno = libres === 0;
      return `<article class="trip">
        <div><div class="trip-time">${v.hora_salida}</div><div class="trip-meta">${Math.floor(r.duracion_min / 60)} h ${r.duracion_min % 60 ? (r.duracion_min % 60) + ' min' : ''}</div></div>
        <div><strong>${esc(agenciaPorCod[r.origen].ciudad)} → ${esc(agenciaPorCod[r.destino].ciudad)}</strong><div class="trip-meta">${esc(bus.servicio)} · Placa ${bus.placa}</div>
          <span class="chip ${lleno ? 'chip-err' : libres < 8 ? 'chip-warn' : 'chip-ok'}">${lleno ? 'Agotado' : libres + ' asientos libres'}</span></div>
        <div class="trip-price">${soles(r.tarifa_base)}<div class="trip-meta">desde</div></div>
        <button class="btn btn-primary" data-viaje="${v.id_viaje}" ${lleno ? 'disabled' : ''}>Elegir asiento</button>
      </article>`;
    }).join('') + '</div>';
  }

  function asientosLibres(v) {
    const as = D.asientosDeBus(busPorId[v.id_bus]);
    const sim = D.ocupacionSimulada(v.id_viaje, as.length);
    return as.filter(a => !sim.has(a.numero) && !asientoOcupado(v.id_viaje, a.numero)).length;
  }

  function renderAsientos() {
    const v = venta.viaje, r = rutaPorId[v.id_ruta], bus = busPorId[v.id_bus];
    $('#seatTitle').textContent = `Elegir asiento · ${v.hora_salida} ${agenciaPorCod[r.origen].ciudad} → ${agenciaPorCod[r.destino].ciudad}`;
    const asientos = D.asientosDeBus(bus);
    const sim = D.ocupacionSimulada(v.id_viaje, asientos.length);
    const pisos = [...new Set(asientos.map(a => a.piso))];
    $('#seatMap').innerHTML = pisos.map(p => {
      const delPiso = asientos.filter(a => a.piso === p);
      let celdas = '';
      delPiso.forEach((a, i) => {
        if (i % 4 === 2) celdas += '<span class="aisle"></span>';
        const reg = asientoOcupado(v.id_viaje, a.numero);
        const ocupado = sim.has(a.numero) || (reg && reg.estado !== 'RESERVADO');
        const reservado = reg && reg.estado === 'RESERVADO';
        const sel = !!(venta.asiento && venta.asiento.numero === a.numero); // corrige aria-pressed="null"
        const etiqueta = `Asiento ${a.numero}, ${a.tipo.toLowerCase()}, ${a.ubicacion.toLowerCase()}, ${ocupado ? 'ocupado' : reservado ? 'reservado' : soles(precioAsiento(v, a))}`;
        celdas += `<button type="button" class="seat ${ocupado ? 'taken' : ''} ${reservado ? 'reserved' : ''}" data-seat="${a.numero}" aria-pressed="${sel}" aria-label="${etiqueta}" ${ocupado || reservado ? 'disabled' : ''}>${a.numero}<small>${a.tipo === 'CAMA' ? 'Cama' : a.ubicacion === 'VENTANA' ? 'Vent.' : 'Pas.'}</small></button>`;
      });
      return `<div class="deck"><h3>${pisos.length > 1 ? 'Piso ' + p + (p === 1 ? ' · Cama 160°' : ' · Semicama') : 'Piso único'}</h3><div class="seat-grid">${celdas}</div></div>`;
    }).join('');
    renderResumenAsiento();
  }

  function renderResumenAsiento() {
    const v = venta.viaje, r = rutaPorId[v.id_ruta], a = venta.asiento;
    $('#seatSummary').innerHTML = `<h2>Resumen</h2><dl>
      <dt>Ruta</dt><dd>${esc(agenciaPorCod[r.origen].ciudad)} → ${esc(agenciaPorCod[r.destino].ciudad)}</dd>
      <dt>Salida</dt><dd>${fechaCorta(v.fecha_salida)} · ${v.hora_salida}</dd>
      <dt>Asiento</dt><dd>${a ? `${a.numero} (${a.tipo.toLowerCase()}, piso ${a.piso})` : 'Sin elegir'}</dd>
      <dt>Precio</dt><dd class="total">${a ? soles(precioAsiento(v, a)) : '—'}</dd></dl>
      <button class="btn btn-primary" id="btnAsientoOk" style="width:100%" ${a ? '' : 'disabled'}>Continuar</button>
      ${a ? '' : '<p class="help" style="margin-top:8px">Toque un asiento libre en el mapa.</p>'}`;
  }

  function prepararPasajero() {
    const f = $('#paxForm');
    if (!venta.cliente) { f.reset(); $$('[aria-invalid]', f).forEach(i => i.removeAttribute('aria-invalid')); $$('.field-error', f).forEach(e => e.textContent = ''); }
  }

  function buscarCliente() {
    const tipo = $('#pTipoDoc').value, num = $('#pNumDoc').value.trim().toUpperCase();
    if (!setError($('#pNumDoc'), $('#pNumDocErr'), REGEX_DOC[tipo].test(num) ? '' : MSG_DOC[tipo])) return;
    const c = state.clientes.find(x => x.tipo_documento === tipo && x.numero_documento === num);
    if (c) {
      $('#pNombres').value = c.nombres || ''; $('#pApellidos').value = c.apellidos || '';
      $('#pTelefono').value = c.telefono || ''; $('#pCorreo').value = c.correo || '';
      $('#pPromo').checked = !!c.acepta_promociones;
      toast('Cliente encontrado: datos completados.', 'ok');
      auditar('CONSULTA_CLIENTE', `Búsqueda por documento ${enmascararDoc(num)} para venta`);
    } else {
      toast('Cliente nuevo: complete los datos del pasajero.');
      $('#pNombres').focus();
    }
  }

  function validarPasajero() {
    const tipo = $('#pTipoDoc').value;
    const num = $('#pNumDoc').value.trim().toUpperCase();
    let ok = true;
    ok = setError($('#pNumDoc'), $('#pNumDocErr'), !num ? 'Ingrese el número de documento.' : REGEX_DOC[tipo].test(num) ? '' : MSG_DOC[tipo]) && ok;
    ok = setError($('#pNombres'), $('#pNombresErr'), REGEX_NOMBRE.test($('#pNombres').value.trim()) ? '' : 'Ingrese los nombres (solo letras, 2 a 60 caracteres).') && ok;
    ok = setError($('#pApellidos'), $('#pApellidosErr'), REGEX_NOMBRE.test($('#pApellidos').value.trim()) ? '' : 'Ingrese los apellidos (solo letras, 2 a 60 caracteres).') && ok;
    const tel = $('#pTelefono').value.trim();
    ok = setError($('#pTelefono'), $('#pTelefonoErr'), !tel || REGEX_TEL.test(tel) ? '' : 'Formato: +51 seguido de 9 dígitos.') && ok;
    const mail = $('#pCorreo').value.trim();
    ok = setError($('#pCorreo'), $('#pCorreoErr'), !mail || REGEX_CORREO.test(mail) ? '' : 'Ingrese un correo válido, por ejemplo nombre@dominio.pe.') && ok;
    ok = setError($('#pAviso'), $('#pAvisoErr'), $('#pAviso').checked ? '' : 'Debe informar el aviso de privacidad antes de registrar los datos.') && ok;
    if (!ok) { const p = $('#paxForm [aria-invalid="true"]'); if (p) p.focus(); return null; }
    return { tipo_documento: tipo, numero_documento: num, nombres: $('#pNombres').value.trim(), apellidos: $('#pApellidos').value.trim(), telefono: tel ? tel.replace(' ', '') : null, correo: mail || null, acepta_promociones: $('#pPromo').checked };
  }

  function guardarCliente(datos) {
    let c = state.clientes.find(x => x.tipo_documento === datos.tipo_documento && x.numero_documento === datos.numero_documento);
    if (c) { Object.assign(c, datos); auditar('ACTUALIZA_CLIENTE', `Cliente ${enmascararDoc(c.numero_documento)} actualizado`); }
    else { state.seq.cliente++; c = { id_cliente: state.seq.cliente, ...datos }; state.clientes.push(c); auditar('ALTA_CLIENTE', `Cliente ${enmascararDoc(c.numero_documento)} registrado con aviso de privacidad informado`); }
    if (datos.acepta_promociones) auditar('CONSENTIMIENTO', `Consentimiento de promociones otorgado por ${enmascararDoc(c.numero_documento)}`);
    guardar();
    return c;
  }

  function prepararPago() {
    $('#btnReservar').hidden = !!venta.reservaId;
    $('#payForm').reset();
    $$('#payForm [aria-invalid]').forEach(i => i.removeAttribute('aria-invalid'));
    $$('#payForm .field-error').forEach(e => e.textContent = '');
    actualizarMedio();
    renderResumenPago();
  }

  function totalVenta() { return precioAsiento(venta.viaje, venta.asiento); }

  function renderResumenPago() {
    const v = venta.viaje, r = rutaPorId[v.id_ruta], a = venta.asiento, c = venta.cliente;
    $('#paySummary').innerHTML = `<h2>Resumen de la venta</h2>
      ${venta.reservaId ? '<div class="alert alert-info" style="margin-top:8px">Cobro de una reserva existente.</div>' : ''}
      <dl>
      <dt>Pasajero</dt><dd>${esc(nombreCliente(c))}</dd>
      <dt>Documento</dt><dd>${c.tipo_documento} ${enmascararDoc(c.numero_documento)}</dd>
      <dt>Ruta</dt><dd>${esc(agenciaPorCod[r.origen].ciudad)} → ${esc(agenciaPorCod[r.destino].ciudad)}</dd>
      <dt>Salida</dt><dd>${fechaCorta(v.fecha_salida)} · ${v.hora_salida}</dd>
      <dt>Asiento</dt><dd>${a.numero} · ${a.tipo.toLowerCase()}</dd>
      <dt>Total</dt><dd class="total">${soles(totalVenta())}</dd></dl>
      <p class="help">Precio con IGV incluido. Datos de demostración.</p>`;
  }

  function actualizarMedio() {
    const medio = $('input[name=medio]:checked').value;
    $('#refField').hidden = medio === 'EFECTIVO';
    $('#cashField').hidden = medio !== 'EFECTIVO';
    $('#rucField').hidden = $('#payTipoComp').value !== 'FACTURA';
    actualizarVuelto();
  }
  function actualizarVuelto() {
    const m = parseFloat($('#payCash').value);
    $('#payChange').textContent = !isNaN(m) && m >= totalVenta() ? `Vuelto: ${soles(m - totalVenta())}` : '';
  }

  function validarPago() {
    const medio = $('input[name=medio]:checked').value;
    let ok = true;
    if (medio === 'EFECTIVO') {
      const m = parseFloat($('#payCash').value);
      ok = setError($('#payCash'), $('#payCashErr'), isNaN(m) ? 'Ingrese el monto recibido.' : m < totalVenta() ? `El monto no cubre el total (${soles(totalVenta())}).` : '') && ok;
    } else {
      const ref = $('#payRef').value.trim();
      ok = setError($('#payRef'), $('#payRefErr'), REGEX_REF.test(ref) ? (/^\d{13,19}$/.test(ref) ? 'No ingrese números de tarjeta: use el código de operación de la pasarela.' : '') : 'Ingrese el código de operación (6 a 20 letras o números).') && ok;
    }
    if ($('#payTipoComp').value === 'FACTURA') {
      ok = setError($('#payRuc'), $('#payRucErr'), REGEX_DOC.RUC.test($('#payRuc').value.trim()) ? '' : MSG_DOC.RUC) && ok;
    }
    if (!ok) { const p = $('#payForm [aria-invalid="true"]'); if (p) p.focus(); }
    return ok ? { medio, referencia: medio === 'EFECTIVO' ? null : $('#payRef').value.trim(), tipo: $('#payTipoComp').value, ruc: $('#payRuc').value.trim() || null } : null;
  }

  async function cobrar(ev) {
    ev.preventDefault();
    const p = validarPago(); if (!p) return;
    const ok = await confirmar('Confirmar cobro', `Se cobrará ${soles(totalVenta())} en ${p.medio.toLowerCase()} y se emitirá ${p.tipo === 'FACTURA' ? 'una factura' : 'el boleto de viaje'}. Esta acción genera un comprobante electrónico.`, false, 'Cobrar y emitir', 'btn-primary');
    if (!ok) return;
    const btn = $('#btnCobrar'); btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
    await espera(700);
    btn.removeAttribute('aria-busy'); btn.disabled = false;

    let b;
    if (venta.reservaId) {
      b = state.boletos.find(x => x.id_boleto === venta.reservaId);
      if (!b || b.estado !== 'RESERVADO') { toast('La reserva ya no está vigente: el asiento fue liberado.', 'err'); venta = nuevaVenta(); location.hash = '#reservas'; return; }
      b.estado = 'VENDIDO'; b.fecha_hora_expiracion = null; b.fecha_hora_venta = new Date().toISOString(); b.vendedor = usuario().nombre;
    } else {
      if (asientoOcupado(venta.viaje.id_viaje, venta.asiento.numero)) { toast('El asiento acaba de ser tomado por otra venta. Elija otro.', 'err'); mostrarPaso(2); return; }
      b = crearBoleto(venta.viaje, venta.asiento, venta.cliente.id_cliente, 'VENDIDO', 'AGENCIA', usuario().nombre);
    }
    registrarPago(b, p.medio, p.referencia, b.precio);
    const comp = emitirComprobante(b, p.tipo, p.ruc);
    auditar('VENTA', `Boleto ${b.codigo} · ${comp.serie}-${String(comp.numero).padStart(8, '0')} · ${soles(b.precio)} · ${p.medio}`);
    guardar();
    mostrarComprobante(b);
    if (venta.cliente.correo) toast('Comprobante enviado al correo registrado (simulado).', 'ok');
    venta = nuevaVenta();
    $('#tripResults').innerHTML = '';
    mostrarPaso(1);
  }

  async function reservar() {
    if (asientoOcupado(venta.viaje.id_viaje, venta.asiento.numero)) { toast('El asiento ya no está disponible.', 'err'); mostrarPaso(2); return; }
    const btn = $('#btnReservar'); btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
    await espera(500);
    btn.removeAttribute('aria-busy'); btn.disabled = false;
    const b = crearBoleto(venta.viaje, venta.asiento, venta.cliente.id_cliente, 'RESERVADO', 'AGENCIA', usuario().nombre);
    auditar('RESERVA', `Reserva ${b.codigo} · asiento ${b.numero_asiento} · vence ${hora(b.fecha_hora_expiracion)}`);
    guardar();
    toast(`Reserva ${b.codigo} registrada. Vence a las ${hora(b.fecha_hora_expiracion)}`, "ok");
    venta = nuevaVenta(); $('#tripResults').innerHTML = '';
    location.hash = '#reservas';
  }

  function mostrarComprobante(b) {
    const v = viajePorId(b.id_viaje), r = rutaPorId[v.id_ruta], c = clientePorId(b.id_cliente);
    const comp = state.comprobantes.find(x => x.id_boleto === b.id_boleto);
    const pago = state.pagos.find(x => x.id_boleto === b.id_boleto);
    $('#receiptBody').innerHTML = `<div class="rc-head"><strong>TRANSPORTES HORIZONTE LIBERTEÑO S.A.C.</strong><div class="muted small">Empresa ficticia · comprobante de demostración sin valor tributario</div>
      <h2 id="receiptTitle" style="margin-top:8px">${comp.tipo === 'FACTURA' ? 'Factura electrónica' : 'Boleto de viaje electrónico'}</h2><div>${comp.serie}-${String(comp.numero).padStart(8, '0')}</div></div>
      <dl><dt>Boleto</dt><dd>${b.codigo}</dd><dt>Pasajero</dt><dd>${esc(nombreCliente(c))}</dd><dt>Documento</dt><dd>${c.tipo_documento} ${enmascararDoc(c.numero_documento)}</dd>
      ${comp.ruc_adquiriente ? `<dt>RUC adquiriente</dt><dd>${comp.ruc_adquiriente}</dd>` : ''}
      <dt>Ruta</dt><dd>${esc(agenciaPorCod[r.origen].ciudad)} → ${esc(agenciaPorCod[r.destino].ciudad)}</dd><dt>Salida</dt><dd>${fechaCorta(v.fecha_salida)} ${v.hora_salida}</dd>
      <dt>Asiento</dt><dd>${b.numero_asiento} (${b.tipo_asiento.toLowerCase()}, piso ${b.piso})</dd><dt>Medio de pago</dt><dd>${pago ? pago.medio : '—'}${pago && pago.referencia_externa ? ' · ' + esc(pago.referencia_externa) : ''}</dd>
      <dt>Estado</dt><dd>${b.estado}</dd></dl>
      <div class="rc-total"><span>Total</span><span>${soles(b.precio)}</span></div>
      <div class="actions split"><button class="btn btn-ghost" id="rcPrint">Imprimir</button><button class="btn btn-primary" id="rcClose">Cerrar</button></div>`;
    const dlg = $('#receiptModal'); dlg.showModal();
    $('#rcClose').onclick = () => dlg.close();
    $('#rcPrint').onclick = () => { auditar('REIMPRESION', `Comprobante ${comp.serie}-${comp.numero} impreso`); window.print(); };
  }

  /* ---------- Vista: Reservas ---------- */
  function filaReserva(b, compacta) {
    const v = viajePorId(b.id_viaje), r = rutaPorId[v.id_ruta], c = clientePorId(b.id_cliente);
    return `<div class="list-item"><div class="grow"><strong>${b.codigo}</strong> · ${esc(nombreCliente(c))}
      <div class="muted small">${esc(agenciaPorCod[r.origen].ciudad)} → ${esc(agenciaPorCod[r.destino].ciudad)} · ${fechaCorta(v.fecha_salida)} ${v.hora_salida} · Asiento ${b.numero_asiento} · ${soles(b.precio)}</div></div>
      <div style="text-align:right"><span class="chip chip-warn">Vence en <span class="countdown" data-exp="${b.fecha_hora_expiracion}"></span></span>
      ${compacta ? '' : `<div class="actions" style="margin-top:6px"><button class="btn btn-ghost btn-sm" data-liberar="${b.id_boleto}">Liberar</button><button class="btn btn-primary btn-sm" data-cobrar="${b.id_boleto}">Cobrar</button></div>`}</div></div>`;
  }
  function renderReservas() {
    const lista = state.boletos.filter(b => b.estado === 'RESERVADO');
    $('#reservasList').innerHTML = lista.length ? `<div class="card">${lista.map(b => filaReserva(b, false)).join('')}</div>` :
      '<div class="card">' + estadoVacio('No hay reservas activas', `Use “Solo reservar” en el último paso de la venta para separar un asiento por ${D.MINUTOS_RESERVA} minutos.`, 'M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18') + '<div style="text-align:center"><a class="btn btn-primary" href="#venta">Nueva venta</a></div></div>';
    tickCuentas();
  }
  function tickCuentas() {
    $$('.countdown').forEach(el => {
      const ms = new Date(el.dataset.exp).getTime() - Date.now();
      if (ms <= 0) { el.textContent = '0:00'; return; }
      const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
      el.textContent = `${m}:${String(s).padStart(2, '0')}`;
    });
  }

  /* ---------- Vista: Boletos ---------- */
  const CHIP_ESTADO = { VENDIDO: 'chip-ok', RESERVADO: 'chip-warn', EMBARCADO: 'chip-info', ANULADO: 'chip-err', NO_PRESENTADO: '' };
  function renderBoletos() {
    const q = $('#bSearch').value.trim().toLowerCase(), est = $('#bEstado').value;
    const lista = state.boletos.slice().reverse().filter(b => {
      const c = clientePorId(b.id_cliente);
      if (est && b.estado !== est) return false;
      if (!q) return true;
      return b.codigo.toLowerCase().includes(q) || nombreCliente(c).toLowerCase().includes(q) || (c && c.numero_documento.includes(q));
    });
    if (!lista.length) { $('#boletosTable').innerHTML = '<div class="card">' + estadoVacio('Sin resultados', 'No hay boletos que coincidan con la búsqueda o el filtro.') + '</div>'; return; }
    $('#boletosTable').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Boleto</th><th>Pasajero</th><th>Viaje</th><th>Asiento</th><th>Importe</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>` +
      lista.map(b => {
        const c = clientePorId(b.id_cliente), v = viajePorId(b.id_viaje), r = rutaPorId[v.id_ruta];
        const anulable = (b.estado === 'VENDIDO' || b.estado === 'RESERVADO') && new Date(`${v.fecha_salida}T${v.hora_salida}`) > new Date();
        return `<tr><td data-label="Boleto"><strong>${b.codigo}</strong></td><td data-label="Pasajero">${esc(nombreCliente(c))}<div class="muted small">${c.tipo_documento} ${enmascararDoc(c.numero_documento)}</div></td>
          <td data-label="Viaje">${r.codigo}<div class="muted small">${fechaCorta(v.fecha_salida)} ${v.hora_salida}</div></td><td data-label="Asiento">${b.numero_asiento}</td>
          <td data-label="Importe">${soles(b.precio)}</td><td data-label="Estado"><span class="chip ${CHIP_ESTADO[b.estado]}">${b.estado}</span></td>
          <td class="td-actions">${b.estado === 'VENDIDO' || b.estado === 'EMBARCADO' ? `<button class="btn btn-ghost btn-sm" data-ver="${b.id_boleto}">Comprobante</button>` : ''}${anulable ? `<button class="btn btn-ghost btn-sm" data-anular="${b.id_boleto}" style="color:var(--c-err)">Anular</button>` : ''}${b.estado === 'ANULADO' ? `<span class="muted small">${esc(b.motivo_anulacion || '')}</span>` : ''}</td></tr>`;
      }).join('') + '</tbody></table></div>';
  }

  async function anularBoleto(id) {
    const b = state.boletos.find(x => x.id_boleto === id);
    const motivo = await confirmar('Anular boleto', `Se anulará ${b.codigo} y el asiento ${b.numero_asiento} quedará libre. El registro no se elimina: queda en el historial con el motivo.`, true, 'Anular boleto');
    if (!motivo) return;
    b.estado = 'ANULADO'; b.motivo_anulacion = motivo; b.fecha_hora_expiracion = null;
    auditar('ANULACION', `Boleto ${b.codigo} anulado · motivo: ${motivo}`);
    guardar(); renderBoletos(); actualizarContadores();
    toast(`Boleto ${b.codigo} anulado.`, 'ok');
  }

  /* ---------- Vista: Clientes ---------- */
  function renderClientes() {
    const q = $('#cSearch').value.trim().toLowerCase();
    const lista = state.clientes.filter(c => !q || nombreCliente(c).toLowerCase().includes(q) || c.numero_documento.includes(q));
    if (!lista.length) { $('#clientesTable').innerHTML = '<div class="card">' + estadoVacio('Cliente no encontrado', 'Verifique el documento o registre un cliente nuevo.') + '</div>'; return; }
    const jefe = state.rol === 'JEFE_AGENCIA';
    $('#clientesTable').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Documento</th><th>Cliente</th><th>Teléfono</th><th>Correo</th><th>Promociones</th><th>Acciones</th></tr></thead><tbody>` +
      lista.map(c => `<tr><td data-label="Documento">${c.tipo_documento} ${enmascararDoc(c.numero_documento)}</td><td data-label="Cliente"><strong>${esc(nombreCliente(c))}</strong></td>
        <td data-label="Teléfono">${enmascararTel(c.telefono)}</td><td data-label="Correo">${enmascararCorreo(c.correo)}</td>
        <td data-label="Promociones">${c.acepta_promociones ? '<span class="chip chip-ok">Autorizó</span>' : '<span class="chip">No autorizó</span>'}</td>
        <td class="td-actions"><button class="btn btn-ghost btn-sm" data-editar="${c.id_cliente}">Editar</button>${jefe ? `<button class="btn btn-ghost btn-sm" data-revelar="${c.id_cliente}">Ver datos completos</button>` : ''}</td></tr>`).join('') + '</tbody></table></div>' +
      (jefe ? '' : '<p class="help" style="margin-top:8px">Por privacidad, el agente de ventas solo ve datos enmascarados. La consulta de datos completos está reservada a la jefatura y queda auditada.</p>');
  }

  let clienteEditando = null;
  function abrirCliente(id) {
    clienteEditando = id ? clientePorId(id) : null;
    const f = $('#clienteForm'); f.reset();
    $$('[aria-invalid]', f).forEach(i => i.removeAttribute('aria-invalid')); $$('.field-error', f).forEach(e => e.textContent = '');
    $('#clienteTitle').textContent = id ? 'Editar cliente' : 'Nuevo cliente';
    if (clienteEditando) {
      const c = clienteEditando;
      $('#cTipoDoc').value = c.tipo_documento; $('#cNumDoc').value = c.numero_documento; $('#cNumDoc').disabled = true; $('#cTipoDoc').disabled = true;
      $('#cNombre').value = nombreCliente(c); $('#cTelefono').value = c.telefono || ''; $('#cCorreo').value = c.correo || '';
    } else { $('#cNumDoc').disabled = false; $('#cTipoDoc').disabled = false; }
    actualizarEtiquetaNombre();
    $('#clienteModal').showModal();
  }
  function actualizarEtiquetaNombre() { $('#cNombreLabel').textContent = $('#cTipoDoc').value === 'RUC' ? 'Razón social *' : 'Nombres y apellidos *'; }
  function guardarClienteModal(ev) {
    ev.preventDefault();
    const tipo = $('#cTipoDoc').value, num = $('#cNumDoc').value.trim().toUpperCase(), nom = $('#cNombre').value.trim();
    const tel = $('#cTelefono').value.trim(), mail = $('#cCorreo').value.trim();
    let ok = true;
    if (!clienteEditando) {
      const dup = state.clientes.some(c => c.tipo_documento === tipo && c.numero_documento === num);
      ok = setError($('#cNumDoc'), $('#cNumDocErr'), !REGEX_DOC[tipo].test(num) ? MSG_DOC[tipo] : dup ? 'Ya existe un cliente con este documento.' : '') && ok;
    }
    ok = setError($('#cNombre'), $('#cNombreErr'), tipo === 'RUC' ? (nom.length >= 3 ? '' : 'Ingrese la razón social.') : (REGEX_NOMBRE.test(nom) && nom.includes(' ') ? '' : 'Ingrese nombres y apellidos (solo letras).')) && ok;
    ok = setError($('#cTelefono'), $('#cTelefonoErr'), !tel || REGEX_TEL.test(tel) ? '' : 'Formato: +51 seguido de 9 dígitos.') && ok;
    ok = setError($('#cCorreo'), $('#cCorreoErr'), !mail || REGEX_CORREO.test(mail) ? '' : 'Correo no válido.') && ok;
    if (!ok) { const p = $('#clienteForm [aria-invalid="true"]'); if (p) p.focus(); return; }
    const datos = tipo === 'RUC' ? { razon_social: nom } : { nombres: nom.split(' ')[0], apellidos: nom.split(' ').slice(1).join(' ') };
    Object.assign(datos, { telefono: tel ? tel.replace(' ', '') : null, correo: mail || null });
    if (clienteEditando) { Object.assign(clienteEditando, datos); auditar('ACTUALIZA_CLIENTE', `Cliente ${enmascararDoc(clienteEditando.numero_documento)} editado`); toast('Cliente actualizado.', 'ok'); }
    else { state.seq.cliente++; state.clientes.push({ id_cliente: state.seq.cliente, tipo_documento: tipo, numero_documento: num, acepta_promociones: false, ...datos }); auditar('ALTA_CLIENTE', `Cliente ${enmascararDoc(num)} registrado`); toast('Cliente registrado.', 'ok'); }
    guardar(); $('#clienteModal').close(); renderClientes();
  }

  async function revelarCliente(id) {
    const c = clientePorId(id);
    const motivo = await confirmar('Ver datos completos', 'Indique por qué necesita ver los datos completos. La consulta quedará en el registro de auditoría.', true, 'Ver datos', 'btn-primary');
    if (!motivo) return;
    auditar('ACCESO_DATOS', `Datos completos de ${enmascararDoc(c.numero_documento)} consultados · motivo: ${motivo}`);
    await confirmar('Datos del cliente', `${nombreCliente(c)} · ${c.tipo_documento} ${c.numero_documento} · Tel. ${c.telefono || '—'} · ${c.correo || 'sin correo'}`, false, 'Cerrar', 'btn-primary', true);
  }

  /* ---------- Vista: Caja ---------- */
  function renderCaja() {
    const cont = $('#cajaContent');
    if (state.rol !== 'JEFE_AGENCIA') {
      cont.innerHTML = '<div class="card">' + estadoVacio('Acceso restringido', 'El cierre de caja corresponde al jefe de agencia (control de acceso por rol, RNF-007). Cambie el rol en el encabezado para la demostración.', 'M6 10V8a6 6 0 1 1 12 0v2M5 10h14v10H5z') + '</div>';
      return;
    }
    const hoyStr = D.isoDate(HOY);
    const cerrado = state.cierres.find(c => c.agencia === state.agencia && c.fecha === hoyStr);
    const pagos = state.pagos.filter(p => p.agencia === state.agencia && p.fecha_hora.slice(0, 10) === hoyStr && (state.boletos.find(b => b.id_boleto === p.id_boleto) || {}).estado !== 'ANULADO');
    const por = m => pagos.filter(p => p.medio === m).reduce((s, p) => s + p.monto, 0);
    const anulados = state.boletos.filter(b => b.agencia === state.agencia && b.estado === 'ANULADO' && b.fecha_hora_venta.slice(0, 10) === hoyStr && state.pagos.some(p => p.id_boleto === b.id_boleto));
    const efectivo = por('EFECTIVO'), total = pagos.reduce((s, p) => s + p.monto, 0);
    cont.innerHTML = `<div class="kpis">
      <div class="kpi"><span>Efectivo esperado</span><strong>${soles(efectivo)}</strong></div>
      <div class="kpi"><span>Tarjeta</span><strong>${soles(por('TARJETA'))}</strong></div>
      <div class="kpi"><span>Billetera</span><strong>${soles(por('BILLETERA'))}</strong></div>
      <div class="kpi"><span>Total del día</span><strong>${soles(total)}</strong><small>${pagos.length} pago(s) · ${anulados.length} anulación(es)</small></div></div>
      ${cerrado ? `<div class="card"><div class="alert alert-info">Caja cerrada a las ${hora(cerrado.fecha_hora)} por ${esc(cerrado.usuario)}. Declarado: ${soles(cerrado.efectivo_declarado)} · Diferencia: ${soles(cerrado.diferencia)}.</div>${estadoVacio('Cierre registrado', 'No se aceptan nuevas modificaciones del cierre de hoy.', 'M5 12l5 5L20 7')}</div>` :
      `<form class="card" id="cajaForm" novalidate><header class="card-head"><h2>Arqueo de efectivo</h2></header>
        <div class="form-grid"><div class="field"><label for="cajaDeclarado">Efectivo contado (S/) *</label><input id="cajaDeclarado" type="number" step="0.10" min="0" inputmode="decimal" aria-describedby="cajaErr cajaDif"><span class="field-error" id="cajaErr"></span><small class="help" id="cajaDif"></small></div>
        <div class="field"><label for="cajaObs">Observaciones</label><input id="cajaObs" maxlength="200" placeholder="Opcional; obligatorio si hay diferencia"></div></div>
        <div class="actions"><button class="btn btn-primary" type="submit">Cerrar caja</button></div></form>`}`;
    const f = $('#cajaForm'); if (!f) return;
    $('#cajaDeclarado').addEventListener('input', () => { const d = parseFloat($('#cajaDeclarado').value) - efectivo; $('#cajaDif').textContent = isNaN(d) ? '' : `Diferencia: ${soles(d)}${d === 0 ? ' (cuadra)' : d > 0 ? ' (sobrante)' : ' (faltante)'}`; });
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const dec = parseFloat($('#cajaDeclarado').value), obs = $('#cajaObs').value.trim();
      const dif = Math.round((dec - efectivo) * 100) / 100;
      if (!setError($('#cajaDeclarado'), $('#cajaErr'), isNaN(dec) || dec < 0 ? 'Ingrese el efectivo contado.' : dif !== 0 && !obs ? 'Hay diferencia: explique el motivo en observaciones.' : '')) return;
      const ok = await confirmar('Cerrar caja', `Se registrará el cierre de ${agenciaPorCod[state.agencia].nombre} con una diferencia de ${soles(dif)}. Después no se podrá modificar.`, false, 'Cerrar caja', 'btn-primary');
      if (!ok) return;
      state.cierres.push({ agencia: state.agencia, fecha: hoyStr, fecha_hora: new Date().toISOString(), usuario: usuario().nombre, efectivo_esperado: efectivo, efectivo_declarado: dec, diferencia: dif, observacion: obs || null });
      auditar('CIERRE_CAJA', `Cierre ${state.agencia} · esperado ${soles(efectivo)} · declarado ${soles(dec)} · diferencia ${soles(dif)}`);
      guardar(); renderCaja(); toast('Cierre de caja registrado.', 'ok');
    });
  }

  /* ---------- Vista: Privacidad ---------- */
  function renderPrivacidad() {
    $('#auditCount').textContent = `${state.auditoria.length} evento(s)`;
    $('#auditLog').innerHTML = state.auditoria.length ? state.auditoria.map(a => `<div class="audit-row"><time datetime="${a.ts}">${new Date(a.ts).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time><strong>${a.accion}</strong> · ${esc(a.detalle)}<div class="muted small">${esc(a.usuario)}</div></div>`).join('') :
      estadoVacio('Sin eventos todavía', 'Las ventas, anulaciones y consultas de datos personales se registrarán aquí.');
  }

  /* ---------- Diálogo de confirmación genérico ---------- */
  function confirmar(titulo, texto, pideMotivo, textoOk = 'Confirmar', claseOk = 'btn-danger', soloInfo = false) {
    return new Promise(resolve => {
      const dlg = $('#confirmModal');
      $('#confirmTitle').textContent = titulo; $('#confirmText').textContent = texto;
      $('#confirmReasonField').hidden = !pideMotivo;
      $('#confirmReason').value = ''; $('#confirmReason').removeAttribute('aria-invalid'); $('#confirmReasonErr').textContent = '';
      const ok = $('#confirmOk'); ok.textContent = textoOk; ok.className = 'btn ' + claseOk;
      dlg.querySelector('[value=cancel]').hidden = soloInfo;
      const alCerrar = () => {
        dlg.removeEventListener('close', alCerrar);
        if (dlg.returnValue !== 'ok') return resolve(false);
        resolve(pideMotivo ? $('#confirmReason').value.trim() : true);
      };
      ok.onclick = e => {
        if (pideMotivo && $('#confirmReason').value.trim().length < 5) {
          e.preventDefault(); setError($('#confirmReason'), $('#confirmReasonErr'), 'Escriba un motivo de al menos 5 caracteres.'); $('#confirmReason').focus();
        }
      };
      dlg.addEventListener('close', alCerrar);
      dlg.returnValue = '';
      dlg.showModal();
    });
  }

  /* ---------- Eventos ---------- */
  function enlazar() {
    window.addEventListener('hashchange', irA);
    $('#menuToggle').addEventListener('click', () => $('#sidebar').classList.contains('open') ? cerrarMenu() : abrirMenu());
    $('#scrim').addEventListener('click', cerrarMenu);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarMenu(); });
    $('#roleSelect').addEventListener('change', e => { state.rol = e.target.value; auditar('CAMBIO_ROL', `Sesión de demostración cambia a ${state.rol}`); renderEncabezado(); irA(); });
    $('#agencySelect').addEventListener('change', e => { state.agencia = e.target.value; guardar(); irA(); });
    $$('[data-open]').forEach(b => b.addEventListener('click', () => $('#' + b.dataset.open).showModal()));

    $('#searchForm').addEventListener('submit', buscarViajes);
    $('#tripResults').addEventListener('click', e => {
      const b = e.target.closest('[data-viaje]'); if (!b) return;
      venta = nuevaVenta(); venta.viaje = viajePorId(Number(b.dataset.viaje)); mostrarPaso(2);
    });
    $('#seatMap').addEventListener('click', e => {
      const b = e.target.closest('.seat'); if (!b || b.disabled) return;
      venta.asiento = D.asientosDeBus(busPorId[venta.viaje.id_bus]).find(a => a.numero === Number(b.dataset.seat));
      $$('.seat[aria-pressed="true"]').forEach(s => s.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      renderResumenAsiento();
    });
    $('#seatSummary').addEventListener('click', e => { if (e.target.id === 'btnAsientoOk') mostrarPaso(3); });
    $$('[data-back]').forEach(b => b.addEventListener('click', () => mostrarPaso(Number(b.dataset.back))));
    $('#btnBuscarCliente').addEventListener('click', buscarCliente);
    $('#pTipoDoc').addEventListener('change', () => { $('#pNumDoc').inputMode = $('#pTipoDoc').value === 'DNI' ? 'numeric' : 'text'; });
    $('#paxForm').addEventListener('submit', e => {
      e.preventDefault();
      const datos = validarPasajero(); if (!datos) return;
      venta.cliente = guardarCliente(datos);
      mostrarPaso(4);
    });
    $$('input[name=medio]').forEach(r => r.addEventListener('change', actualizarMedio));
    $('#payTipoComp').addEventListener('change', actualizarMedio);
    $('#payCash').addEventListener('input', actualizarVuelto);
    $('#payForm').addEventListener('submit', cobrar);
    $('#btnReservar').addEventListener('click', reservar);

    $('#reservasList').addEventListener('click', async e => {
      const lib = e.target.closest('[data-liberar]'), cob = e.target.closest('[data-cobrar]');
      if (lib) {
        const b = state.boletos.find(x => x.id_boleto === Number(lib.dataset.liberar));
        if (await confirmar('Liberar reserva', `El asiento ${b.numero_asiento} de la reserva ${b.codigo} quedará disponible para otros clientes.`, false, 'Liberar')) {
          b.estado = 'ANULADO'; b.motivo_anulacion = 'Reserva liberada por el agente'; auditar('RESERVA_LIBERADA', `Reserva ${b.codigo} liberada`); guardar(); renderReservas(); toast('Reserva liberada.', 'ok');
        }
      }
      if (cob) {
        const b = state.boletos.find(x => x.id_boleto === Number(cob.dataset.cobrar));
        const v = viajePorId(b.id_viaje);
        venta = { viaje: v, asiento: D.asientosDeBus(busPorId[v.id_bus]).find(a => a.numero === b.numero_asiento), cliente: clientePorId(b.id_cliente), reservaId: b.id_boleto };
        location.hash = '#venta'; setTimeout(() => mostrarPaso(4), 0);
      }
    });
    $('#bSearch').addEventListener('input', renderBoletos);
    $('#bEstado').addEventListener('change', renderBoletos);
    $('#boletosTable').addEventListener('click', e => {
      const v = e.target.closest('[data-ver]'), a = e.target.closest('[data-anular]');
      if (v) mostrarComprobante(state.boletos.find(x => x.id_boleto === Number(v.dataset.ver)));
      if (a) anularBoleto(Number(a.dataset.anular));
    });
    $('#cSearch').addEventListener('input', renderClientes);
    $('#btnNuevoCliente').addEventListener('click', () => abrirCliente(null));
    $('#cTipoDoc').addEventListener('change', actualizarEtiquetaNombre);
    $('#clienteForm').addEventListener('submit', guardarClienteModal);
    $('#clienteCancel').addEventListener('click', () => $('#clienteModal').close());
    $('#clientesTable').addEventListener('click', e => {
      const ed = e.target.closest('[data-editar]'), rv = e.target.closest('[data-revelar]');
      if (ed) abrirCliente(Number(ed.dataset.editar));
      if (rv) revelarCliente(Number(rv.dataset.revelar));
    });
    // Interruptor de demostración para el estado de error de red
    const nota = $('.sidebar-note');
    nota.insertAdjacentHTML('afterend', `<label class="check small" style="padding:0 12px"><input type="checkbox" id="chkFalla" ${simularFalla ? 'checked' : ''}><span>Simular falla de conexión (demostración de estado de error)</span></label>`);
    $('#chkFalla').addEventListener('change', e => { simularFalla = e.target.checked; });
  }

  /* ---------- Arranque ---------- */
  enlazar();
  liberarVencidas();
  renderEncabezado();
  irA();
  setInterval(() => { tickCuentas(); if (liberarVencidas()) { const v = (location.hash || '#inicio').slice(1); if (v !== 'venta') render(v); } }, 1000);
})();
