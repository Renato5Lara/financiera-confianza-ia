"""
prepare_data.py
Carga y prepara el conjunto público Statlog (German Credit Data).
Fuente: Hofmann, H. (1994). UCI Machine Learning Repository. https://doi.org/10.24432/C5NC77
Licencia: CC BY 4.0.

Decisiones de preparación:
- Se renombran las 20 variables con nombres en español.
- Se EXCLUYEN 'estado_civil_sexo' y 'trabajador_extranjero' por ser atributos sensibles
  que no deben usarse para decidir un crédito. 'edad' se conserva solo para el análisis
  de equidad y NO entra al modelo.
- Variable objetivo: incumplimiento = 1 si la clase original es 2 ("mal pagador").
"""
from pathlib import Path
import pandas as pd

DATA = Path(__file__).resolve().parents[1] / "data" / "german.data"
URL = "https://archive.ics.uci.edu/ml/machine-learning-databases/statlog/german/german.data"

COLUMNAS = [
    "estado_cuenta_corriente", "duracion_meses", "historial_crediticio", "proposito", "monto_credito",
    "ahorros", "antiguedad_empleo", "cuota_pct_ingreso", "estado_civil_sexo", "otros_deudores",
    "anios_residencia", "propiedad", "edad", "otros_planes_pago", "vivienda",
    "creditos_vigentes", "tipo_empleo", "personas_a_cargo", "telefono", "trabajador_extranjero", "clase",
]
SENSIBLES = ["estado_civil_sexo", "trabajador_extranjero"]
SOLO_EQUIDAD = ["edad"]


def cargar() -> pd.DataFrame:
    """Lee el archivo (lo descarga si no existe) y devuelve un DataFrame limpio."""
    if not DATA.exists():
        import urllib.request
        DATA.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(URL, DATA)
    df = pd.read_csv(DATA, sep=" ", header=None, names=COLUMNAS)
    df["incumplimiento"] = (df.pop("clase") == 2).astype(int)
    return df


def variables(df: pd.DataFrame):
    """Separa X (sin atributos sensibles ni edad), y, y la edad para el análisis de equidad."""
    y = df["incumplimiento"]
    edad = df["edad"]
    X = df.drop(columns=["incumplimiento"] + SENSIBLES + SOLO_EQUIDAD)
    categoricas = [c for c in X.columns if not pd.api.types.is_numeric_dtype(X[c])]
    numericas = [c for c in X.columns if c not in categoricas]
    return X, y, edad, categoricas, numericas


if __name__ == "__main__":
    d = cargar()
    X, y, edad, cat, num = variables(d)
    print("Registros:", len(d), "| Variables usadas:", X.shape[1], "| Categóricas:", len(cat), "| Numéricas:", len(num))
    print("Valores faltantes:", int(d.isna().sum().sum()), "| Duplicados:", int(d.duplicated().sum()))
    print("Tasa de incumplimiento:", round(y.mean(), 3))
