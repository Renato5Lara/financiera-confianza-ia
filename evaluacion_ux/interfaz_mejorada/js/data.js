/* =========================================================
   DATOS SIMULADOS — uso exclusivamente académico.
   Ningún registro corresponde a una persona real.
   Los nombres de campos siguen el modelo relacional del ERP
   (esquemas ventas.* y operaciones.* en PostgreSQL), para que
   la futura integración con la API reemplace este archivo sin
   cambiar la interfaz.
   ========================================================= */
(function (global) {
  'use strict';

  const agencias = [
    { id_agencia: 1, codigo: 'TRU1', nombre: 'Trujillo – Terminal Central', ciudad: 'Trujillo' },
    { id_agencia: 2, codigo: 'CHI1', nombre: 'Chiclayo – Terminal Norte', ciudad: 'Chiclayo' },
    { id_agencia: 3, codigo: 'LIM1', nombre: 'Lima – Terminal Javier Prado', ciudad: 'Lima' }
  ];

  // operaciones.ruta — mismas rutas y tarifas que 03_Datos_Prueba.sql (tarifa_base_pasaje en soles)
  const rutas = [
    { id_ruta: 1, codigo: 'TRU1-CHI1', origen: 'TRU1', destino: 'CHI1', tarifa_base: 35, duracion_min: 210 },
    { id_ruta: 2, codigo: 'TRU1-LIM1', origen: 'TRU1', destino: 'LIM1', tarifa_base: 70, duracion_min: 540 },
    { id_ruta: 3, codigo: 'LIM1-TRU1', origen: 'LIM1', destino: 'TRU1', tarifa_base: 70, duracion_min: 540 }
  ];

  // operaciones.vehiculo — mismas placas que los datos de prueba; la distribución completa de
  // asientos es simulada (los datos de prueba de la BD solo cargan 4 asientos por vehículo)
  const buses = [
    { id_bus: 1, placa: 'T1A-101', pisos: 2, servicio: 'Bus cama 2 pisos' },
    { id_bus: 2, placa: 'T1B-202', pisos: 1, servicio: 'Bus estándar 1 piso' }
  ];

  // Recargo por tipo de asiento (operaciones.asiento.tipo)
  const recargoAsiento = { CAMA: 20, SEMICAMA: 0, ESTANDAR: 0 };

  // Plantillas de horarios por ruta: [hora, id_bus]
  const horarios = {
    1: [['07:30', 2], ['13:00', 2], ['22:00', 1]],
    2: [['08:00', 1], ['21:30', 1], ['23:00', 2]],
    3: [['09:00', 1], ['22:30', 1]]
  };

  function isoDate(d) {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }

  // Genera operaciones.viaje para hoy y los 7 días siguientes.
  function generarViajes(hoy) {
    const viajes = [];
    let id = 100;
    for (let dia = 0; dia < 8; dia++) {
      const f = new Date(hoy); f.setDate(f.getDate() + dia);
      const fecha = isoDate(f);
      rutas.forEach(r => {
        (horarios[r.id_ruta] || []).forEach(([hora, idBus]) => {
          viajes.push({
            id_viaje: ++id,
            id_ruta: r.id_ruta,
            id_bus: idBus,
            fecha_salida: fecha,
            hora_salida: hora,
            estado: 'PROGRAMADO'
          });
        });
      });
    }
    return viajes;
  }

  // Distribución de asientos según el bus (piso, número, tipo, ubicación)
  function asientosDeBus(bus) {
    const lista = [];
    const ubic = ['VENTANA', 'PASILLO', 'PASILLO', 'VENTANA'];
    if (bus.pisos === 2) {
      for (let n = 1; n <= 12; n++) lista.push({ piso: 1, numero: n, tipo: 'CAMA', ubicacion: ubic[(n - 1) % 4] });
      for (let n = 13; n <= 40; n++) lista.push({ piso: 2, numero: n, tipo: 'SEMICAMA', ubicacion: ubic[(n - 13) % 4] });
    } else {
      for (let n = 1; n <= 36; n++) lista.push({ piso: 1, numero: n, tipo: 'ESTANDAR', ubicacion: ubic[(n - 1) % 4] });
    }
    return lista;
  }

  // Ocupación simulada determinista (misma salida en cada carga)
  function ocupacionSimulada(idViaje, total) {
    const ocupados = new Set();
    let s = idViaje * 9301 + 49297;
    const objetivo = Math.floor(total * (0.25 + (idViaje % 5) * 0.08));
    while (ocupados.size < objetivo) {
      s = (s * 9301 + 49297) % 233280;
      ocupados.add(1 + Math.floor((s / 233280) * total));
    }
    return ocupados;
  }

  // ventas.cliente + persona_natural / persona_juridica (FICTICIOS)
  const clientes = [
    { id_cliente: 1, tipo_documento: 'DNI', numero_documento: '40000001', nombres: 'Juan', apellidos: 'Pérez Ficticio', telefono: '+51987000001', correo: 'juan.ficticio@ejemplo.pe', acepta_promociones: false },
    { id_cliente: 2, tipo_documento: 'DNI', numero_documento: '40000002', nombres: 'María', apellidos: 'Ejemplo Torres', telefono: '+51987000002', correo: null, acepta_promociones: true },
    { id_cliente: 3, tipo_documento: 'CE', numero_documento: '000000123', nombres: 'Lucía', apellidos: 'Muestra Rivas', telefono: null, correo: 'lucia.muestra@ejemplo.pe', acepta_promociones: false },
    { id_cliente: 4, tipo_documento: 'RUC', numero_documento: '20000000001', razon_social: 'Comercial Demo S.A.C.', telefono: '+51944000001', correo: 'compras@demo.pe', acepta_promociones: false },
    { id_cliente: 5, tipo_documento: 'DNI', numero_documento: '40000005', nombres: 'Carlos', apellidos: 'Prueba Salas', telefono: '+51987000005', correo: null, acepta_promociones: false }
  ];

  global.DATOS_SIMULADOS = {
    agencias, rutas, buses, recargoAsiento, clientes,
    generarViajes, asientosDeBus, ocupacionSimulada, isoDate,
    usuarios: {
      AGENTE_VENTAS: { nombre: 'Usuario Demo Ventas', iniciales: 'UV', rol_bd: 'rol_ventas' },
      JEFE_AGENCIA: { nombre: 'Usuario Demo Jefatura', iniciales: 'UJ', rol_bd: 'rol_ventas + aprobación de caja' }
    },
    MINUTOS_RESERVA: 15
  };
})(window);
