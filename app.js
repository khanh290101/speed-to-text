import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

env.allowLocalModels = false;

const TARGET_SAMPLE_RATE = 16000;

const elements = {
  audioFile: document.querySelector("#audioFile"),
  dropZone: document.querySelector("#dropZone"),
  fileName: document.querySelector("#fileName"),
  audioPreview: document.querySelector("#audioPreview"),
  recordButton: document.querySelector("#recordButton"),
  recordingStatus: document.querySelector("#recordingStatus"),
  modelSelect: document.querySelector("#modelSelect"),
  languageSelect: document.querySelector("#languageSelect"),
  useWebGPU: document.querySelector("#useWebGPU"),
  transcribeButton: document.querySelector("#transcribeButton"),
  copyButton: document.querySelector("#copyButton"),
  clearButton: document.querySelector("#clearButton"),
  resultText: document.querySelector("#resultText"),
  runtimeStatus: document.querySelector("#runtimeStatus"),
  progressBar: document.querySelector("#progressBar"),
};

let currentFile = null;
let mediaRecorder = null;
let recordedChunks = [];
let cachedPipeline = null;
let cachedModelKey = "";

function setStatus(message) {
  elements.runtimeStatus.textContent = message;
}

function setProgress(value) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  elements.progressBar.style.width = `${percent}%`;
}

function setBusy(isBusy) {
  elements.transcribeButton.disabled = isBusy || !currentFile;
  elements.transcribeButton.classList.toggle("is-busy", isBusy);
  elements.modelSelect.disabled = isBusy;
  elements.languageSelect.disabled = isBusy;
  elements.useWebGPU.disabled = isBusy;
}

function selectAudioFile(file) {
  if (!file) return;

  currentFile = file;
  elements.fileName.textContent = `${file.name} (${formatBytes(file.size)})`;
  elements.audioPreview.src = URL.createObjectURL(file);
  elements.audioPreview.style.display = "block";
  elements.transcribeButton.disabled = false;
  setStatus("Sẵn sàng");
  setProgress(0);
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

async function decodeAudio(file) {
  setStatus("Đang đọc audio");
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextClass();
  const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));

  const offlineContext = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * TARGET_SAMPLE_RATE),
    TARGET_SAMPLE_RATE,
  );
  const source = offlineContext.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineContext.destination);
  source.start(0);

  const rendered = await offlineContext.startRendering();
  await audioContext.close();
  return rendered.getChannelData(0);
}

async function getTranscriber() {
  const model = elements.modelSelect.value;
  const device = elements.useWebGPU.checked ? "webgpu" : "wasm";
  const modelKey = `${model}:${device}`;

  if (cachedPipeline && cachedModelKey === modelKey) {
    return cachedPipeline;
  }

  cachedPipeline = null;
  cachedModelKey = modelKey;
  setStatus("Đang tải model");
  setProgress(3);

  cachedPipeline = await pipeline("automatic-speech-recognition", model, {
    device,
    dtype: "q8",
    progress_callback: (progress) => {
      if (progress.status === "progress" && progress.progress) {
        setProgress(Math.min(65, progress.progress * 0.65));
      }
      if (progress.status === "ready") {
        setProgress(70);
      }
    },
  });

  setStatus("Model đã sẵn sàng");
  setProgress(70);
  return cachedPipeline;
}

async function transcribeAudio() {
  if (!currentFile) return;

  try {
    setBusy(true);
    elements.resultText.value = "";
    elements.copyButton.disabled = true;

    const audio = await decodeAudio(currentFile);
    const transcriber = await getTranscriber();
    const model = elements.modelSelect.value;
    const language = elements.languageSelect.value;
    const options = {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    };

    if (language && !model.endsWith(".en")) {
      options.language = language;
      options.task = "transcribe";
    }

    setStatus("Đang nhận dạng");
    setProgress(74);
    const startedAt = performance.now();
    const result = await transcriber(audio, options);

    elements.resultText.value = result.text.trim();
    elements.copyButton.disabled = !elements.resultText.value;
    setProgress(100);
    setStatus(`Hoàn tất ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
  } catch (error) {
    console.error(error);
    setStatus("Có lỗi");
    elements.resultText.value = `Không thể chuyển âm thanh thành text.\n\n${error.message}`;
  } finally {
    setBusy(false);
  }
}

async function toggleRecording() {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    elements.recordButton.textContent = "Ghi âm";
    elements.recordingStatus.textContent = "Đang xử lý bản ghi";
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  });

  mediaRecorder.addEventListener("stop", () => {
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
    const file = new File([blob], `recording-${Date.now()}.webm`, { type: blob.type });
    selectAudioFile(file);
    elements.recordingStatus.textContent = "Đã có bản ghi";
  });

  mediaRecorder.start();
  elements.recordButton.textContent = "Dừng";
  elements.recordingStatus.textContent = "Đang ghi âm";
}

elements.audioFile.addEventListener("change", (event) => {
  selectAudioFile(event.target.files[0]);
});

elements.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.dropZone.classList.add("is-dragging");
});

elements.dropZone.addEventListener("dragleave", () => {
  elements.dropZone.classList.remove("is-dragging");
});

elements.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove("is-dragging");
  selectAudioFile(event.dataTransfer.files[0]);
});

elements.recordButton.addEventListener("click", async () => {
  try {
    await toggleRecording();
  } catch (error) {
    elements.recordingStatus.textContent = "Không mở được mic";
    setStatus(error.message);
  }
});

elements.transcribeButton.addEventListener("click", transcribeAudio);

elements.copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(elements.resultText.value);
  setStatus("Đã sao chép");
});

elements.clearButton.addEventListener("click", () => {
  elements.resultText.value = "";
  elements.copyButton.disabled = true;
  setProgress(0);
  setStatus(currentFile ? "Sẵn sàng" : "Chưa tải model");
});
