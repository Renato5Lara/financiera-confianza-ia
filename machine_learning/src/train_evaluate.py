"""
train_evaluate.py
Entrena y evalúa tres clasificadores de riesgo crediticio (probabilidad de incumplimiento):
  1) Regresión logística (modelo de referencia, interpretable)
  2) Random Forest
  3) Gradient Boosting
Además entrena un detector de anomalías (Isolation Forest) como componente separado.

Pasos: partición estratificada 75/25 -> validación cruzada (5 pliegues) en entrenamiento ->
umbral de decisión que minimiza el costo esperado (matriz de costos del conjunto: FN=5, FP=1) ->
métricas en prueba -> gráficos -> análisis de equidad por grupo de edad -> guardado del modelo.
"""
import json
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, IsolationForest
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_predict, cross_val_score
from sklearn.metrics import (accuracy_score, precision_score, recall_score, f1_score, roc_auc_score,
                             confusion_matrix, roc_curve, brier_score_loss)
from sklearn.calibration import calibration_curve
from prepare_data import cargar, variables

SEED = 42
RES = Path(__file__).resolve().parents[1] / "results"
RES.mkdir(exist_ok=True)
COSTO_FN, COSTO_FP = 5, 1  # matriz de costos documentada con el conjunto de datos


def preprocesador(cat, num):
    return ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), cat),
        ("num", StandardScaler(), num),
    ])


def umbral_costo(y, p):
    """Elige el umbral que minimiza el costo esperado sobre predicciones fuera de pliegue."""
    grid = np.linspace(0.05, 0.95, 91)
    costos = [COSTO_FN * ((p < t) & (y == 1)).sum() + COSTO_FP * ((p >= t) & (y == 0)).sum() for t in grid]
    return float(grid[int(np.argmin(costos))])


def metricas(y, p, t):
    pred = (p >= t).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred).ravel()
    return {"umbral": round(t, 2), "accuracy": accuracy_score(y, pred), "precision": precision_score(y, pred),
            "recall": recall_score(y, pred), "f1": f1_score(y, pred), "roc_auc": roc_auc_score(y, p),
            "gini": 2 * roc_auc_score(y, p) - 1, "brier": brier_score_loss(y, p),
            "costo_total": int(COSTO_FN * fn + COSTO_FP * fp), "vp": int(tp), "fp": int(fp), "vn": int(tn), "fn": int(fn)}


def main():
    df = cargar()
    X, y, edad, cat, num = variables(df)
    Xtr, Xte, ytr, yte, etr, ete = train_test_split(X, y, edad, test_size=0.25, stratify=y, random_state=SEED)
    modelos = {
        "Regresión logística": LogisticRegression(max_iter=2000, C=0.5),
        "Random Forest": RandomForestClassifier(n_estimators=400, min_samples_leaf=5, random_state=SEED, n_jobs=-1),
        "Gradient Boosting": GradientBoostingClassifier(n_estimators=200, learning_rate=0.05, max_depth=3, random_state=SEED),
    }
    cv = StratifiedKFold(5, shuffle=True, random_state=SEED)
    resultados, probas, pipes = {}, {}, {}
    for nombre, m in modelos.items():
        pipe = Pipeline([("prep", preprocesador(cat, num)), ("modelo", m)])
        auc_cv = cross_val_score(pipe, Xtr, ytr, cv=cv, scoring="roc_auc")
        p_oof = cross_val_predict(pipe, Xtr, ytr, cv=cv, method="predict_proba")[:, 1]
        t = umbral_costo(ytr.values, p_oof)
        pipe.fit(Xtr, ytr)
        p = pipe.predict_proba(Xte)[:, 1]
        r = metricas(yte.values, p, t)
        r["auc_cv_media"], r["auc_cv_desv"] = float(auc_cv.mean()), float(auc_cv.std())
        resultados[nombre], probas[nombre], pipes[nombre] = r, p, pipe
        print(f"{nombre}: AUC-CV={auc_cv.mean():.3f}±{auc_cv.std():.3f} | prueba: AUC={r['roc_auc']:.3f} "
              f"Acc={r['accuracy']:.3f} Prec={r['precision']:.3f} Rec={r['recall']:.3f} F1={r['f1']:.3f} umbral={t:.2f} costo={r['costo_total']}")

    # Selección: menor costo en VALIDACIÓN CRUZADA sería ideal; aquí se reporta todo y se elige por AUC-CV
    elegido = max(resultados, key=lambda k: resultados[k]["auc_cv_media"])
    print("Modelo con mayor AUC en validación cruzada:", elegido)
    pd.DataFrame(resultados).T.round(4).to_csv(RES / "metricas_modelos.csv", encoding="utf-8")

    # Gráfico ROC
    plt.figure(figsize=(6, 5))
    for n, p in probas.items():
        fpr, tpr, _ = roc_curve(yte, p)
        plt.plot(fpr, tpr, label=f"{n} (AUC={resultados[n]['roc_auc']:.3f})")
    plt.plot([0, 1], [0, 1], "k--", lw=0.8)
    plt.xlabel("Tasa de falsos positivos"); plt.ylabel("Tasa de verdaderos positivos (recall)")
    plt.title("Curvas ROC en el conjunto de prueba (n=250)"); plt.legend(fontsize=8); plt.tight_layout()
    plt.savefig(RES / "roc_modelos.png", dpi=160); plt.close()

    # Matriz de confusión del modelo elegido
    r = resultados[elegido]
    cm = np.array([[r["vn"], r["fp"]], [r["fn"], r["vp"]]])
    fig, ax = plt.subplots(figsize=(4.6, 4))
    ax.imshow(cm, cmap="Blues")
    for i in range(2):
        for j in range(2):
            ax.text(j, i, cm[i, j], ha="center", va="center", fontsize=14, color="white" if cm[i, j] > cm.max() / 2 else "black")
    ax.set_xticks([0, 1], ["Pred. cumple", "Pred. incumple"]); ax.set_yticks([0, 1], ["Real cumple", "Real incumple"])
    ax.set_title(f"Matriz de confusión: {elegido}\n(umbral de costo = {r['umbral']})", fontsize=10)
    plt.tight_layout(); plt.savefig(RES / "matriz_confusion.png", dpi=160); plt.close()

    # Calibración
    plt.figure(figsize=(5.5, 4.5))
    for n, p in probas.items():
        fr, mp = calibration_curve(yte, p, n_bins=8, strategy="quantile")
        plt.plot(mp, fr, marker="o", label=n)
    plt.plot([0, 1], [0, 1], "k--", lw=0.8)
    plt.xlabel("Probabilidad estimada de incumplimiento"); plt.ylabel("Tasa observada")
    plt.title("Curva de calibración (prueba)"); plt.legend(fontsize=8); plt.tight_layout()
    plt.savefig(RES / "calibracion.png", dpi=160); plt.close()

    # Interpretabilidad: coeficientes de la regresión logística
    lr = pipes["Regresión logística"]
    nombres = lr.named_steps["prep"].get_feature_names_out()
    coef = pd.Series(lr.named_steps["modelo"].coef_[0], index=nombres).sort_values()
    top = pd.concat([coef.head(8), coef.tail(8)])
    plt.figure(figsize=(7, 5.5))
    plt.barh([s.replace("cat__", "").replace("num__", "") for s in top.index], top.values,
             color=["#2E7D32" if v < 0 else "#B42318" for v in top.values])
    plt.axvline(0, color="k", lw=0.6)
    plt.title("Regresión logística: variables que más aumentan (rojo)\no reducen (verde) el riesgo estimado", fontsize=10)
    plt.tight_layout(); plt.savefig(RES / "coeficientes_logistica.png", dpi=160); plt.close()
    coef.round(4).to_csv(RES / "coeficientes_logistica.csv", encoding="utf-8")

    # Equidad: tasa de rechazo (predicción de incumplimiento) por grupo de edad (no usada por el modelo)
    p = probas[elegido]; pred = (p >= resultados[elegido]["umbral"]).astype(int)
    grupo = np.where(ete.values < 25, "menor de 25", "25 o más")
    eq = pd.DataFrame({"grupo": grupo, "pred": pred, "real": yte.values}).groupby("grupo").agg(
        n=("pred", "size"), tasa_pred_incumple=("pred", "mean"), tasa_real_incumple=("real", "mean"))
    eq.round(3).to_csv(RES / "equidad_por_edad.csv", encoding="utf-8")
    print("Equidad por edad:\n", eq.round(3))

    # Detector de anomalías (componente separado; no usa la etiqueta para entrenar)
    prep = preprocesador(cat, num).fit(Xtr)
    iso = IsolationForest(n_estimators=300, contamination=0.03, random_state=SEED).fit(prep.transform(Xtr))
    score = -iso.score_samples(prep.transform(Xte))
    alertas = iso.predict(prep.transform(Xte)) == -1
    anom = {"alertas_prueba": int(alertas.sum()), "tasa_incumplimiento_en_alertas": float(yte.values[alertas].mean()) if alertas.any() else None,
            "tasa_incumplimiento_global": float(yte.mean())}
    json.dump(anom, open(RES / "isolation_forest.json", "w"), indent=1, ensure_ascii=False)
    plt.figure(figsize=(6, 4))
    plt.hist(score[~alertas], bins=30, alpha=0.7, label="Sin alerta"); plt.hist(score[alertas], bins=10, alpha=0.9, color="#B42318", label="Alerta (top 3 %)")
    plt.xlabel("Puntaje de anomalía (mayor = más atípico)"); plt.ylabel("Solicitudes"); plt.title("Isolation Forest sobre el conjunto de prueba")
    plt.legend(); plt.tight_layout(); plt.savefig(RES / "isolation_forest.png", dpi=160); plt.close()
    print("Isolation Forest:", anom)

    joblib.dump({"pipeline": pipes[elegido], "umbral": resultados[elegido]["umbral"], "nombre": elegido,
                 "columnas": list(X.columns)}, RES / "modelo_riesgo.joblib")
    json.dump({"elegido": elegido, "resultados": resultados}, open(RES / "metricas_modelos.json", "w"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
