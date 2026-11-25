# Análisis electoral Perú 2026 con IA y Bluesky (reconstrucción retrospectiva)

Las Elecciones Generales 2026 ya concluyeron (1.ª vuelta 12/04/2026, 2.ª vuelta 07/06/2026). Por eso este programa **no hace una
predicción en vivo**: reconstruye día por día lo que se habría observado en redes y compara indicadores experimentales con el
resultado oficial de la ONPE. El modo `--modo vivo` permite repetir la recolección en tiempo real para un proceso futuro.

## Fuente de datos
API pública oficial de Bluesky `app.bsky.feed.searchPosts` (https://api.bsky.app), sin credenciales, publicaciones en español.
Extracción: 24/11/2026. Periodo: 15/03/2026 a 14/06/2026. 8 consultas, hasta 100 o 200 publicaciones por consulta y día.
**Privacidad:** no se guardan nombres ni handles; el identificador del autor se reemplaza por un hash. Los textos no se publican: el repositorio incluye `data/posts_sentimiento_sin_texto.parquet` (hashes, fechas, menciones, temas y sentimiento) y `results/validacion_etiquetas.csv` (hash y etiquetas), suficientes para reproducir tendencias y gráficos con `bash run_pipeline.sh`. Para repetir todo desde cero: `bash run_pipeline.sh --recolectar`.

## Flujo
`collect_data.py` → `preprocess.py` (deduplicación, emojis, idioma, spam, relevancia, menciones, temas) →
`sentiment_analysis.py` (Transformer RoBERTuito, pysentimiento) → `export_public.py` (versión sin textos) → `validate_sentiment.py` (muestra etiquetada a mano) →
`trend_analysis.py` (tendencias y estimación experimental) → `visualize.py`. Todo junto: `bash run_pipeline.sh`.

## Resultados clave (ver `results/`)
4 530 registros brutos → 2 423 únicos → 1 608 válidos de 395 cuentas (las 10 más activas aportan el 41 %).
Validación del modelo de sentimiento (99 publicaciones): exactitud 0,636, F1 macro 0,616, kappa 0,409.
Ningún indicador de redes se acercó al resultado oficial (Fujimori 50,135 %): % de menciones 74,7 % (error +24,6 pp); % de menciones no negativas 67,9 % (error +17,8 pp).
Resultados oficiales usados: 1.ª vuelta 17,181 / 12,031 / 11,904 % (Andina, 15/05/2026); 2.ª vuelta 50,135 / 49,865 % (El Peruano, 29/06/2026).

## Limitaciones
Bluesky no representa al electorado peruano (al menos 60 de las 395 cuentas hacen referencias explícitas a la política española), volumen pequeño,
concentración en pocas cuentas, sarcasmo, noticias compartidas y posibles bots. **El sentimiento en redes no equivale a intención de voto.**
