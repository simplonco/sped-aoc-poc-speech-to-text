const button = document.querySelector("#record-btn");
const statusEl = document.querySelector("#status");
const transcriptEl = document.querySelector("#transcript");
const settingsEl = document.querySelector("#settings");

const SAMPLE_RATE = 16000; // Whisper attend de l'audio mono à 16 kHz

// iPadOS se présente comme un Mac : on le repère à son écran tactile
const isMobile =
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// Sur smartphone, un encodeur fp32 dépasse la mémoire allouée à un onglet (iOS recharge la page
// en boucle) : modèle plus petit, entièrement compressé en q8, sur le CPU (q8 est mal géré par WebGPU).
// Sur ordinateur, même quantification sur GPU et CPU pour que la qualité ne dépende pas du matériel.
const CONFIG = isMobile
  ? {
      model: "onnx-community/whisper-base",
      dtype: { encoder_model: "q8", decoder_model_merged: "q8" },
      device: "wasm",
    }
  : {
      model: "onnx-community/whisper-small",
      dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
      device: "auto",
    };

const worker = new Worker("worker.js", { type: "module" });
worker.postMessage({ type: "load", config: CONFIG });

let modelReady = false;
let mediaRecorder = null;
let chunks = [];
let audioSeconds = 0;

const deviceLabel = (device) => (device === "webgpu" ? "GPU" : "CPU");
const formatSeconds = (s) => `${s.toFixed(1).replace(".", ",")} s`;

function showSettings(device) {
  settingsEl.textContent = [
    `Appareil : ${isMobile ? "mobile" : "ordinateur"}`,
    `Modèle : ${CONFIG.model.split("/").pop()}`,
    `Encodeur : ${CONFIG.dtype.encoder_model}`,
    `Décodeur : ${CONFIG.dtype.decoder_model_merged}`,
    `Calcul : ${device ? deviceLabel(device) : "…"}`,
  ].join(" · ");
}
showSettings();

button.disabled = true;
statusEl.textContent = "Chargement du modèle…";

worker.addEventListener("message", (e) => {
  const msg = e.data;
  switch (msg.type) {
    case "progress":
      if (!modelReady) {
        statusEl.textContent = `Chargement du modèle…\n${msg.file} (${Math.round(msg.progress)} %)`;
      }
      break;
    case "ready":
      modelReady = true;
      button.disabled = false;
      showSettings(msg.device);
      statusEl.textContent = `Modèle prêt (${deviceLabel(msg.device)})`;
      break;
    case "result":
      transcriptEl.textContent = msg.text || "";
      statusEl.textContent = msg.text
        ? `${formatSeconds(audioSeconds)} d'audio transcrites en ${formatSeconds(msg.duration / 1000)} (${deviceLabel(msg.device)})`
        : "Rien n'a été entendu.";
      button.disabled = false;
      break;
    case "error":
      statusEl.textContent = `Erreur : ${msg.message}`;
      button.disabled = !modelReady;
      break;
  }
});

button.addEventListener("click", () => {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
  } else {
    startRecording();
  }
});

async function startRecording() {
  // Le micro n'est accessible qu'en HTTPS (ou sur localhost)
  if (!navigator.mediaDevices?.getUserMedia) {
    statusEl.textContent = window.isSecureContext
      ? "Ce navigateur ne permet pas d'accéder au micro."
      : "Accès au micro impossible : la page doit être servie en HTTPS.";
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    statusEl.textContent = `Micro inaccessible : ${err.message}`;
    return;
  }

  chunks = [];
  transcriptEl.textContent = "";
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.addEventListener("dataavailable", (e) => chunks.push(e.data));

  mediaRecorder.addEventListener("stop", async () => {
    stream.getTracks().forEach((t) => t.stop()); // libère le micro
    button.textContent = "Enregistrer";
    button.classList.remove("recording");
    button.disabled = true;
    statusEl.textContent = "Transcription en cours…";

    const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
    const audio = await blobToFloat32(blob);
    audioSeconds = audio.length / SAMPLE_RATE;
    worker.postMessage({ type: "transcribe", audio }, [audio.buffer]);
  });

  mediaRecorder.start();
  button.textContent = "Arrêter";
  button.classList.add("recording");
  statusEl.textContent = "Enregistrement en cours…";
}

// Décode l'audio enregistré (webm/ogg…) en échantillons bruts à 16 kHz
async function blobToFloat32(blob) {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  await ctx.close();
  return decoded.getChannelData(0);
}
