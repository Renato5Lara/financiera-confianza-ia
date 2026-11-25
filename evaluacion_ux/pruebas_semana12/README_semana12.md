# Interfaz del módulo Ventas y Atención — ERP Transportes Horizonte Liberteño

Prototipo funcional del frontend del ERP para la venta y reserva de pasajes, la gestión de clientes y el cierre de caja.
Está escrito con **HTML5, CSS3 y JavaScript**, sin bibliotecas externas, y se adapta a navegador de escritorio y a móvil.

> **Datos simulados.** La interfaz no está conectada a PostgreSQL: no existe todavía una API del ERP.
> Usa datos ficticios (`js/data.js`) con los mismos nombres de tablas y columnas del Modelo Relacional y guarda
> las operaciones de la demostración en el `localStorage` del navegador. Ningún dato corresponde a personas reales.
> El comprobante que muestra no tiene valor tributario.

## Estructura

```
codigo_fuente/
├── index.html        Estructura semántica: encabezado, menú lateral, barra inferior móvil, 7 vistas y diálogos
├── css/styles.css    Estilos mobile-first; puntos de quiebre en 640 px y 1024 px
└── js/
    ├── data.js       Datos simulados (agencias, rutas, vehículos, asientos, clientes ficticios)
    └── app.js        Navegación, asistente de venta, validaciones, estados, roles, auditoría
capturas_escritorio/  Capturas reales D01–D15 (1366×768) y C01 (estructura del código)
capturas_movil/       Capturas reales M01–M15 (390×844, emulación de dispositivo en Chrome)
pruebas/
├── capturar.js           Guion de pruebas funcionales y capturas (Puppeteer + Chrome sin interfaz)
├── axe_check.js          Inspección automática de accesibilidad (axe-core, WCAG 2.1 A/AA)
├── resultado_pruebas.txt Resultado de la última ejecución: 60 de 60 comprobaciones
└── resultado_axe*.json   Resultados de accesibilidad inicial y final
```

## Cómo ejecutarla

Se recomienda un servidor local (los diálogos y el almacenamiento local funcionan mejor así que con `file://`):

```bash
cd codigo_fuente
python -m http.server 8765
# abrir http://localhost:8765/index.html
```

Parámetros útiles en la dirección:

- `?reset=1` borra los datos de la demostración y vuelve al estado inicial.
- `?fallo=1` simula una falla de conexión para ver el estado de error (también hay un interruptor en el menú).

Para la vista móvil, abrir las herramientas de desarrollo del navegador y activar la emulación de dispositivo (390 × 844).

## Vistas y funciones

| Vista | Función | Requisitos |
|---|---|---|
| Inicio | Indicadores del día, próximas salidas, reservas por vencer | Apoyo a RF-004 y RF-010 |
| Vender pasaje | Asistente: viaje → asiento → pasajero → pago; reserva con vencimiento | RF-001 a RF-004, RF-008, RF-009 |
| Reservas | Cuenta regresiva, cobro posterior, liberación | RF-003 |
| Boletos | Búsqueda, filtro, comprobante, anulación con motivo | RF-005, RF-009 |
| Clientes | Alta y edición, datos enmascarados, consulta justificada | RF-001, RNF-011 |
| Cierre de caja | Totales por medio de pago y arqueo (solo jefe de agencia) | RF-010, RNF-007 |
| Privacidad y auditoría | Medidas activas y registro de acciones | RNF-008, RNF-011 |

Use el selector de rol del encabezado para alternar entre **Agente de ventas** y **Jefe de agencia**.

## Repetir las pruebas

Requiere Node.js, `puppeteer-core`, Google Chrome y, para accesibilidad, `axe-core`. Las rutas a Chrome y a los módulos
están fijadas al entorno donde se ejecutaron; ajústelas antes de usar los guiones.

```bash
node pruebas/capturar.js     # 60 comprobaciones y capturas
node pruebas/axe_check.js    # accesibilidad por vista
```

## Limitaciones conocidas

- Sin conexión a la base de datos ni API; sin envío real de comprobantes a SUNAT/OSE ni de correos.
- El plazo de reserva (15 min) es provisional: RF-003 lo deja POR DEFINIR por la empresa.
- No implementa la operación sin conexión (RNF-005) ni atajos de teclado.
- No se hicieron pruebas con usuarios reales; la evaluación fue una inspección heurística.
