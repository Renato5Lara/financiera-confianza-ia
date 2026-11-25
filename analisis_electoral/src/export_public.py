"""
export_public.py
Genera una versión publicable del conjunto procesado SIN el texto de las publicaciones
(solo hash de la publicación, hash del autor, fechas, menciones, temas, fase y sentimiento).
Permite reproducir trend_analysis.py y visualize.py sin redistribuir contenido de terceros.
"""
from pathlib import Path
import pandas as pd
BASE = Path(__file__).resolve().parents[1]
df = pd.read_parquet(BASE / "data/posts_sentimiento.parquet")
pub = df.drop(columns=["texto_limpio"])
pub.to_parquet(BASE / "data/posts_sentimiento_sin_texto.parquet", index=False)
print("Columnas publicadas:", len(pub.columns), "| filas:", len(pub))
