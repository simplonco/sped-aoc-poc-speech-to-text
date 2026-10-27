const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const button = document.querySelector("#record-btn");
const statusEl = document.querySelector("#status");
const transcriptEl = document.querySelector("#transcript");

if (!SpeechRecognition) {
  button.disabled = true;
  statusEl.textContent = "La reconnaissance vocale n'est pas supportée par ce navigateur (essayez Chrome ou Edge).";
} else {
  const rec = new SpeechRecognition();
  rec.lang = "fr-FR";
  rec.continuous = true;      // ne s'arrête pas au premier silence
  rec.interimResults = true;  // résultats provisoires pendant que l'on parle

  let isRecording = false;
  let finalText = "";

  button.addEventListener("click", () => {
    if (isRecording) {
      isRecording = false;
      rec.stop();
    } else {
      finalText = "";
      transcriptEl.textContent = "";
      isRecording = true;
      rec.start();
    }
  });

  rec.addEventListener("start", () => {
    button.textContent = "Arrêter";
    button.classList.add("recording");
    statusEl.textContent = "Enregistrement en cours…";
  });

  rec.addEventListener("result", (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const text = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        finalText += text + " ";
      } else {
        interim += text;
      }
    }
    transcriptEl.innerHTML = "";
    transcriptEl.append(finalText);
    if (interim) {
      const span = document.createElement("span");
      span.className = "interim";
      span.textContent = interim;
      transcriptEl.append(span);
    }
  });

  rec.addEventListener("end", () => {
    // Le navigateur peut couper tout seul après un long silence : on relance
    if (isRecording) {
      rec.start();
      return;
    }
    button.textContent = "Enregistrer";
    button.classList.remove("recording");
    transcriptEl.textContent = finalText.trim();
    statusEl.textContent = finalText ? "" : "Rien n'a été entendu.";
  });

  rec.addEventListener("error", (e) => {
    if (e.error === "no-speech") return;
    isRecording = false;
    statusEl.textContent = `Erreur : ${e.error}`;
  });
}
