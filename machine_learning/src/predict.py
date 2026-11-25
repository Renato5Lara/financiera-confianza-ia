"""
predict.py
Simula el servicio de inferencia que el ERP (Core financiero) llamaría por API:
recibe una solicitud en JSON, valida los campos, calcula la probabilidad de incumplimiento (PD),
asigna una categoría de riesgo y devuelve una RECOMENDACIÓN (la decisión final es humana).

Uso:  python src/predict.py data/solicitud_ejemplo.json
"""
import json, sys
from pathlib import Path
import joblib
import pandas as pd

RES = Path(__file__).resolve().parents[1] / "results"


def categoria(pd_):
    # Cortes ilustrativos; en producción los aprueba gestión de riesgos
    return "Bajo" if pd_ < 0.20 else ("Medio" if pd_ < 0.45 else "Alto")


def evaluar(solicitud: dict) -> dict:
    art = joblib.load(RES / "modelo_riesgo.joblib")
    faltantes = [c for c in art["columnas"] if c not in solicitud]
    if faltantes:  # validación de entrada (control de calidad de datos en la inferencia)
        return {"estado": "rechazada_por_validacion", "campos_faltantes": faltantes}
    X = pd.DataFrame([{c: solicitud[c] for c in art["columnas"]}])
    p = float(art["pipeline"].predict_proba(X)[0, 1])
    return {"estado": "evaluada", "modelo": art["nombre"], "probabilidad_incumplimiento": round(p, 3),
            "categoria_riesgo": categoria(p), "requiere_revision_reforzada": p >= art["umbral"],
            "nota": "Recomendación de apoyo; la decisión crediticia la toma un analista autorizado."}


if __name__ == "__main__":
    ruta = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[1] / "data" / "solicitud_ejemplo.json")
    for s in json.load(open(ruta, encoding="utf-8")):
        print(json.dumps({"id": s.get("id"), **evaluar(s)}, ensure_ascii=False))
