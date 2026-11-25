/**
 * prueba_teclado_estado.js
 * Protocolo detallado de operabilidad con teclado y de conservación de la venta al cambiar de vista.
 * Toda la interacción se hace SOLO con teclado (Tab, Shift+Tab, Enter, Espacio, flechas); no hay clics.
 * Uso: node pruebas/prueba_teclado_estado.js <url_base> <etiqueta> <carpeta_capturas>
 */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const ETIQ = process.argv[3] || 'original';
const OUT = process.argv[4] || `capturas/${ETIQ}`;
fs.mkdirSync(OUT, { recursive: true });
const R = { etiqueta: ETIQ, fecha: new Date().toISOString(), pruebas: [] };
const ok = (id, prueba, pasa, detalle) => { R.pruebas.push({ id, prueba, pasa, detalle }); console.log(`${pasa ? 'PASA ' : 'FALLA'} · ${id} · ${prueba} · ${detalle}`); };

// Descripción y visibilidad del foco del elemento activo
const foco = (page) => page.evaluate(() => {
  const el = document.activeElement; if (!el || el === document.body) return { desc: 'body', visible: false, indicador: false };
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  const indicador = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || (cs.boxShadow && cs.boxShadow !== 'none');
  const txt = (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  return { desc: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${txt}"`, visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden',
    indicador, outline: `${cs.outlineStyle} ${cs.outlineWidth}`, id: el.id, view: el.dataset.view || '', cls: el.className || '' };
});
// Avanza con Tab (o Shift+Tab) hasta que el elemento activo cumpla la condición
async function tabHasta(page, cond, max = 120, atras = false) {
  for (let i = 0; i < max; i++) { await page.keyboard.press(atras ? 'Shift+Tab' : 'Tab'); const f = await foco(page); if (cond(f)) return { f, pulsaciones: i + 1 }; }
  return null;
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await page.goto(`${BASE}/index.html?reset=1`); await page.reload(); await page.waitForTimeout(400);

  // T1. Recorrido con Tab: 40 paradas; todas visibles, con indicador de foco y sin trampa de foco
  const inicial = await foco(page);
  const paradas = [];
  for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); paradas.push(await foco(page)); }
  // Al llegar al final del documento el foco pasa al navegador (body) y el ciclo vuelve a empezar: no es una parada de la página
  const vueltas = paradas.filter(p => p.desc === 'body').length;
  const enPagina = paradas.filter(p => p.desc !== 'body');
  const unicos = new Set(enPagina.map(p => p.desc)).size;
  const sinIndicador = enPagina.filter(p => !p.indicador);
  const invisibles = enPagina.filter(p => !p.visible);
  ok('T1', 'Navegación con Tab (40 pulsaciones desde la carga)', unicos >= 10 && invisibles.length === 0, `foco inicial ${inicial.desc}; ${enPagina.length} paradas en ${unicos} elementos distintos; ${vueltas} salidas al navegador al completar el ciclo; ${invisibles.length} paradas invisibles; sin trampa de foco`);
  ok('T2', 'Foco visible en cada parada de Tab', sinIndicador.length === 0, sinIndicador.length ? `${sinIndicador.length} paradas sin contorno visible, p. ej. ${sinIndicador[0].desc} (${sinIndicador[0].outline})` : `las ${enPagina.length} paradas muestran contorno de foco (${enPagina[0].outline})`);
  await page.keyboard.press('Tab'); await page.waitForTimeout(100);
  await page.screenshot({ path: `${OUT}/K01_foco_visible.png` });

  // T3. Shift+Tab recorre el mismo orden en sentido inverso
  const atras = [];
  for (let i = 0; i < 10; i++) { await page.keyboard.press('Shift+Tab'); atras.push((await foco(page)).desc); }
  const esperado = paradas.slice(-10).reverse(); // tras el Tab extra, 10 Shift+Tab vuelven sobre las últimas 10 paradas
  const coincide = atras.every((d, i) => d === esperado[i].desc);
  ok('T3', 'Navegación inversa con Shift+Tab', coincide, coincide ? '10 pulsaciones devuelven exactamente las paradas previas en orden inverso' : `primera diferencia: "${atras.find((d, i) => d !== esperado[i].desc)}"`);

  // T4. Enter en el enlace "Saltar al contenido principal" lleva el foco al contenido
  await page.goto(`${BASE}/index.html?reset=1#inicio`); await page.reload(); await page.waitForTimeout(400);
  const sk = await tabHasta(page, f => /Saltar/.test(f.desc), 60, true); const skip = sk ? sk.f : await foco(page);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150); const trasSkip = await foco(page);
  ok('T4', 'Enter en "Saltar al contenido principal"', /Saltar/.test(skip.desc) && trasSkip.id === 'main', `enlace alcanzado con ${sk ? sk.pulsaciones : '?'} Shift+Tab: ${skip.desc}; tras Enter: ${trasSkip.desc}`);

  // T5. Enter en un enlace del menú cambia de vista
  const lnk = await tabHasta(page, f => f.view === 'venta', 60, true);
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  const vistaVenta = await page.evaluate(() => !document.querySelector('#view-venta').hidden);
  ok('T5', 'Enter en el enlace "Vender pasaje" del menú', !!lnk && vistaVenta, lnk ? `alcanzado con ${lnk.pulsaciones} Shift+Tab; vista de venta visible: ${vistaVenta}` : 'no se alcanzó el enlace con teclado');

  // T6. Flujo de venta solo con teclado: origen, destino (flechas), buscar (Enter), elegir viaje (Enter)
  // Mismo par origen-destino que la inspección general: primer origen y primer destino distinto, elegidos con flechas
  const objetivo = await page.evaluate(() => { const o = [...document.querySelectorAll('#fOrigen option')].map(x => x.value).filter(Boolean); const d = [...document.querySelectorAll('#fDestino option')].map(x => x.value).filter(Boolean); return [o[0], d.find(x => x !== o[0])]; });
  const elegir = async (id, valor) => { for (let i = 0; i < 15; i++) { if (await page.$eval('#' + id, e => e.value) === valor) return; await page.keyboard.press('ArrowDown'); await page.waitForTimeout(60); } };
  await tabHasta(page, f => f.id === 'fOrigen'); await elegir('fOrigen', objetivo[0]);
  await tabHasta(page, f => f.id === 'fDestino'); await elegir('fDestino', objetivo[1]);
  const od = await page.evaluate(() => [document.querySelector('#fOrigen').value, document.querySelector('#fDestino').value]);
  const btnBuscar = await tabHasta(page, f => /Buscar/i.test(f.desc), 20);
  await page.keyboard.press('Enter'); await page.waitForTimeout(1700);
  const nViajes = await page.$$eval('#tripResults button', b => b.length);
  const viaje = await tabHasta(page, f => /tripResults/.test(f.desc) || (f.desc.startsWith('button') && /Elegir|Seleccionar/i.test(f.desc)), 40);
  if (viaje) { await page.keyboard.press('Enter'); await page.waitForTimeout(500); }
  const paso2 = await page.evaluate(() => [...document.querySelectorAll('.step-panel')].find(x => !x.hidden)?.dataset.panel);
  ok('T6', 'Búsqueda y elección de viaje solo con teclado (flechas y Enter)', od[0] && od[1] && !!btnBuscar && nViajes > 0 && paso2 === '2', `origen/destino "${od.join(' / ')}"; ${nViajes} viajes encontrados; paso visible tras Enter: ${paso2}`);

  // T7. Espacio selecciona un asiento (botón conmutable)
  const asiento = await tabHasta(page, f => /\bseat\b/.test(f.cls) && !/taken|reserved/.test(f.cls), 80);
  await page.keyboard.press('Space'); await page.waitForTimeout(250);
  const pres = await page.evaluate(() => document.activeElement.getAttribute('aria-pressed'));
  await page.screenshot({ path: `${OUT}/K02_asiento_con_espacio.png` });
  ok('T7', 'Espacio activa el botón de asiento', !!asiento && pres === 'true', asiento ? `${asiento.f.desc}: aria-pressed="${pres}" tras Espacio` : 'no se alcanzó un asiento libre con Tab');

  // T8. Continuar con Enter y escribir el nombre del pasajero
  const cont = await tabHasta(page, f => /Continuar/i.test(f.desc), 80);
  if (cont) { await page.keyboard.press('Enter'); await page.waitForTimeout(400); }
  const campo = await tabHasta(page, f => f.id === 'pNombres', 40);
  if (campo) await page.keyboard.type('Prueba Teclado');
  const paso3 = await page.evaluate(() => [...document.querySelectorAll('.step-panel')].find(x => !x.hidden)?.dataset.panel);
  ok('T8', 'Enter en "Continuar" y escritura en el formulario', !!cont && !!campo && paso3 === '3', `paso visible: ${paso3}; campo de nombres alcanzado: ${!!campo}`);

  // T9. Cambio de vista solo con teclado sin perder la venta en curso
  const asientoAntes = await page.evaluate(() => document.querySelector('.seat[aria-pressed="true"]')?.textContent.trim().split(/\s+/)[0] || null);
  const aBoletos = await tabHasta(page, f => f.view === 'boletos', 120, true);
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  const enBoletos = await page.evaluate(() => !document.querySelector('#view-boletos').hidden);
  const aVenta = await tabHasta(page, f => f.view === 'venta', 120, true);
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  const estado = await page.evaluate(() => ({ paso: [...document.querySelectorAll('.step-panel')].find(x => !x.hidden)?.dataset.panel, nombre: document.querySelector('#pNombres').value,
    asiento: document.querySelector('.seat[aria-pressed="true"]')?.textContent.trim().split(/\s+/)[0] || null }));
  await page.screenshot({ path: `${OUT}/K03_venta_conservada.png` });
  ok('T9', 'Cambio de vista (Venta a Boletos a Venta) solo con teclado', !!aBoletos && enBoletos && !!aVenta && estado.paso === '3' && estado.nombre === 'Prueba Teclado' && estado.asiento === asientoAntes,
    `vista Boletos mostrada: ${enBoletos}; al volver: paso ${estado.paso}, nombre "${estado.nombre}", asiento ${estado.asiento} (antes ${asientoAntes})`);

  // T10. Al intentar cerrar o recargar con una venta en curso: la venta se conserva o el sistema advierte antes de perderla
  const advierte = await page.evaluate(() => { const ev = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(ev); return ev.defaultPrevented; });
  // Se recarga sin el parámetro ?reset=1 (que borra los datos de demostración)
  await page.goto(`${BASE}/index.html#venta`); await page.waitForTimeout(600);
  const trasRecarga = await page.evaluate(() => ({ paso: [...document.querySelectorAll('.step-panel')].find(x => !x.hidden)?.dataset.panel, nombre: document.querySelector('#pNombres')?.value }));
  const conserva = trasRecarga.paso === '3' && trasRecarga.nombre === 'Prueba Teclado';
  ok('T10', 'Recarga o cierre con una venta en curso', conserva || advierte, `advertencia antes de salir: ${advierte ? 'sí' : 'no'}; tras recargar: paso ${trasRecarga.paso}, nombre "${trasRecarga.nombre}"`);

  await browser.close();
  const pasan = R.pruebas.filter(p => p.pasa).length;
  console.log(`${pasan} de ${R.pruebas.length} pruebas cumplidas`);
  fs.writeFileSync(`${OUT}/resultado_teclado_${ETIQ}.json`, JSON.stringify(R, null, 1));
})();
