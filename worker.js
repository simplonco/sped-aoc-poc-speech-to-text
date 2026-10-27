// Le modèle tourne dans un Web Worker pour ne pas figer la page pendant la transcription.
import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

// whisper-tiny : plus rapide, moins précis · whisper-small : plus précis, plus lourd
const MODEL = "onnx-community/whisper-base";

// Même quantification sur GPU et CPU pour que la qualité ne dépende pas du matériel
// (q8 n'est pas géré correctement par WebGPU, q4 l'est par les deux)
const DTYPE = { encoder_model: "fp32", decoder_model_merged: "q4" };

let transcriber = null;
let device = null;

async function hasWebGPU() {
  try {
    return !!(navigator.gpu && (await navigator.gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function load() {
  const progress_callback = (p) => {
    if (p.status === "progress") {
      self.postMessage({ type: "progress", file: p.file, progress: p.progress });
    }
  };

  // WebGPU si dispo (beaucoup plus rapide), sinon WASM sur le CPU
  if (await hasWebGPU()) {
    try {
      transcriber = await pipeline("automatic-speech-recognition", MODEL, {
        device: "webgpu",
        dtype: DTYPE,
        progress_callback,
      });
      return "webgpu";
    } catch (err) {
      console.warn("WebGPU indisponible, repli sur WASM", err);
    }
  }

  transcriber = await pipeline("automatic-speech-recognition", MODEL, {
    device: "wasm",
    dtype: DTYPE,
    progress_callback,
  });
  return "wasm";
}

const ready = load()
  .then((d) => {
    device = d;
    self.postMessage({ type: "ready", device });
  })
  .catch((err) => self.postMessage({ type: "error", message: err.message }));

self.addEventListener("message", async (e) => {
  if (e.data.type !== "transcribe") return;
  await ready;
  try {
    const start = performance.now();
    const output = await transcriber(e.data.audio, {
      language: "french",
      task: "transcribe",
      chunk_length_s: 30, // permet des enregistrements de plus de 30 s
      stride_length_s: 5,
    });
    self.postMessage({
      type: "result",
      text: output.text.trim(),
      duration: performance.now() - start,
      device,
    });
  } catch (err) {
    self.postMessage({ type: "error", message: err.message });
  }
});
