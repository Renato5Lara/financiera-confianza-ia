"""
validate_sentiment.py
Compara las predicciones del modelo con una etiqueta manual de la muestra estratificada (99 publicaciones).
La etiqueta manual la asignó un solo anotador, sin ver la predicción del modelo, con este criterio:
POS/NEG = postura evaluativa explícita del autor; NEU = noticias, titulares, citas o datos sin postura propia.
Salida: results/validacion_sentimiento.json (sin textos: solo hash de la publicación y etiquetas).
"""
import json
from pathlib import Path
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix, cohen_kappa_score

BASE = Path(__file__).resolve().parents[1]
MANUAL = ("POS NEU NEU NEG NEG NEU NEU NEG NEU NEG NEU NEU POS NEG NEU NEG NEU NEG NEU NEU "
          "NEG NEG NEU NEU POS NEU NEU NEG NEU NEU NEU NEU NEG NEU NEU NEU NEU NEU POS NEU "
          "NEU NEU POS NEU NEU NEU NEG NEU NEU NEU NEU NEU NEG NEU NEU NEU NEU NEU NEU NEG "
          "NEG POS POS NEU NEU NEU NEU NEU NEU NEU NEG NEU NEU POS NEU NEG NEG NEU NEU NEU "
          "NEU NEG NEG POS NEG NEU NEU NEU NEU NEG NEU NEU NEU NEU NEU NEG NEU NEU NEU").split()

m = pd.read_csv(BASE / "data/muestra_validacion_textos.csv")
assert len(m) == len(MANUAL), (len(m), len(MANUAL))
m["etiqueta_manual"] = MANUAL
y, p = m.etiqueta_manual, m.prediccion_modelo
rep = classification_report(y, p, labels=["NEG", "NEU", "POS"], output_dict=True, zero_division=0)
cm = confusion_matrix(y, p, labels=["NEG", "NEU", "POS"]).tolist()
out = {"n": len(m), "exactitud": round(rep["accuracy"], 3), "f1_macro": round(rep["macro avg"]["f1-score"], 3),
       "kappa_cohen": round(cohen_kappa_score(y, p), 3), "por_clase": {k: {kk: round(vv, 3) for kk, vv in rep[k].items()} for k in ["NEG", "NEU", "POS"]},
       "matriz_confusion_filas_manual_columnas_modelo": {"orden": ["NEG", "NEU", "POS"], "valores": cm},
       "nota": "Muestra estratificada por clase PREDICHA (40/40/19): no estima la exactitud sobre todo el corpus."}
m[["uri_hash", "prediccion_modelo", "etiqueta_manual"]].to_csv(BASE / "results/validacion_etiquetas.csv", index=False)
json.dump(out, open(BASE / "results/validacion_sentimiento.json", "w"), indent=1, ensure_ascii=False)
print(json.dumps(out, indent=1, ensure_ascii=False))
