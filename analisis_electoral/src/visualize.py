"""
visualize.py
Gráficos del análisis electoral. Cada figura indica periodo, fuente y fecha de extracción.
"""
import json
from pathlib import Path
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

BASE = Path(__file__).resolve().parents[1]
RES = BASE / "results"
K, S, L = "Keiko Fujimori (Fuerza Popular)", "Roberto Sánchez (Juntos por el Perú)", "Rafael López Aliaga (Renovación Popular)"
COL = {K: "#E07B00", S: "#2E7D32", L: "#1F5FAD"}
meta = json.load(open(BASE / "data/raw_bluesky.meta.json"))
PIE = f"Fuente: Bluesky, API pública app.bsky.feed.searchPosts (posts en español). Extracción: {meta['extraccion_utc'][:10]}. Periodo: 15 mar.-14 jun. 2026."


def pie(fig):
    fig.text(0.01, 0.005, PIE, fontsize=6.5, color="#555")


def hitos(ax):
    for f, t in [("2026-04-12", "1.ª vuelta"), ("2026-06-07", "2.ª vuelta")]:
        ax.axvline(pd.Timestamp(f), color="#B42318", ls="--", lw=0.8)
        ax.text(pd.Timestamp(f), ax.get_ylim()[1] * 0.95, " " + t, color="#B42318", fontsize=7, va="top")


def main():
    df = pd.read_parquet(BASE / "data/posts_sentimiento.parquet" if (BASE / "data/posts_sentimiento.parquet").exists() else BASE / "data/posts_sentimiento_sin_texto.parquet")
    d = pd.read_csv(RES / "menciones_diarias.csv", parse_dates=["dia"]).set_index("dia")
    # 1. Evolución de menciones
    fig, ax = plt.subplots(figsize=(9, 3.8))
    for c in [K, S, L]:
        ax.plot(d.index, d[c].rolling(7, min_periods=1).mean(), label=c, color=COL[c])
    ax.set_title("Menciones diarias por candidatura (media móvil de 7 días)"); ax.set_ylabel("Publicaciones por día")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d-%b")); ax.legend(fontsize=7); hitos(ax)
    plt.tight_layout(rect=(0, 0.03, 1, 1)); pie(fig); plt.savefig(RES / "g1_evolucion_menciones.png", dpi=160); plt.close()
    # 2. Distribución de sentimiento por candidatura (una sola candidatura mencionada)
    uno = df[df[[K, S, L]].sum(axis=1) == 1]
    tab = pd.DataFrame({c.split(" (")[0]: uno[uno[c]].sentimiento.value_counts(normalize=True) for c in [K, S, L]}).T.reindex(columns=["NEG", "NEU", "POS"]).fillna(0) * 100
    fig, ax = plt.subplots(figsize=(8, 3.8))
    izq = 0
    for col, nom, colr in [("NEG", "Negativo", "#B42318"), ("NEU", "Neutral", "#98A2B3"), ("POS", "Positivo", "#2E7D32")]:
        ax.barh(tab.index, tab[col], left=izq, label=nom, color=colr)
        for i, v in enumerate(tab[col]):
            if v > 6: ax.text((izq if isinstance(izq, (int, float)) else izq.iloc[i]) + v / 2, i, f"{v:.0f} %", ha="center", va="center", color="white", fontsize=8)
        izq = tab[col] if isinstance(izq, int) else izq + tab[col]
    ax.set_xlim(0, 100); ax.set_xlabel("% de publicaciones"); ax.legend(ncol=3, fontsize=8, loc="upper center", bbox_to_anchor=(0.5, -0.22))
    ax.set_title("Sentimiento de las publicaciones por candidatura (modelo RoBERTuito)")
    plt.tight_layout(rect=(0, 0.05, 1, 1)); pie(fig); plt.savefig(RES / "g2_sentimiento_candidatura.png", dpi=160); plt.close()
    # 3. Temas por fase
    t = pd.read_csv(RES / "temas_por_fase.csv", index_col=0)
    t.columns = [c.replace("tema_", "") for c in t.columns]
    fig, ax = plt.subplots(figsize=(9, 3.8))
    t.T.plot.bar(ax=ax, width=0.8)
    ax.set_ylabel("% de publicaciones de la fase"); ax.set_title("Temas de conversación por fase del proceso electoral")
    ax.tick_params(axis="x", rotation=0, labelsize=7); ax.legend(fontsize=7)
    plt.tight_layout(rect=(0, 0.04, 1, 1)); pie(fig); plt.savefig(RES / "g3_temas_fase.png", dpi=160); plt.close()
    # 4. Reconstrucción temporal frente al resultado oficial
    r = pd.read_csv(RES / "reconstruccion_temporal_2v.csv", parse_dates=["dia"])
    fig, ax = plt.subplots(figsize=(9, 3.8))
    ax.plot(r.dia, r["A_menciones_%"], label="A) % de menciones", color="#667085")
    # B) se omite en el gráfico: hay muy pocas publicaciones positivas por ventana y la serie oscila entre 0 y 100 %
    ax.plot(r.dia, r["C_no_negativas_%"], label="C) % de menciones no negativas", color="#E07B00")
    ax.axhline(50.135, color="#B42318", ls="--", lw=1, label="Resultado oficial ONPE: 50,135 %")
    ax.axhline(50, color="black", lw=0.4)
    ax.set_ylim(0, 100); ax.set_ylabel("Participación de K. Fujimori (%)")
    ax.set_title("Reconstrucción temporal (ventana móvil de 7 días): indicadores de redes vs. resultado oficial")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d-%b")); ax.legend(fontsize=7, loc="upper left")
    plt.tight_layout(rect=(0, 0.04, 1, 1)); pie(fig); plt.savefig(RES / "g4_reconstruccion_temporal.png", dpi=160); plt.close()
    # 5. Distribución de publicaciones por consulta de origen y concentración por cuenta
    fig, ax = plt.subplots(1, 2, figsize=(10, 3.6))
    c = df.explode("consultas").consultas.value_counts()
    ax[0].barh(c.index[::-1], c.values[::-1], color="#1F3B63"); ax[0].set_title("Publicaciones válidas por consulta de búsqueda", fontsize=9)
    vc = df.autor.value_counts()
    cum = vc.cumsum() / vc.sum() * 100
    ax[1].plot(range(1, len(cum) + 1), cum.values, color="#B42318"); ax[1].set_xscale("log")
    ax[1].set_xlabel("N.° de cuentas (ordenadas por actividad)"); ax[1].set_ylabel("% acumulado de publicaciones")
    ax[1].set_title(f"Concentración: {len(vc)} cuentas; las 10 más activas = {cum.iloc[min(9, len(cum)-1)]:.0f} %", fontsize=9)
    plt.tight_layout(rect=(0, 0.04, 1, 1)); pie(fig); plt.savefig(RES / "g5_fuentes_concentracion.png", dpi=160); plt.close()
    print("Gráficos generados en", RES)


if __name__ == "__main__":
    main()
