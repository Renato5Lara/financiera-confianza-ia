# Evaluación UX del módulo Ventas y Atención con ISO/IEC 25010:2023

- `interfaz_original/`: copia exacta del código de la interfaz (proyecto ERP de transporte). Los originales no se modificaron.
- `interfaz_mejorada/`: copia con 7 mejoras derivadas de la evaluación (ver informe).
- `pruebas/inspeccion_iso25010.js`: inspección técnica automatizada (Playwright + axe-core) con 16 criterios.
- `pruebas/prueba_teclado_estado.js`: protocolo de 10 pruebas solo con teclado (Tab, Shift+Tab, Enter, Espacio, flechas), foco visible y conservación de la venta al cambiar de vista y al recargar.
- `capturas/original` y `capturas/mejorada`: capturas reales (escritorio 1366×768 y móvil 390×844).

```bash
cd interfaz_original && python -m http.server 8765 &
cd interfaz_mejorada && python -m http.server 8766 &
npm install playwright axe-core && npx playwright install chromium
AXE_PATH=node_modules/axe-core/axe.min.js node pruebas/inspeccion_iso25010.js http://127.0.0.1:8765 original capturas/original
AXE_PATH=node_modules/axe-core/axe.min.js node pruebas/inspeccion_iso25010.js http://127.0.0.1:8766 mejorada capturas/mejorada
node pruebas/prueba_teclado_estado.js http://127.0.0.1:8765 original capturas/original
node pruebas/prueba_teclado_estado.js http://127.0.0.1:8766 mejorada capturas/mejorada
```
Resultados: inspección general, original 10/16 y mejorada 16/16; protocolo de teclado, original 9/10 (pierde la venta sin aviso al recargar) y mejorada 10/10.
Es una **inspección técnica**, no una prueba con usuarios.
