const button = document.querySelector("#record-btn");
const statusEl = document.querySelector("#status");
const transcriptEl = document.querySelector("#transcript");

const SAMPLE_RATE = 16000; // Whisper attend de l'audio mono à 16 kHz

const worker = new Worker("worker.js", { type: "module" });

let modelReady = false;
let mediaRecorder = null;
let chunks = [];

button.disabled = true;
statusEl.textContent = "Chargement du modèle…";

worker.addEventListener("message", (e) => {
  const msg = e.data;
  switch (msg.type) {
    case "progress":
      if (!modelReady) {
        statusEl.textContent = `Chargement du modèle… ${msg.file} (${Math.round(msg.progress)} %)`;
      }
      break;
    case "ready":
      modelReady = true;
      button.disabled = false;
      statusEl.textContent = `Modèle prêt (${msg.device === "webgpu" ? "GPU" : "CPU"})`;
      break;
    case "result":
      transcriptEl.textContent = msg.text || "";
      statusEl.textContent = msg.text ? "" : "Rien n'a été entendu.";
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
