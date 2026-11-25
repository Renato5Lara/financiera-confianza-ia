"""
analizar_procesos.py
Minería de procesos con PM4Py sobre el registro de eventos simulado:
  1) Descubrimiento: grafo de flujo directo (DFG) y modelo con Inductive Miner
  2) Conformidad: comparación contra el MODELO ESTÁNDAR (red de Petri construida desde
     el proceso normativo) mediante alineamientos y token-based replay
  3) Mejora: DFG de desempeño (tiempos), tiempo de ciclo frente al SLA de 24 h,
     y comparación con un escenario mejorado (también simulado)
"""
import json, sys, warnings
from pathlib import Path
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
warnings.filterwarnings("ignore")
import pm4py
from pm4py.objects.petri_net.obj import PetriNet, Marking
from pm4py.objects.petri_net.utils import petri_utils

BASE = Path(__file__).resolve().parents[1]
RES = BASE / "results"; RES.mkdir(exist_ok=True)
ESTANDAR = ["Recepción de solicitud", "Validación de identidad", "Verificación documental",
            "Evaluación de capacidad de pago", "Evaluación de riesgo", "Revisión del analista",
            "Aprobación o rechazo", "Comunicación del resultado"]


def cargar(ruta):
    df = pd.read_csv(ruta, parse_dates=["Timestamp"])
    return pm4py.format_dataframe(df, case_id="Case ID", activity_key="Activity", timestamp_key="Timestamp")


def modelo_estandar():
    """Red de Petri secuencial del proceso normativo (modelo de referencia para la conformidad)."""
    net = PetriNet("estandar"); lugares = [PetriNet.Place(f"p{i}") for i in range(len(ESTANDAR) + 1)]
    for p in lugares: net.places.add(p)
    for i, a in enumerate(ESTANDAR):
        t = PetriNet.Transition(f"t{i}", a); net.transitions.add(t)
        petri_utils.add_arc_from_to(lugares[i], t, net); petri_utils.add_arc_from_to(t, lugares[i + 1], net)
    im, fm = Marking(), Marking(); im[lugares[0]] = 1; fm[lugares[-1]] = 1
    return net, im, fm


def clasificar(traza):
    """Clasifica el tipo de desviación observado en una variante (para el informe)."""
    if traza == ESTANDAR: return "Conforme"
    if "Evaluación de riesgo" not in traza and "Revisión del analista" not in traza:
        return "Ruta no autorizada: aprobación anticipada"
    if "Evaluación de riesgo" not in traza: return "Actividad omitida: evaluación de riesgo"
    if traza.count("Verificación documental") > 1: return "Retroceso manual (retrabajo)"
    if traza.count("Evaluación de riesgo") > 1: return "Repetición por reasignación"
    return "Otra desviación"


def analizar(ruta, etiqueta, net, im, fm, graficos=True):
    log = cargar(ruta)
    # --- Descubrimiento
    if graficos:
        dfg, sa, ea = pm4py.discover_dfg(log)
        pm4py.save_vis_dfg(dfg, sa, ea, str(RES / f"dfg_frecuencia_{etiqueta}.png"), rankdir="TB")
        perf, sa2, ea2 = pm4py.discover_performance_dfg(log)
        pm4py.save_vis_performance_dfg(perf, sa2, ea2, str(RES / f"dfg_desempeno_{etiqueta}.png"), rankdir="TB")
        net_d, im_d, fm_d = pm4py.discover_petri_net_inductive(log, noise_threshold=0.2)
        pm4py.save_vis_petri_net(net_d, im_d, fm_d, str(RES / f"petri_descubierto_{etiqueta}.png"))
        bpmn = pm4py.convert_to_bpmn(net_d, im_d, fm_d)
        pm4py.save_vis_bpmn(bpmn, str(RES / f"bpmn_descubierto_{etiqueta}.png"))
    variantes = pm4py.get_variants(log)
    filas = [{"variante": " → ".join(v), "casos": (len(c) if isinstance(c, list) else int(c)), "tipo": clasificar(list(v))} for v, c in variantes.items()]
    var = pd.DataFrame(filas).sort_values("casos", ascending=False)
    # --- Conformidad (alineamientos contra el modelo estándar)
    al = pm4py.conformance_diagnostics_alignments(log, net, im, fm)
    fit_al = pm4py.fitness_alignments(log, net, im, fm)
    tbr = pm4py.fitness_token_based_replay(log, net, im, fm)
    conformes = sum(1 for a in al if a["fitness"] == 1.0)
    n = len(al)
    # --- Mejora / desempeño: tiempo de ciclo
    df = log.copy()
    ciclo = df.groupby("case:concept:name")["time:timestamp"].agg(lambda s: (s.max() - s.min()).total_seconds() / 3600)
    act_rep = df.groupby("case:concept:name")["concept:name"].apply(lambda s: s.duplicated().any())
    res = {"escenario": etiqueta, "casos": n, "eventos": len(df), "variantes": len(var),
           "pct_conformes": round(100 * conformes / n, 1), "pct_no_conformes": round(100 * (n - conformes) / n, 1),
           "fitness_alineamientos": round(fit_al["log_fitness"], 4), "fitness_token_replay": round(tbr["log_fitness"], 4),
           "pct_retrabajo": round(100 * act_rep.mean(), 1), "ciclo_medio_h": round(ciclo.mean(), 1),
           "ciclo_mediana_h": round(ciclo.median(), 1), "pct_dentro_24h": round(100 * (ciclo <= 24).mean(), 1)}
    tipos = var.groupby("tipo")["casos"].sum().sort_values(ascending=False)
    res["desviaciones_por_tipo"] = {k: int(v) for k, v in tipos.items()}
    var.to_csv(RES / f"variantes_{etiqueta}.csv", index=False, encoding="utf-8")
    return res, ciclo


def main():
    net, im, fm = modelo_estandar()
    pm4py.save_vis_petri_net(net, im, fm, str(RES / "petri_modelo_estandar.png"))
    r1, c1 = analizar(BASE / "data/event_log_actual.csv", "actual", net, im, fm)
    r2, c2 = analizar(BASE / "data/event_log_mejorado.csv", "mejorado", net, im, fm, graficos=False)
    for r in (r1, r2): print(json.dumps(r, ensure_ascii=False))
    json.dump([r1, r2], open(RES / "indicadores_conformidad.json", "w"), ensure_ascii=False, indent=1)
    # Gráfico: distribución del tiempo de ciclo frente al SLA
    plt.figure(figsize=(7, 4))
    plt.hist(c1.clip(upper=80), bins=40, alpha=0.65, label=f"Actual simulado ({r1['pct_dentro_24h']} % ≤ 24 h)")
    plt.hist(c2.clip(upper=80), bins=40, alpha=0.65, label=f"Escenario mejorado simulado ({r2['pct_dentro_24h']} % ≤ 24 h)")
    plt.axvline(24, color="#B42318", ls="--", label="SLA 24 h")
    plt.xlabel("Tiempo de ciclo del expediente (horas; recortado en 80)"); plt.ylabel("Expedientes")
    plt.title("Tiempo de ciclo de la evaluación crediticia (datos simulados)"); plt.legend(fontsize=8)
    plt.tight_layout(); plt.savefig(RES / "tiempo_ciclo_sla.png", dpi=160); plt.close()
    # Gráfico: desviaciones por tipo (actual)
    t = pd.Series(r1["desviaciones_por_tipo"]).drop("Conforme", errors="ignore")
    plt.figure(figsize=(7, 3.4)); plt.barh(t.index[::-1], t.values[::-1], color="#1F3B63")
    for i, v in enumerate(t.values[::-1]): plt.text(v + 3, i, str(v), va="center", fontsize=8)
    plt.title("Expedientes no conformes por tipo de desviación (log actual simulado)"); plt.xlabel("Expedientes")
    plt.tight_layout(); plt.savefig(RES / "desviaciones_por_tipo.png", dpi=160); plt.close()


if __name__ == "__main__":
    main()
