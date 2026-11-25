"""
generar_log.py
Genera un registro de eventos SIMULADO del proceso de evaluación crediticia de
Financiera Confianza Perú (caso de estudio). No son datos reales de la entidad.

Parámetro del caso: aproximadamente el 35 % de los expedientes se desvía del proceso estándar.
Tipos de desviación simulados (supuestos de diseño):
  - salto_riesgo     : pasa de verificación documental a revisión sin evaluación de riesgo
  - retroceso        : la revisión devuelve el expediente a verificación documental (retrabajo)
  - aprob_anticipada : se aprueba directamente después de la capacidad de pago
  - reasignacion     : la evaluación de riesgo se reasigna a otro analista y se repite
"""
import argparse, random
from datetime import datetime, timedelta
import pandas as pd

ESTANDAR = ["Recepción de solicitud", "Validación de identidad", "Verificación documental",
            "Evaluación de capacidad de pago", "Evaluación de riesgo", "Revisión del analista",
            "Aprobación o rechazo", "Comunicación del resultado"]
SISTEMA = {"Recepción de solicitud": "Plataforma móvil", "Validación de identidad": "Servicio de identidad",
           "Comunicación del resultado": "Plataforma móvil"}
DUR_H = {  # duración media (horas) de espera + ejecución antes de cada actividad
    "Validación de identidad": 0.2, "Verificación documental": 3.0, "Evaluación de capacidad de pago": 2.5,
    "Evaluación de riesgo": 3.5, "Revisión del analista": 4.0, "Aprobación o rechazo": 3.0, "Comunicación del resultado": 0.5}


def traza(tipo, rnd):
    t = list(ESTANDAR)
    if tipo == "salto_riesgo": t.remove("Evaluación de riesgo")
    elif tipo == "retroceso":
        i = t.index("Revisión del analista") + 1
        t[i:i] = ["Verificación documental", "Evaluación de capacidad de pago", "Evaluación de riesgo", "Revisión del analista"]
    elif tipo == "aprob_anticipada":
        t = t[:4] + ["Aprobación o rechazo", "Comunicación del resultado"]
    elif tipo == "reasignacion":
        i = t.index("Evaluación de riesgo") + 1; t[i:i] = ["Evaluación de riesgo"]
    return t


def generar(n, p_desv, seed, desde="2026-01-05 08:00"):
    rnd = random.Random(seed); filas = []
    inicio = datetime.fromisoformat(desde)
    tipos = ["salto_riesgo", "retroceso", "aprob_anticipada", "reasignacion"]
    for k in range(1, n + 1):
        tipo = rnd.choice(tipos) if rnd.random() < p_desv else "conforme"
        ts = inicio + timedelta(minutes=rnd.randint(0, 60 * 24 * 50))
        analistas = rnd.sample(["Analista A", "Analista B", "Analista C", "Analista D"], 2)
        for j, act in enumerate(traza(tipo, rnd)):
            if j: ts += timedelta(hours=rnd.expovariate(1 / DUR_H.get(act, 1.0)) * (1.6 if tipo != "conforme" else 1.0))
            rec = SISTEMA.get(act) or ("Jefe de agencia" if act == "Aprobación o rechazo" else analistas[0 if j < 5 else 1])
            if tipo == "reasignacion" and act == "Evaluación de riesgo" and any(f["Case ID"] == f"CR-{k:04d}" and f["Activity"] == act for f in filas[-6:]):
                rec = analistas[1]
            filas.append({"Case ID": f"CR-{k:04d}", "Activity": act, "Timestamp": ts, "Resource": rec,
                          "Status": "Completado", "System": SISTEMA.get(act, "Core financiero"), "tipo_simulado": tipo})
    return pd.DataFrame(filas)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--casos", type=int, default=1000); ap.add_argument("--desviacion", type=float, default=0.35)
    ap.add_argument("--seed", type=int, default=7); ap.add_argument("--salida", default="data/event_log_actual.csv")
    a = ap.parse_args()
    df = generar(a.casos, a.desviacion, a.seed); df.to_csv(a.salida, index=False)
    print(f"{a.salida}: {df['Case ID'].nunique()} casos, {len(df)} eventos, "
          f"desviados simulados={round((df.groupby('Case ID').tipo_simulado.first()!='conforme').mean()*100,1)} %")
