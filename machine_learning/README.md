# Machine Learning: riesgo crediticio (probabilidad de incumplimiento)

Programa independiente que entrena y compara **regresión logística**, **Random Forest** y **Gradient Boosting**
para estimar la probabilidad de incumplimiento, y un **Isolation Forest** como detector de anomalías separado.

## Datos
- Statlog (German Credit Data), 1 000 solicitudes reales anonimizadas de un banco alemán (Hofmann, 1994),
  UCI Machine Learning Repository, https://doi.org/10.24432/C5NC77, licencia CC BY 4.0.
- Se descarga a `data/german.data` (incluido; SHA-256 `b21f3d81...5871`).
- **No son datos de Financiera Confianza Perú**: se usan como sustituto público para demostrar el método.
- Se excluyen del modelo `estado_civil_sexo` y `trabajador_extranjero` (atributos sensibles); `edad` solo se usa para el análisis de equidad.

## Ejecución
```bash
pip install -r requirements.txt
python src/prepare_data.py          # verificación de calidad del conjunto
cd src && python train_evaluate.py  # entrenamiento, evaluación y gráficos
python predict.py                   # simula la API de inferencia que consumiría el ERP
```

## Resultados (ejecución del 24/11/2026, semilla 42; ver `results/`)
| Modelo | AUC (CV 5) | AUC prueba | Accuracy | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| Regresión logística | 0,764 ± 0,022 | 0,800 | 0,528 | 0,380 | 0,907 | 0,535 |
| Random Forest | 0,788 ± 0,012 | 0,791 | 0,564 | 0,398 | 0,880 | 0,548 |
| Gradient Boosting | 0,772 ± 0,021 | 0,789 | 0,548 | 0,391 | 0,907 | 0,546 |

El umbral se elige minimizando el costo del conjunto (no detectar un mal pagador cuesta 5; rechazar a un buen pagador cuesta 1),
por eso el recall es alto y la accuracy baja. Archivos: `metricas_modelos.csv/json`, `roc_modelos.png`, `matriz_confusion.png`,
`calibracion.png`, `coeficientes_logistica.png`, `equidad_por_edad.csv`, `isolation_forest.png/json`, `salida_*.txt`.

## Limitaciones
Conjunto pequeño (1 000 casos) y antiguo; contexto distinto al microcrédito peruano; sin validación temporal; el modelo es una
demostración académica, no un sistema para producción. La decisión crediticia siempre la toma una persona.
