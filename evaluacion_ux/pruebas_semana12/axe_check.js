// Inspección automática de accesibilidad (axe-core, reglas WCAG 2.x A/AA) sobre cada vista.
const puppeteer = require('/home/claude/tools/bpmn/node_modules/puppeteer-core');
const fs = require('fs');
const AXE = fs.readFileSync('/home/claude/tools/axe/node_modules/axe-core/axe.min.js', 'utf8');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const out = [];
  for (const [modo, vp] of [['escritorio', { width: 1366, height: 768 }], ['movil', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const p = await b.newPage(); await p.setViewport(vp); await p.emulateTimezone('America/Lima');
    await p.goto('http://localhost:8765/index.html?reset=1#inicio', { waitUntil: 'networkidle0' });
    for (const v of ['inicio', 'venta', 'reservas', 'boletos', 'clientes', 'caja', 'privacidad']) {
      await p.goto('http://localhost:8765/index.html#' + v, { waitUntil: 'networkidle0' });
      await p.addScriptTag({ content: AXE });
      const r = await p.evaluate(async () => { const res = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }); return { v: res.violations.map(x => ({ id: x.id, impact: x.impact, n: x.nodes.length, help: x.help, ej: x.nodes[0].target.join(' ') })), pases: res.passes.length }; });
      out.push({ modo, vista: v, ...r });
    }
    await p.close();
  }
  await b.close();
  fs.writeFileSync('/home/claude/ui/resultado_axe.json', JSON.stringify(out, null, 1));
  out.forEach(o => console.log(o.modo, o.vista, 'reglas aprobadas:', o.pases, 'violaciones:', o.v.map(x => `${x.id}(${x.impact},${x.n}) ${x.ej}`).join(' | ') || 'ninguna'));
})();
