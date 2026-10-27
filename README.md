# POC Speech-to-text – Dictaphone

Dictaphone web : on clique sur « Enregistrer », on parle, on clique à nouveau et le texte s'affiche.

La transcription est faite **dans le navigateur** avec [Whisper](https://huggingface.co/onnx-community/whisper-base) via [Transformers.js](https://huggingface.co/docs/transformers.js) : l'audio ne quitte jamais la machine. Seul le modèle (~80 Mo) est téléchargé au premier chargement, puis mis en cache.

**Démo :** https://simplonco.github.io/sped-aoc-poc-speech-to-text/

## Lancer en local

```bash
npx serve .
```

Le micro n'est accessible qu'en HTTPS ou sur `localhost`.

## Fichiers

- `index.html` / `style.css` : la page
- `script.js` : enregistrement du micro (`MediaRecorder`) et conversion en audio 16 kHz
- `worker.js` : chargement et exécution de Whisper dans un Web Worker (WebGPU si dispo, sinon WASM)

## Déploiement

Chaque push sur `main` déploie le site sur GitHub Pages (`.github/workflows/deploy.yml`).
