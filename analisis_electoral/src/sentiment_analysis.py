"""
sentiment_analysis.py
Clasifica el sentimiento (positivo / neutral / negativo) de cada publicación con un modelo
Transformer preentrenado para español en redes sociales: RoBERTuito ajustado en TASS,
distribuido por la biblioteca pysentimiento (Pérez et al., 2021/2023).

Entrada : data/posts_limpios.parquet     Salida: data/posts_sentimiento.parquet
También genera una muestra estratificada para validación manual (results/muestra_validacion.csv).
"""
from pathlib import Path
import pandas as pd
from pysentimiento import create_analyzer
from pysentimiento.preprocessing import preprocess_tweet

BASE = Path(__file__).resolve().parents[1]
MODELO = "pysentimiento/robertuito-sentiment-analysis"


def main():
    df = pd.read_parquet(BASE / "data/posts_limpios.parquet")
    an = create_analyzer(task="sentiment", lang="es")          # descarga el modelo la primera vez
    textos = [preprocess_tweet(t, lang="es") for t in df["texto_limpio"]]
    res = an.predict(textos)
    df["sentimiento"] = [r.output for r in res]                  # POS / NEU / NEG
    for k in ["POS", "NEU", "NEG"]:
        df["p_" + k] = [r.probas[k] for r in res]
    df.to_parquet(BASE / "data/posts_sentimiento.parquet", index=False)
    print(df["sentimiento"].value_counts(normalize=True).round(3))
    # Muestra para validación humana: 40 por clase predicha (o todas si hay menos)
    m = pd.concat([g.sample(min(40, len(g)), random_state=1) for _, g in df.groupby("sentimiento")])
    m = m[["uri_hash", "texto_limpio", "sentimiento"]].sample(frac=1, random_state=2).rename(columns={"sentimiento": "prediccion_modelo"})
    # El archivo con textos queda solo en local (no se publica); el de etiquetas usa el hash de la publicación
    m.assign(etiqueta_manual="").to_csv(BASE / "data/muestra_validacion_textos.csv", index=False, encoding="utf-8")


if __name__ == "__main__":
    main()
