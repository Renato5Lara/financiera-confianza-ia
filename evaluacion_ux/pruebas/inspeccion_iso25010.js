/**
 * inspeccion_iso25010.js
 * Inspección técnica automatizada de la interfaz del módulo Ventas y Atención (ERP de transporte)
 * como evidencia para la evaluación con ISO/IEC 25010:2023. NO reemplaza pruebas con usuarios.
 *
 * Uso: node pruebas/inspeccion_iso25010.js <url_base> <etiqueta> <carpeta_capturas>
 *   ej.: node pruebas/inspeccion_iso25010.js http://127.0.0.1:8765 original capturas/original
 * Requiere: playwright (Chromium) y axe-core (ruta en la variable AXE_PATH o ../tools).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const ETIQ = process.argv[3] || 'original';
const OUT = process.argv[4] || `capturas/${ETIQ}`;
const AXE = process.env.AXE_PATH || path.resolve(__dirname, '../../../tools/node_modules/axe-core/axe.min.js');
fs.mkdirSync(OUT, { recursive: true });
const R = { etiqueta: ETIQ, fecha: new Date().toISOString(), resultados: [] };
const ok = (criterio, pasa, detalle) => { R.resultados.push({ criterio, pasa, detalle }); console.log(`${pasa ? 'PASA ' : 'FALLA'} · ${criterio} · ${detalle}`); };

async function axe(page, vista) {
  await page.addScriptTag({ path: AXE });
  const r = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map(v => ({ id: v.id, impacto: v.impact, nodos: v.nodes.length })));
  ok(`Accesibilidad automática (axe-core, WCAG 2.2 A/AA) · ${vista}`, r.length === 0, r.length ? JSON.stringify(r) : 'sin infracciones');
  return r;
}

async function venta(page) {
  await page.goto(`${BASE}/index.html?reset=1#venta`); await page.reload(); await page.waitForTimeout(300);
  const opts = await page.$$eval('#fOrigen option', o => o.map(x => x.value).filter(Boolean));
  await page.selectOption('#fOrigen', opts[0]);
  const dest = await page.$$eval('#fDestino option', o => o.map(x => x.value).filter(Boolean));
  await page.selectOption('#fDestino', dest.find(d => d !== opts[0]));
  await page.click('#searchForm button[type=submit]'); await page.waitForTimeout(1600);
}

(async () => {
  const browser = await chromium.launch();
  // ---------- ESCRITORIO ----------
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  const t0 = Date.now();
  await page.goto(`${BASE}/index.html?reset=1`, { waitUntil: 'load' });
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const rs = performance.getEntriesByType('resource');
    return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), bytes: rs.reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0) + (n.transferSize || n.encodedBodySize || 0), recursos: rs.length + 1 }; });
  ok('Eficiencia de desempeño · comportamiento temporal (carga local)', nav.load < 1000, `DOMContentLoaded=${nav.dcl} ms, load=${nav.load} ms`);
  ok('Eficiencia de desempeño · utilización de recursos', nav.bytes < 200000, `${(nav.bytes / 1024).toFixed(1)} KB en ${nav.recursos} archivos; sin bibliotecas externas`);
  R.desempeno = nav; R.tiempo_total_ms = Date.now() - t0;
  await page.screenshot({ path: `${OUT}/E01_panel_escritorio.png` });
  await axe(page, 'panel');
  // Navegación por teclado: tras cargar, el foco debe quedar en el contenido principal o el primer Tab llevar a "Saltar al contenido"
  await page.goto(`${BASE}/index.html`); await page.waitForTimeout(300);
  const focoInicial = await page.evaluate(() => document.activeElement && document.activeElement.id);
  await page.keyboard.press('Tab');
  const primer = await page.evaluate(() => document.activeElement && document.activeElement.textContent.trim().slice(0, 40));
  ok('Capacidad de interacción · operabilidad con teclado', focoInicial === 'main' || /Saltar/.test(primer), `foco inicial en "#${focoInicial}"; primer Tab: "${primer}"`);
  // Textos técnicos visibles al usuario final (autodescriptividad)
  const codigos = await page.evaluate(() => [...document.querySelectorAll('.view-head p.muted')].map(p => p.textContent).filter(t => /RF-|RNF-|Proceso P\d/.test(t)));
  ok('Capacidad de interacción · autodescriptividad (sin jerga técnica en pantalla)', codigos.length === 0, codigos.length ? `${codigos.length} subtítulos muestran códigos de requisitos: "${codigos[0]}"` : 'subtítulos orientados a la tarea');

  // Flujo de venta
  await venta(page);
  await page.screenshot({ path: `${OUT}/E02_resultados_viajes.png` });
  await page.click('#tripResults button'); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/E03_mapa_asientos.png` });
  const fuenteAsiento = await page.$eval('.seat small', e => parseFloat(getComputedStyle(e).fontSize));
  ok('Capacidad de interacción · legibilidad del mapa de asientos', fuenteAsiento >= 12, `texto secundario del asiento = ${fuenteAsiento.toFixed(1)} px`);
  const patron = await page.$eval('.seat.reserved, .seat.taken', e => getComputedStyle(e).backgroundImage);
  ok('Capacidad de interacción · inclusividad (estado no depende solo del color)', patron && patron !== 'none', patron && patron !== 'none' ? 'ocupados/reservados con textura además del color' : 'ocupado y reservado se distinguen solo por color');
  await page.click('.seat:not([disabled])'); await page.waitForTimeout(200);
  const cont = await page.$('#seatSummary button.btn-primary'); if (cont) await cont.click(); await page.waitForTimeout(300);
  // Protección contra errores: cambiar de vista con datos escritos no debe perder la venta en curso
  await page.fill('#pNombres', 'Prueba');
  await page.click('.sidebar a[data-view="boletos"]'); await page.waitForTimeout(300);
  await page.click('.sidebar a[data-view="venta"]'); await page.waitForTimeout(400);
  const conserva = await page.evaluate(() => ({ paso: [...document.querySelectorAll('.step-panel')].find(x => !x.hidden)?.dataset.panel, nombre: document.querySelector('#pNombres').value }));
  ok('Capacidad de interacción · protección contra errores del usuario (venta en curso)', conserva.paso === '3' && conserva.nombre === 'Prueba', `al volver: paso ${conserva.paso}, nombre "${conserva.nombre}"`);
  // Validación del formulario de pasajero vacío
  await venta(page); await page.click('#tripResults button'); await page.waitForTimeout(300);
  await page.click('.seat:not([disabled])'); const c2 = await page.$('#seatSummary button.btn-primary'); if (c2) await c2.click(); await page.waitForTimeout(300);
  await page.click('#paxForm button[type=submit]'); await page.waitForTimeout(300);
  const errs = await page.$$eval('#paxForm .field-error', e => e.filter(x => x.textContent.trim()).length);
  const focoErr = await page.evaluate(() => document.activeElement && document.activeElement.id);
  ok('Adecuación funcional · corrección (validación de datos obligatorios)', errs >= 3, `${errs} mensajes de error; foco en "${focoErr}"`);
  await page.screenshot({ path: `${OUT}/E04_validacion_pasajero.png` });
  await axe(page, 'formulario de pasajero con errores');
  // Seguridad: el selector de rol está disponible a cualquier usuario
  const rolVisible = await page.isVisible('#roleSelect');
  const rolEtiq = await page.evaluate(() => { const s = document.querySelector('.role-switch'); return s ? s.textContent : ''; });
  ok('Seguridad · autenticidad y control de acceso (cambio de rol)', !rolVisible || /demostraci/i.test(rolEtiq), rolVisible ? (/demostraci/i.test(rolEtiq) ? 'selector marcado como modo demostración' : 'cualquier usuario puede cambiar a Jefe de agencia desde el encabezado') : 'sin selector de rol');
  // Fiabilidad: tolerancia a fallos de conexión
  await page.goto(`${BASE}/index.html?reset=1&fallo=1#venta`); await page.reload(); await page.waitForTimeout(300);
  const o2 = await page.$$eval('#fOrigen option', o => o.map(x => x.value).filter(Boolean));
  await page.selectOption('#fOrigen', o2[0]); const d2 = await page.$$eval('#fDestino option', o => o.map(x => x.value).filter(Boolean));
  await page.selectOption('#fDestino', d2.find(d => d !== o2[0])); await page.click('#searchForm button[type=submit]'); await page.waitForTimeout(1800);
  const reintento = await page.$eval('#tripResults', e => /reintentar|intentar/i.test(e.textContent)).catch(() => false);
  ok('Fiabilidad · tolerancia a fallos (falla simulada de conexión)', reintento, reintento ? 'mensaje de error con opción de reintento' : 'sin mensaje de recuperación');
  await page.screenshot({ path: `${OUT}/E05_estado_error.png` });
  ok('Fiabilidad · ausencia de fallos (errores de JavaScript)', errores.length === 0, errores.length ? errores.join(' | ') : '0 errores en consola');
  await ctx.close();

  // ---------- MÓVIL ----------
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  await mp.goto(`${BASE}/index.html?reset=1`); await mp.waitForTimeout(300);
  const ancho = await mp.evaluate(() => document.documentElement.scrollWidth);
  ok('Flexibilidad · adaptabilidad (sin desbordamiento horizontal en 390 px)', ancho <= 390, `scrollWidth=${ancho}`);
  const pequenos = await mp.evaluate(() => [...document.querySelectorAll('button, a, select, input')].filter(e => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && (r.height < 24 || r.width < 24) && !e.classList.contains('skip-link'); }).map(e => (e.id || e.className || e.tagName) + ` ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
  ok('Capacidad de interacción · objetivos táctiles ≥ 24 px (WCAG 2.2, 2.5.8)', pequenos.length === 0, pequenos.length ? pequenos.slice(0, 5).join('; ') : 'todos los controles visibles miden al menos 24 × 24 px');
  await mp.screenshot({ path: `${OUT}/M01_panel_movil.png` });
  await mp.click('#menuToggle'); await mp.waitForTimeout(300); await mp.screenshot({ path: `${OUT}/M02_menu_movil.png` });
  await mp.keyboard.press('Escape'); await mp.waitForTimeout(200);
  await mp.goto(`${BASE}/index.html#venta`); await mp.waitForTimeout(300);
  const o3 = await mp.$$eval('#fOrigen option', o => o.map(x => x.value).filter(Boolean));
  await mp.selectOption('#fOrigen', o3[0]); const d3 = await mp.$$eval('#fDestino option', o => o.map(x => x.value).filter(Boolean));
  await mp.selectOption('#fDestino', d3.find(d => d !== o3[0])); await mp.click('#searchForm button[type=submit]'); await mp.waitForTimeout(1600);
  await mp.click('#tripResults button'); await mp.waitForTimeout(400);
  await mp.screenshot({ path: `${OUT}/M03_asientos_movil.png` });
  await axe(mp, 'móvil · mapa de asientos');
  await m.close(); await browser.close();
  const pasan = R.resultados.filter(r => r.pasa).length;
  R.resumen = `${pasan} de ${R.resultados.length} criterios cumplidos`;
  console.log(R.resumen);
  fs.writeFileSync(path.resolve(OUT, '..', `resultado_inspeccion_${ETIQ}.json`), JSON.stringify(R, null, 1));
})();
