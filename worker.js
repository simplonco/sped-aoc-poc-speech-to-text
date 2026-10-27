// Le modèle tourne dans un Web Worker pour ne pas figer la page pendant la transcription.
import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

// Le modèle et la quantification sont choisis par la page (script.js) selon l'appareil.

let transcriber = null;
let device = null;

async function hasWebGPU() {
  try {
    return !!(navigator.gpu && (await navigator.gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function load({ model, dtype }) {
  const progress_callback = (p) => {
    if (p.status === "progress") {
      self.postMessage({ type: "progress", file: p.file, progress: p.progress });
    }
  };

  // WebGPU si dispo (beaucoup plus rapide), sinon WASM sur le CPU
  if (await hasWebGPU()) {
    try {
      transcriber = await pipeline("automatic-speech-recognition", model, {
        device: "webgpu",
        dtype,
        progress_callback,
      });
      return "webgpu";
    } catch (err) {
      console.warn("WebGPU indisponible, repli sur WASM", err);
    }
  }

  transcriber = await pipeline("automatic-speech-recognition", model, {
    device: "wasm",
    dtype,
    progress_callback,
  });
  return "wasm";
}

let ready = null;

self.addEventListener("message", async (e) => {
  if (e.data.type === "load") {
    ready = load(e.data.config)
      .then((d) => {
        device = d;
        self.postMessage({ type: "ready", device });
      })
      .catch((err) => self.postMessage({ type: "error", message: err.message }));
    return;
  }
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
