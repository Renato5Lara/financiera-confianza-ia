# Deep Learning: red neuronal convolucional (CNN) con PyTorch

Clasifica imágenes de dígitos manuscritos (0 a 9) del conjunto *Optical Recognition of Handwritten Digits*
incluido en scikit-learn (1 797 imágenes de 8×8; Alpaydin y Kaynak, UCI). No requiere descargas ni GPU.

## Arquitectura
Conv2d(1→16, 3×3) + ReLU → Conv2d(16→32, 3×3) + ReLU → MaxPool 2×2 → Dropout 0,25 → Dense(512→64) + ReLU → Dropout 0,25 → Dense(64→10).
Pérdida: entropía cruzada. Optimizador: Adam (lr = 0,001). Lote: 32. Hasta 30 épocas con parada temprana (paciencia 5).
Partición estratificada: 1 149 entrenamiento, 288 validación, 360 prueba. Semilla 42.

## Ejecución
```bash
pip install -r requirements.txt
python src/cnn_digitos.py
```

## Resultado (24/11/2026)
Exactitud en prueba: **98,33 %** (360 imágenes). Archivos en `results/`: `curvas_entrenamiento.png`, `matriz_confusion_cnn.png`,
`ejemplos_prediccion.png`, `metricas_cnn.json`, `cnn_digitos.pt`, `salida_entrenamiento.txt`.

## Limitaciones
Imágenes muy pequeñas y limpias; no representa documentos reales escaneados. Es una demostración del funcionamiento de una CNN.
