"""
preprocess.py
Limpieza y preparación de las publicaciones recolectadas.
Entrada : data/raw_bluesky.jsonl     Salida: data/posts_limpios.parquet + results/calidad_datos.json

Pasos: deduplicación (misma publicación hallada por varias consultas y textos idénticos),
normalización, tratamiento de emojis, verificación de idioma, filtro de spam y de
publicaciones irrelevantes, detección de menciones a candidaturas verificadas y clasificación temática.
"""
import json, re, unicodedata
from pathlib import Path
import pandas as pd
import emoji
from langdetect import detect, DetectorFactory, LangDetectException

DetectorFactory.seed = 0
BASE = Path(__file__).resolve().parents[1]

# Candidaturas verificadas: las tres más votadas en la primera vuelta (ONPE al 100 %)
CANDIDATOS = {
    "Keiko Fujimori (Fuerza Popular)": r"\bkeiko\b|\bfujimori\b|fuerza popular|fujimoris",
    "Roberto Sánchez (Juntos por el Perú)": r"roberto s[aá]nchez|s[aá]nchez palomino|juntos por el per[uú]",
    "Rafael López Aliaga (Renovación Popular)": r"l[oó]pez aliaga|renovaci[oó]n popular|\bporky\b",
}
TEMAS = {
    "Proceso electoral y ONPE": r"\bonpe\b|\bjne\b|\bactas?\b|conteo|escrutinio|fraude|boca de urna|flash electoral|resultados",
    "Economía y empleo": r"econom|empleo|inversi[oó]n|pobreza|precios|impuesto|miner",
    "Corrupción y justicia": r"corrupci|fiscal|juicio|c[aá]rcel|indulto|lavado|delito|investigaci",
    "Seguridad ciudadana": r"inseguridad|seguridad ciudadana|extorsi|crimen|delincuen|sicari",
    "Democracia y derechos": r"democracia|derechos|dictadura|autoritari|libertad|golpe",
}
CONTEXTO = r"elecci|electoral|segunda vuelta|primera vuelta|\bvoto|votar|candidat|presiden|onpe|jne|per[uú]"


def normalizar(t: str) -> str:
    t = unicodedata.normalize("NFC", t)
    t = re.sub(r"https?://\S+|www\.\S+|\b\S+\.(com|pe|org|net)/\S*", " ", t)  # enlaces
    t = re.sub(r"@[\w.\-]+", " @usuario ", t)                                     # menciones a cuentas
    t = emoji.demojize(t, language="es", delimiters=(" :", ": "))                 # emojis -> texto
    return re.sub(r"\s+", " ", t).strip()


def idioma(t):
    try:
        return detect(t)
    except LangDetectException:
        return "desconocido"


def main():
    raw = pd.read_json(BASE / "data/raw_bluesky.jsonl", lines=True)
    q = {"brutos": len(raw)}
    # 1) La misma publicación puede llegar por varias consultas: se conserva una y se guardan las consultas
    consultas = raw.groupby("uri_hash")["consulta"].apply(lambda s: sorted(set(s)))
    df = raw.drop_duplicates("uri_hash").set_index("uri_hash")
    df["consultas"] = consultas; df = df.reset_index()
    q["tras_dedup_uri"] = len(df)
    df["fecha"] = pd.to_datetime(df["creado"], utc=True, errors="coerce", format="mixed")
    df = df.dropna(subset=["fecha"])
    df = df[(df.fecha >= "2026-03-15") & (df.fecha < "2026-06-15")]
    q["en_periodo"] = len(df)
    df["texto_limpio"] = df["texto"].fillna("").map(normalizar)
    low = df["texto_limpio"].str.lower()
    # 2) Spam y ruido: textos muy cortos, solo hashtags o textos idénticos repetidos por la misma cuenta
    palabras = low.str.replace(r"#\w+|:\w+:", " ", regex=True).str.split().str.len()
    df["spam_corto"] = palabras < 4
    df["dup_texto"] = df.duplicated(subset=["autor", "texto_limpio"], keep="first")
    df["idioma_detectado"] = df["texto_limpio"].map(idioma)
    df["irrelevante"] = ~low.str.contains(CONTEXTO, regex=True)
    q["spam_corto"] = int(df.spam_corto.sum()); q["texto_repetido_misma_cuenta"] = int(df.dup_texto.sum())
    q["no_espanol"] = int((df.idioma_detectado != "es").sum()); q["irrelevantes"] = int(df.irrelevante.sum())
    df = df[~df.spam_corto & ~df.dup_texto & (df.idioma_detectado == "es") & ~df.irrelevante].copy()
    q["validos"] = len(df); q["autores_unicos"] = int(df.autor.nunique())
    low = df["texto_limpio"].str.lower()
    for c, rx in CANDIDATOS.items():
        df[c] = low.str.contains(rx, regex=True)
    for t, rx in TEMAS.items():
        df["tema_" + t] = low.str.contains(rx, regex=True)
    df["fase"] = pd.cut(df.fecha, bins=pd.to_datetime(["2026-03-15", "2026-04-12", "2026-04-13", "2026-06-07", "2026-06-08", "2026-06-15"], utc=True),
                        labels=["Campaña 1.ª vuelta", "Día 1.ª vuelta", "Campaña 2.ª vuelta", "Día 2.ª vuelta", "Postelectoral"], right=False)
    q["menciones_por_candidato"] = {c: int(df[c].sum()) for c in CANDIDATOS}
    q["publicaciones_por_cuenta_p95"] = float(df.autor.value_counts().quantile(0.95))
    q["max_publicaciones_una_cuenta"] = int(df.autor.value_counts().max())
    df.drop(columns=["texto"]).to_parquet(BASE / "data/posts_limpios.parquet", index=False)
    json.dump(q, open(BASE / "results/calidad_datos.json", "w"), ensure_ascii=False, indent=1)
    print(json.dumps(q, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
