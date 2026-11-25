"""
trend_analysis.py
Tendencias, sentimiento por candidatura y ESTIMACIÓN EXPERIMENTAL retrospectiva.

Variable estimada (experimental): participación de cada candidatura de la segunda vuelta en las
menciones de Bluesky en español, con tres indicadores:
  A) proporción de menciones;  B) proporción de menciones positivas;
  C) proporción de menciones NO negativas (positivas + neutrales).
Solo se usan publicaciones que mencionan UNA sola candidatura (el modelo de sentimiento no sabe
a cuál se dirige la opinión cuando se mencionan ambas).
La comparación con el resultado oficial de la ONPE sirve para medir el error, NO para validar
un método de predicción: el análisis se hizo después de la elección.
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

BASE = Path(__file__).resolve().parents[1]
K, S, L = "Keiko Fujimori (Fuerza Popular)", "Roberto Sánchez (Juntos por el Perú)", "Rafael López Aliaga (Renovación Popular)"
# Resultados oficiales (ONPE al 100 %), citados en el informe
OFICIAL_2V = {K: 50.135, S: 49.865}                      # % de votos válidos, segunda vuelta (7 jun. 2026)
OFICIAL_1V = {K: 17.181, S: 12.031, L: 11.904}              # % primera vuelta (12 abr. 2026)
rng = np.random.default_rng(42)


def indicadores(d, cands):
    out = {}
    for c in cands:
        s = d[d[c]]
        out[c] = {"menciones": len(s), "pos": int((s.sentimiento == "POS").sum()), "neg": int((s.sentimiento == "NEG").sum())}
    tot_m = sum(v["menciones"] for v in out.values()) or 1
    tot_p = sum(v["pos"] for v in out.values()) or 1
    noneg = {c: v["menciones"] - v["neg"] for c, v in out.items()}
    tot_n = sum(noneg.values()) or 1
    return {c: {"A_menciones_%": 100 * v["menciones"] / tot_m, "B_positivas_%": 100 * v["pos"] / tot_p,
                "C_no_negativas_%": 100 * noneg[c] / tot_n, **v} for c, v in out.items()}


def bootstrap(d, cands, clave, n=1000):
    vals = []
    idx = np.arange(len(d))
    for _ in range(n):
        m = d.iloc[rng.choice(idx, len(idx), replace=True)]
        vals.append(indicadores(m, cands)[cands[0]][clave])
    return np.percentile(vals, [2.5, 97.5]).round(1).tolist()


def main():
    df = pd.read_parquet(BASE / "data/posts_sentimiento.parquet" if (BASE / "data/posts_sentimiento.parquet").exists() else BASE / "data/posts_sentimiento_sin_texto.parquet")
    df["dia"] = df.fecha.dt.tz_convert("America/Lima").dt.date
    res = {}
    # Serie diaria de menciones por candidatura
    diaria = df.groupby("dia")[[K, S, L]].sum()
    diaria.to_csv(BASE / "results/menciones_diarias.csv", encoding="utf-8")
    # Sentimiento por candidatura (solo publicaciones que mencionan una sola candidatura)
    uno = df[df[[K, S, L]].sum(axis=1) == 1]
    sent = {c: uno[uno[c]].sentimiento.value_counts(normalize=True).round(3).to_dict() for c in [K, S, L]}
    res["sentimiento_por_candidatura"] = sent
    res["publicaciones_una_sola_candidatura"] = len(uno)
    # Temas por fase
    temas = [c for c in df.columns if c.startswith("tema_")]
    df.groupby("fase", observed=True)[temas].mean().mul(100).round(1).to_csv(BASE / "results/temas_por_fase.csv", encoding="utf-8")
    # Estimación experimental: primera vuelta (campaña previa al 12 abr.)
    d1 = uno[(uno.fecha < "2026-04-12T05:00:00Z")]
    e1 = indicadores(d1, [K, S, L])
    tot1 = sum(OFICIAL_1V.values())
    res["primera_vuelta"] = {c: {**{k: round(v, 1) for k, v in e1[c].items() if k.endswith("%")}, "oficial_normalizado_3_%": round(100 * OFICIAL_1V[c] / tot1, 1), "menciones": e1[c]["menciones"]} for c in e1}
    # Estimación experimental: segunda vuelta, ventana final (24 may.-6 jun., hora de Lima)
    d2 = uno[(uno.fecha >= "2026-05-24T05:00:00Z") & (uno.fecha < "2026-06-07T05:00:00Z")]
    d2 = d2[d2[[K, S]].sum(axis=1) == 1]
    e2 = indicadores(d2, [K, S])
    res["segunda_vuelta_ventana"] = "2026-05-24 a 2026-06-06 (Lima)"
    res["segunda_vuelta_n"] = len(d2)
    res["segunda_vuelta"] = {}
    for c in [K, S]:
        res["segunda_vuelta"][c] = {k: round(v, 1) for k, v in e2[c].items() if k.endswith("%")}
        res["segunda_vuelta"][c].update({"oficial_%": OFICIAL_2V[c], "menciones": e2[c]["menciones"], "pos": e2[c]["pos"], "neg": e2[c]["neg"]})
    for clave in ["A_menciones_%", "B_positivas_%", "C_no_negativas_%"]:
        res["segunda_vuelta"][K]["IC95_" + clave] = bootstrap(d2, [K, S], clave)
        res["segunda_vuelta"][K]["error_pp_" + clave] = round(res["segunda_vuelta"][K][clave] - OFICIAL_2V[K], 1)
    # Reconstrucción temporal ("como si fuera en tiempo real"): ventana móvil de 7 días, solo datos hasta cada día
    serie = []
    dias = pd.date_range("2026-04-20", "2026-06-06", freq="D")
    for dia in dias:
        fin = pd.Timestamp(dia, tz="America/Lima") + pd.Timedelta(days=1)
        w = uno[(uno.fecha >= fin - pd.Timedelta(days=7)) & (uno.fecha < fin)]
        w = w[w[[K, S]].sum(axis=1) == 1]
        if len(w) < 15:
            continue
        e = indicadores(w, [K, S])
        serie.append({"dia": dia.date().isoformat(), "n": len(w), **{k: round(e[K][k], 1) for k in ["A_menciones_%", "B_positivas_%", "C_no_negativas_%"]}})
    pd.DataFrame(serie).to_csv(BASE / "results/reconstruccion_temporal_2v.csv", index=False)
    json.dump(res, open(BASE / "results/estimacion_experimental.json", "w"), ensure_ascii=False, indent=1)
    print(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
