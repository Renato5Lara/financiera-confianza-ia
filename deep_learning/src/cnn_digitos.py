"""
cnn_digitos.py
Ejemplo de Deep Learning: red neuronal convolucional (CNN) en PyTorch que clasifica
imágenes de dígitos manuscritos (0 a 9).

Datos: conjunto "Optical Recognition of Handwritten Digits" incluido en scikit-learn
(1 797 imágenes en escala de grises de 8x8 píxeles; Alpaydin & Kaynak, UCI, 1998).
Se usa porque viene con la biblioteca: el programa se ejecuta sin descargas y en CPU.

Relación con el caso: el mismo tipo de red se usa para leer documentos escaneados
(por ejemplo, validar formularios o comprobantes de una solicitud de crédito).
"""
import json, random, time
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

SEED = 42
random.seed(SEED); np.random.seed(SEED); torch.manual_seed(SEED)
RES = Path(__file__).resolve().parents[1] / "results"; RES.mkdir(exist_ok=True)

# 1. Carga y preprocesamiento: valores 0..16 -> 0..1; forma (N, 1, 8, 8)
dig = load_digits()
X = (dig.images / 16.0).astype(np.float32)[:, None, :, :]
y = dig.target.astype(np.int64)
Xtmp, Xte, ytmp, yte = train_test_split(X, y, test_size=0.20, stratify=y, random_state=SEED)
Xtr, Xva, ytr, yva = train_test_split(Xtmp, ytmp, test_size=0.20, stratify=ytmp, random_state=SEED)
print(f"Entrenamiento={len(Xtr)} | Validación={len(Xva)} | Prueba={len(Xte)}")

def lotes(X, y, tam, barajar):
    idx = np.random.permutation(len(X)) if barajar else np.arange(len(X))
    for i in range(0, len(X), tam):
        j = idx[i:i + tam]
        yield torch.from_numpy(X[j]), torch.from_numpy(y[j])

# 2. Arquitectura
class CNN(nn.Module):
    """Conv(1->16,3x3)+ReLU -> Conv(16->32,3x3)+ReLU -> MaxPool 2x2 -> Dropout -> Dense(512->64)+ReLU -> Dense(64->10)"""
    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 16, 3, padding=1), nn.ReLU(),
            nn.Conv2d(16, 32, 3, padding=1), nn.ReLU(),
            nn.MaxPool2d(2),            # 8x8 -> 4x4
            nn.Dropout(0.25))
        self.clasificador = nn.Sequential(
            nn.Flatten(), nn.Linear(32 * 4 * 4, 64), nn.ReLU(), nn.Dropout(0.25), nn.Linear(64, 10))
    def forward(self, x):
        return self.clasificador(self.features(x))

modelo = CNN()
n_param = sum(p.numel() for p in modelo.parameters())
print("Parámetros entrenables:", n_param)
perdida = nn.CrossEntropyLoss()                       # función de pérdida para 10 clases
optim = torch.optim.Adam(modelo.parameters(), lr=1e-3)  # optimizador
EPOCAS, LOTE = 30, 32

# 3. Entrenamiento con validación y parada temprana (paciencia 5)
hist = {"perdida_ent": [], "perdida_val": [], "acc_ent": [], "acc_val": []}
mejor, paciencia, sin_mejora, mejor_estado = 1e9, 5, 0, None
t0 = time.time()
for ep in range(1, EPOCAS + 1):
    modelo.train(); tot, ok, suma = 0, 0, 0.0
    for xb, yb in lotes(Xtr, ytr, LOTE, True):
        optim.zero_grad(); out = modelo(xb); l = perdida(out, yb)
        l.backward(); optim.step()                     # retropropagación + actualización de pesos
        suma += l.item() * len(yb); ok += (out.argmax(1) == yb).sum().item(); tot += len(yb)
    modelo.eval()
    with torch.no_grad():
        outv = modelo(torch.from_numpy(Xva)); lv = perdida(outv, torch.from_numpy(yva)).item()
        accv = (outv.argmax(1).numpy() == yva).mean()
    hist["perdida_ent"].append(suma / tot); hist["acc_ent"].append(ok / tot)
    hist["perdida_val"].append(lv); hist["acc_val"].append(float(accv))
    print(f"Época {ep:2d}: pérdida ent={suma/tot:.4f} val={lv:.4f} | exactitud ent={ok/tot:.3f} val={accv:.3f}")
    if lv < mejor - 1e-4:
        mejor, sin_mejora = lv, 0; mejor_estado = {k: v.clone() for k, v in modelo.state_dict().items()}
    else:
        sin_mejora += 1
        if sin_mejora >= paciencia:
            print(f"Parada temprana en la época {ep}"); break
modelo.load_state_dict(mejor_estado)
print(f"Tiempo de entrenamiento: {time.time()-t0:.1f} s")

# 4. Evaluación en prueba
modelo.eval()
with torch.no_grad():
    prob = torch.softmax(modelo(torch.from_numpy(Xte)), 1).numpy()
pred = prob.argmax(1)
acc = accuracy_score(yte, pred)
print(f"Exactitud en prueba: {acc:.4f}")
rep = classification_report(yte, pred, digits=3, output_dict=True)
print(classification_report(yte, pred, digits=3))
json.dump({"exactitud_prueba": acc, "parametros": n_param, "epocas_ejecutadas": len(hist["perdida_ent"]),
           "reporte": rep, "historial": hist}, open(RES / "metricas_cnn.json", "w"), indent=1)
torch.save(modelo.state_dict(), RES / "cnn_digitos.pt")

# 5. Gráficos: curvas, matriz de confusión, ejemplos de predicción
ep = range(1, len(hist["perdida_ent"]) + 1)
fig, ax = plt.subplots(1, 2, figsize=(10, 3.8))
ax[0].plot(ep, hist["perdida_ent"], label="Entrenamiento"); ax[0].plot(ep, hist["perdida_val"], label="Validación")
ax[0].set_title("Pérdida (entropía cruzada)"); ax[0].set_xlabel("Época"); ax[0].legend()
ax[1].plot(ep, hist["acc_ent"], label="Entrenamiento"); ax[1].plot(ep, hist["acc_val"], label="Validación")
ax[1].set_title("Exactitud"); ax[1].set_xlabel("Época"); ax[1].legend()
plt.tight_layout(); plt.savefig(RES / "curvas_entrenamiento.png", dpi=160); plt.close()

cm = confusion_matrix(yte, pred)
plt.figure(figsize=(5.2, 4.6)); plt.imshow(cm, cmap="Blues")
for i in range(10):
    for j in range(10):
        if cm[i, j]: plt.text(j, i, cm[i, j], ha="center", va="center", fontsize=8, color="white" if cm[i, j] > cm.max()/2 else "black")
plt.xticks(range(10)); plt.yticks(range(10)); plt.xlabel("Predicción"); plt.ylabel("Real")
plt.title(f"Matriz de confusión en prueba (exactitud = {acc:.3f})", fontsize=10)
plt.tight_layout(); plt.savefig(RES / "matriz_confusion_cnn.png", dpi=160); plt.close()

errores = np.where(pred != yte)[0]; aciertos = np.where(pred == yte)[0]
muestra = list(aciertos[:8]) + list(errores[:4])
fig, axs = plt.subplots(2, 6, figsize=(10, 3.8))
for a, i in zip(axs.ravel(), muestra):
    a.imshow(Xte[i, 0], cmap="gray_r"); a.axis("off")
    a.set_title(f"real {yte[i]} / pred {pred[i]}\n({prob[i].max():.0%})", fontsize=8, color="black" if pred[i] == yte[i] else "#B42318")
plt.suptitle("Ejemplos de predicción (rojo = error)", fontsize=10); plt.tight_layout()
plt.savefig(RES / "ejemplos_prediccion.png", dpi=160); plt.close()
