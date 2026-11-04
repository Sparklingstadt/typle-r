// Copies the WebAssembly runtime of onnxruntime-web into public/handwriting/ort, where the handwriting pad loads it
// (src/lib/handwritingRecognizer.ts). Run on every install and before a build, so the copy always matches the installed
// package; the copy is not committed.
const fs = require('node:fs')
const path = require('node:path')

const files = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']
const from = path.join(__dirname, '..', 'node_modules', 'onnxruntime-web')
const to = path.join(__dirname, '..', 'public', 'handwriting', 'ort')
fs.mkdirSync(to, { recursive: true })
for (const file of files) fs.copyFileSync(path.join(from, 'dist', file), path.join(to, file))
