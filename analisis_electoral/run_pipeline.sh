#!/usr/bin/env bash
# Ejecuta todo el análisis electoral en orden
set -e
cd "$(dirname "$0")"
if [ -f data/raw_bluesky.jsonl ] || [ "$1" = "--recolectar" ]; then
  [ -f data/raw_bluesky.jsonl ] || python src/collect_data.py --modo historico --desde 2026-03-15 --hasta 2026-06-14
  python src/preprocess.py
  python src/sentiment_analysis.py
  python src/export_public.py
  [ -f data/muestra_validacion_textos.csv ] && python src/validate_sentiment.py
fi
# Con solo data/posts_sentimiento_sin_texto.parquet (versión publicada) se reproducen las tendencias y gráficos:
python src/trend_analysis.py
python src/visualize.py
