// Prueba funcional y capturas de la interfaz con Chrome sin cabeza (emulación de viewport).
const puppeteer = require('/home/claude/tools/bpmn/node_modules/puppeteer-core');
const fs = require('fs');
const BASE = 'http://localhost:8765/index.html';
const OUT = '/home/claude/ui/capturas';
const log = [];
const ok = (cond, msg) => { log.push((cond ? 'PASA ' : 'FALLA') + ' · ' + msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sinDesborde(page, etiqueta) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  ok(r.sw <= r.w, `${etiqueta}: sin desbordamiento horizontal (scrollWidth ${r.sw} ≤ ${r.w})`);
}
async function shot(page, nombre, full = false, toasts = false) {
  if (typeof full === 'string') {   // captura del viewport con la sección indicada al inicio (sin fullPage: evita duplicar elementos fijos)
    await page.$eval(full, e => { const y = e.getBoundingClientRect().top + window.scrollY - 72; window.scrollTo(0, Math.max(0, y)); });
    full = false;
  }
  await sleep(250);
  if (!toasts) await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await page.screenshot({ path: `${OUT}/${nombre}.png`, fullPage: full });
}
async function clic(page, sel) { await page.$eval(sel, e => e.scrollIntoView({ block: 'center' })); await page.click(sel); }
function manana() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }

async function flujo(browser, modo) {
  const esMovil = modo === 'movil';
  const page = await browser.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await page.emulateTimezone('America/Lima');
  if (esMovil) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
  const P = esMovil ? 'M' : 'D';

  await page.goto(BASE + '?reset=1#inicio', { waitUntil: 'networkidle0' });
  await page.goto(BASE + '#inicio', { waitUntil: 'networkidle0' });
  await sinDesborde(page, `${modo} · panel`);
  const sidebarVisible = await page.evaluate(() => getComputedStyle(document.querySelector('.sidebar')).transform === 'none');
  const bottomVisible = await page.evaluate(() => getComputedStyle(document.querySelector('.bottom-nav')).display !== 'none');
  if (esMovil) ok(!sidebarVisible && bottomVisible, 'móvil: menú lateral oculto y navegación inferior visible');
  else ok(sidebarVisible && !bottomVisible, 'escritorio: menú lateral fijo visible y sin navegación inferior');
  await shot(page, `${P}01_panel_principal`);

  if (esMovil) {
    await clic(page, '#menuToggle');
    await sleep(300);
    ok(await page.$eval('#sidebar', s => s.classList.contains('open')), 'móvil: el botón de menú abre el cajón de navegación');
    await shot(page, 'M02_menu_cajon');
    await page.mouse.click(370, 420); await sleep(300);
    ok(!(await page.$eval('#sidebar', s => s.classList.contains('open'))), 'móvil: tocar fuera del cajón lo cierra');
  }

  // Búsqueda con validación (origen = destino)
  await page.goto(BASE + '#venta', { waitUntil: 'networkidle0' });
  await page.select('#fDestino', 'TRU1');
  await clic(page, '#searchForm button[type=submit]');
  const msgIgual = await page.$eval('#searchError', e => e.textContent);
  ok(/distintos/.test(msgIgual), 'validación: origen y destino iguales se rechazan');

  await page.select('#fDestino', 'LIM1');
  await page.$eval('#fFecha', (e, v) => { e.value = v; }, manana());
  await clic(page, '#searchForm button[type=submit]');
  await sleep(120);
  ok(!!(await page.$('.skeleton')), 'estado de carga: se muestran marcadores mientras se consulta');
  if (!esMovil) await shot(page, 'D02_estado_carga');
  await page.waitForSelector('.trip');
  const nViajes = (await page.$$('.trip')).length;
  ok(nViajes > 0, `búsqueda TRU1→LIM1 devuelve ${nViajes} salida(s)`);
  await shot(page, `${P}${esMovil ? '03' : '03'}_resultados_viajes`, esMovil ? '#tripResults' : false);
  await sinDesborde(page, `${modo} · resultados`);

  await clic(page, '.trip button[data-viaje]');
  await page.waitForSelector('.seat');
  const libre = await page.$('.seat:not([disabled])');
  const numLibre = await libre.evaluate(b => b.dataset.seat);
  await libre.click();
  ok(await libre.evaluate(b => b.getAttribute('aria-pressed') === 'true'), `selección del asiento ${numLibre}`);
  const ocupadoDeshab = await page.$eval('.seat.taken', b => b.disabled);
  ok(ocupadoDeshab, 'asientos ocupados no se pueden seleccionar');
  await shot(page, `${P}04_mapa_asientos`, esMovil ? '.seat-layout' : false);
  await sinDesborde(page, `${modo} · mapa de asientos`);

  await clic(page, '#btnAsientoOk');
  await page.waitForSelector('#paxForm', { visible: true });
  await clic(page, '#paxForm button[type=submit]');
  const nErr = await page.$$eval('#paxForm [aria-invalid="true"]', l => l.length);
  ok(nErr >= 3, `validación del pasajero: ${nErr} campos marcados al enviar vacío`);
  await page.type('#pNumDoc', '1234');
  await clic(page, '#paxForm button[type=submit]');
  ok(/8 dígitos/.test(await page.$eval('#pNumDocErr', e => e.textContent)), 'validación: DNI con menos de 8 dígitos');
  await page.type('#pCorreo', 'correo-malo');
  await clic(page, '#paxForm button[type=submit]');
  await shot(page, `${P}05_validacion_pasajero`, esMovil ? '#paxForm' : false);

  await page.$eval('#pNumDoc', e => { e.value = ''; });
  await page.$eval('#pCorreo', e => { e.value = ''; });
  await page.type('#pNumDoc', '40000002');
  await clic(page, '#btnBuscarCliente');
  ok((await page.$eval('#pNombres', e => e.value)) === 'María', 'búsqueda de cliente existente completa el formulario');
  await clic(page, '#pAviso');
  await clic(page, '#paxForm button[type=submit]');
  await page.waitForSelector('#payForm', { visible: true });

  // Pago con tarjeta: rechaza número de tarjeta
  await clic(page, 'input[value=TARJETA] + span');
  ok(await page.$eval('#cashField', e => getComputedStyle(e).display === 'none') && await page.$eval('#refField', e => getComputedStyle(e).display !== 'none'), 'pago con tarjeta: oculta monto en efectivo y pide código de operación');
  ok(await page.$eval('#rucField', e => getComputedStyle(e).display === 'none'), 'el RUC solo se pide al elegir factura');
  await page.type('#payRef', '4111111111111111');
  await clic(page, '#btnCobrar');
  ok(/tarjeta/.test(await page.$eval('#payRefErr', e => e.textContent)), 'privacidad: se rechaza un número de tarjeta en el código de operación');
  await shot(page, `${P}06_pago_validacion`, esMovil ? '#payForm' : false);
  await page.$eval('#payRef', e => { e.value = ''; });
  await page.type('#payRef', 'OP-882140');
  await clic(page, '#btnCobrar');
  await page.waitForSelector('#confirmModal[open]');
  await shot(page, `${P}07_confirmacion_cobro`);
  await clic(page, '#confirmOk');
  await page.waitForSelector('#receiptModal[open]', { timeout: 5000 });
  ok(true, 'cobro confirmado: se muestra el comprobante');
  await shot(page, `${P}08_comprobante`);
  await clic(page, '#rcClose');

  // Reserva
  await page.select('#fDestino', 'LIM1');
  await page.$eval('#fFecha', (e, v) => { e.value = v; }, manana());
  await clic(page, '#searchForm button[type=submit]');
  await page.waitForSelector('.trip');
  await clic(page, '.trip button[data-viaje]');
  await page.waitForSelector('.seat');
  await clic(page, '.seat:not([disabled]):not([aria-pressed="true"])');
  await clic(page, '#btnAsientoOk');
  await page.waitForSelector('#paxForm', { visible: true });
  await page.type('#pNumDoc', '40000001');
  await clic(page, '#btnBuscarCliente');
  await clic(page, '#pAviso');
  await clic(page, '#paxForm button[type=submit]');
  await page.waitForSelector('#payForm', { visible: true });
  await clic(page, '#btnReservar');
  await page.waitForFunction(() => location.hash === '#reservas');
  await sleep(1200);
  ok((await page.$$('#reservasList .countdown')).length === 1, 'reserva creada con cuenta regresiva de vencimiento');
  await shot(page, `${P}09_reservas`, esMovil ? '#reservasList' : false, true);

  await page.goto(BASE + '#boletos', { waitUntil: 'networkidle0' });
  ok((await page.$$('#boletosTable tbody tr')).length >= 7, 'listado de boletos incluye las operaciones realizadas');
  await sinDesborde(page, `${modo} · boletos`);
  await shot(page, `${P}10_boletos`, esMovil ? '#boletosTable' : false);

  // Anulación con motivo
  await clic(page, '[data-anular]');
  await page.waitForSelector('#confirmModal[open]');
  await clic(page, '#confirmOk');
  ok(/5 caracteres/.test(await page.$eval('#confirmReasonErr', e => e.textContent)), 'anulación exige motivo');
  await page.type('#confirmReason', 'Cliente desiste del viaje');
  if (!esMovil) await shot(page, 'D11_anulacion_motivo');
  await clic(page, '#confirmOk');
  await sleep(300);

  await page.type('#bSearch', 'zzzz');
  ok(!!(await page.$('#boletosTable .state')), 'estado vacío al no haber coincidencias');
  if (esMovil) await shot(page, 'M11_estado_vacio');

  await page.goto(BASE + '#clientes', { waitUntil: 'networkidle0' });
  const docVisible = await page.$eval('#clientesTable tbody td', td => td.textContent);
  ok(docVisible.includes('•'), 'clientes: documento enmascarado para el agente');
  ok(!(await page.$('[data-revelar]')), 'agente de ventas no ve el botón de datos completos');
  await shot(page, `${P}12_clientes`, esMovil ? '#clientesTable' : false);

  await page.goto(BASE + '#caja', { waitUntil: 'networkidle0' });
  ok(!!(await page.$('#cajaContent .state')), 'caja: acceso restringido para el agente');
  await page.select('#roleSelect', 'JEFE_AGENCIA');
  await page.waitForSelector('#cajaForm');
  ok(true, 'caja: el jefe de agencia accede al arqueo');
  await shot(page, `${P}13_cierre_caja`, esMovil ? '#cajaContent' : false);

  await page.goto(BASE + '#clientes', { waitUntil: 'networkidle0' });
  await clic(page, '[data-revelar]');
  await page.waitForSelector('#confirmModal[open]');
  await page.type('#confirmReason', 'Verificación de reclamo del cliente');
  await clic(page, '#confirmOk');
  await sleep(300);
  await clic(page, '#confirmOk');
  await page.goto(BASE + '#privacidad', { waitUntil: 'networkidle0' });
  const eventos = await page.$$eval('.audit-row', l => l.map(x => x.textContent));
  ok(eventos.some(e => e.includes('ACCESO_DATOS')), 'auditoría registra la consulta de datos completos con motivo');
  ok(eventos.some(e => e.includes('ANULACION')), 'auditoría registra la anulación');
  await shot(page, `${P}14_privacidad_auditoria`, esMovil ? '#auditLog' : false);

  // Estado de error
  await page.goto(BASE + '?fallo=1#venta', { waitUntil: 'networkidle0' });
  await page.$eval('#fFecha', (e, v) => { e.value = v; }, manana());
  await clic(page, '#searchForm button[type=submit]');
  await page.waitForSelector('.state-error');
  ok(true, 'estado de error con opción de reintento ante falla de conexión');
  await shot(page, `${P}15_estado_error`);

  ok(errores.length === 0, `${modo}: sin errores de JavaScript en consola` + (errores.length ? ' → ' + errores.join(' | ') : ''));
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--lang=es-PE'] });
  try {
    await flujo(browser, 'escritorio');
    await flujo(browser, 'movil');
  } catch (e) { log.push('FALLA · excepción: ' + e.message); }
  await browser.close();
  fs.writeFileSync('/home/claude/ui/resultado_pruebas.txt', log.join('\n') + '\n');
  console.log(log.join('\n'));
})();
