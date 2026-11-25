"""
collect_data.py
Recolecta publicaciones PUBLICAS de Bluesky sobre las Elecciones Generales Peru 2026
usando el endpoint oficial y abierto app.bsky.feed.searchPosts (AppView api.bsky.app).

Modos:
  --modo historico : reconstruccion temporal dia por dia entre --desde y --hasta
  --modo vivo      : ultimas --horas horas (permite repetir la ejecucion en "tiempo real")

Privacidad: no se guarda el handle ni el nombre del autor; el DID se reemplaza por un
hash SHA-256 truncado. Los textos se usan solo para el analisis y no se publican en el repositorio.
"""
import argparse, hashlib, json, time, datetime as dt
from pathlib import Path
import requests

API = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts"
CONSULTAS = {  # consulta -> paginas maximas por dia
    "Keiko Fujimori": 2, "Fujimori": 2, "Roberto Sánchez": 2, "Juntos por el Perú": 1,
    "Fuerza Popular": 1, "López Aliaga": 1, "elecciones Perú": 2, "segunda vuelta Perú": 1,
}
UA = {"User-Agent": "UPAO-SII-laboratorio-academico/1.0"}

def seudonimo(did: str) -> str:
    return hashlib.sha256(did.encode()).hexdigest()[:16]

def buscar(q, desde, hasta, paginas, pausa=0.4):
    cursor, out = None, []
    for _ in range(paginas):
        p = {"q": q, "lang": "es", "since": desde, "until": hasta, "limit": 100, "sort": "latest"}
        if cursor: p["cursor"] = cursor
        for intento in range(3):  # reintentos ante fallos transitorios
            try:
                r = requests.get(API, params=p, headers=UA, timeout=30)
                if r.status_code == 200: break
                time.sleep(2 + intento * 3)
            except requests.RequestException:
                time.sleep(2 + intento * 3)
        else:
            break
        d = r.json()
        for x in d.get("posts", []):
            rec = x.get("record", {})
            out.append({
                "uri_hash": hashlib.sha256(x["uri"].encode()).hexdigest()[:20],
                "autor": seudonimo(x["author"]["did"]),
                "creado": rec.get("createdAt"), "indexado": x.get("indexedAt"),
                "texto": rec.get("text", ""), "idiomas": rec.get("langs"),
                "likes": x.get("likeCount", 0), "reposts": x.get("repostCount", 0),
                "respuestas": x.get("replyCount", 0), "consulta": q,
            })
        cursor = d.get("cursor")
        time.sleep(pausa)
        if not cursor: break
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--modo", choices=["historico", "vivo"], default="historico")
    ap.add_argument("--desde", default="2026-03-15")
    ap.add_argument("--hasta", default="2026-06-14")
    ap.add_argument("--horas", type=int, default=24)
    ap.add_argument("--salida", default="data/raw_bluesky.jsonl")
    a = ap.parse_args()
    Path(a.salida).parent.mkdir(parents=True, exist_ok=True)
    extraccion = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    if a.modo == "vivo":
        fin = dt.datetime.now(dt.timezone.utc); ini = fin - dt.timedelta(hours=a.horas)
        ventanas = [(ini, fin)]
    else:
        d0 = dt.datetime.fromisoformat(a.desde).replace(tzinfo=dt.timezone.utc)
        d1 = dt.datetime.fromisoformat(a.hasta).replace(tzinfo=dt.timezone.utc)
        ventanas = [(d0 + dt.timedelta(days=i), d0 + dt.timedelta(days=i + 1)) for i in range((d1 - d0).days + 1)]
    n = 0
    with open(a.salida, "a", encoding="utf-8") as f:
        for ini, fin in ventanas:
            for q, pags in CONSULTAS.items():
                for reg in buscar(q, ini.isoformat().replace("+00:00", "Z"), fin.isoformat().replace("+00:00", "Z"), pags):
                    reg["extraccion"] = extraccion
                    f.write(json.dumps(reg, ensure_ascii=False) + "\n"); n += 1
            print(ini.date(), "acumulado", n, flush=True)
    json.dump({"fuente": API, "modo": a.modo, "extraccion_utc": extraccion, "desde": a.desde, "hasta": a.hasta,
               "consultas": CONSULTAS, "registros_brutos": n}, open(Path(a.salida).with_suffix(".meta.json"), "w"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main()
