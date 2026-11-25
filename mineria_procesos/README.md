# Minería de procesos con PM4Py (descubrimiento, conformidad y mejora)

Analiza un **registro de eventos simulado** del proceso de evaluación crediticia de Financiera Confianza Perú
(caso de estudio). El simulador reproduce el dato del caso (alrededor de 35 % de expedientes desviados) con cuatro tipos de desviación.
**No son datos reales de la entidad.**

## Ejecución
```bash
pip install -r requirements.txt     # requiere también Graphviz instalado en el sistema
python src/generar_log.py                                   # log actual simulado (35 %)
python src/generar_log.py --desviacion 0.10 --seed 11 --salida data/event_log_mejorado.csv   # escenario hipotético
python src/analizar_procesos.py
```

## Resultados (24/11/2026)
| Indicador | Log actual (simulado) | Escenario mejorado (hipotético) |
|---|---|---|
| Expedientes conformes | 63,4 % | 91,5 % |
| Fitness por alineamientos | 0,955 | 0,988 |
| Retrabajo | 17,0 % | 4,4 % |
| Tiempo de ciclo medio | 20,7 h | 17,8 h |
| Dentro de 24 h | 71,8 % | 79,5 % |

El escenario mejorado es un supuesto para mostrar cómo se verificaría una mejora; no es un resultado obtenido.
Imágenes en `results/`: DFG de frecuencia y desempeño, red de Petri descubierta, BPMN descubierto, modelo estándar, tiempo de ciclo y desviaciones.
