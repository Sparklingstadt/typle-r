# 手書きパッドの認識モデル

Typle Writing の手書きパッドが、端末の中で手書きを読むために使うモデルです。

| ファイル | 元 |
|---|---|
| `ko/korean_PP-OCRv5_mobile_rec.onnx` | PaddleOCR の `korean_PP-OCRv5_mobile_rec`（Apache License 2.0）を ONNX にしたもの。[ppu-paddle-ocr-models](https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models) の `recognition/multi/korean/v5/`（コミット `384182c7187c12d4ea181ae3b97c8b7e12089d9d`、SHA-256 `ee0dfde503d787c91fd0455daae2eb85311b4b5bdcddf85a54d8c1e0adc157de`） |
| `ko/ppocrv5_korean_dict.txt` | 同じ場所の文字の辞書 |
| `LICENSE-models.txt` | ppu-paddle-ocr-models の Apache License 2.0 |

`ort/` は `npm install` のたびに `scripts/copy-handwriting-runtime.cjs` が `onnxruntime-web` からコピーするもので、リポジトリには入れません。
