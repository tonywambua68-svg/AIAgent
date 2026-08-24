/* J.A.R.V.I.S OS — voice system
 * Speech recognition, text-to-speech, and honest microphone diagnostics.
 * No hard-coded device indexes — devices are enumerated and selected by id. */

export interface MicInfo { deviceId: string; label: string; }

export const speechSupported = () =>
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

export function friendlyAudioError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : String(err);
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone permission denied. Allow mic access for this site in the browser (address-bar icon → Site settings), then re-run the test.";
    case "NotFoundError":
      return "No input device found. The selected microphone may be unplugged or disabled at OS level.";
    case "NotReadableError":
      return "The microphone is busy — another app (meeting, recorder) is holding it. Close it and retry.";
    case "OverconstrainedError":
      return "The selected device cannot satisfy the request. It may have been removed — retrying with the default input.";
    case "TypeError":
      return "Audio capture is unavailable in this context (needs HTTPS or localhost).";
    default:
      return `Audio capture failed (${name}). Describe this to a developer if it persists.`;
  }
}

export async function listMics(): Promise<MicInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    // request permission first so labels are populated
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs
      .filter((d) => d.kind === "audioinput")
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1} (label hidden)` }));
  } catch {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      return devs.filter((d) => d.kind === "audioinput")
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1} (permission needed for label)` }));
    } catch { return []; }
  }
}

export interface MicTestResult {
  ok: boolean;
  error?: string;
  sampleRate?: number;
  channels?: number;
  deviceId?: string;
  stop: () => void;
}

/** Live microphone test: streams RMS levels to onLevel(0..1). Returns metadata + stop(). */
export async function startMicTest(
  deviceId: string | undefined,
  onLevel: (rms: number) => void,
): Promise<MicTestResult> {
  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let raf = 0;
  const stop = () => {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    void audioCtx?.close();
  };
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    });
  } catch (e) {
    return { ok: false, error: friendlyAudioError(e), stop };
  }
  const track = stream.getAudioTracks()[0];
  const settings = track.getSettings();
  audioCtx = new AudioContext();
  const src = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const loop = () => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
    raf = requestAnimationFrame(loop);
  };
  loop();
  return {
    ok: true,
    sampleRate: audioCtx.sampleRate,
    channels: settings.channelCount ?? 1,
    deviceId: settings.deviceId ?? deviceId,
    stop,
  };
}

/* ---------- speech recognition ---------- */

export interface RecognitionHandle { stop: () => void; }

export function startRecognition(handlers: {
  onResult: (text: string) => void;
  onEnd: () => void;
  onError: (msg: string) => void;
}): RecognitionHandle | null {
  const SR = (window as unknown as Record<string, unknown>).SpeechRecognition ??
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  if (!SR) {
    handlers.onError("Speech recognition is not supported in this browser. Chrome or Edge on desktop/Android support it; Firefox does not. Type the command instead.");
    return null;
  }
  const rec = new (SR as new () => {
    lang: string; continuous: boolean; interimResults: boolean;
    onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
    onerror: ((e: { error: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void; stop: () => void;
  })();
  rec.lang = "en-KE";
  rec.continuous = false;
  rec.interimResults = false;
  rec.onresult = (e) => {
    const t = e.results[0]?.[0]?.transcript ?? "";
    if (t.trim()) handlers.onResult(t.trim());
  };
  rec.onerror = (e) => {
    const msg = e.error === "not-allowed"
      ? "Microphone permission denied — allow access and try again."
      : e.error === "no-speech"
        ? "No speech detected. Try again, closer to the mic."
        : e.error === "audio-capture"
          ? "No microphone capture — the device may be unplugged or busy."
          : `Recognition error: ${e.error}`;
    handlers.onError(msg);
  };
  rec.onend = handlers.onEnd;
  try { rec.start(); } catch { handlers.onError("Could not start the recognizer — it may already be running."); }
  return { stop: () => { try { rec.stop(); } catch { /* noop */ } } };
}

/* ---------- text to speech ---------- */

export function listVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === "undefined") return [];
  return speechSynthesis.getVoices();
}

export function speak(text: string, voiceURI?: string, onEnd?: () => void) {
  if (typeof speechSynthesis === "undefined") { onEnd?.(); return; }
  speechSynthesis.cancel();
  const clean = text.replace(/[#*`▸—]/g, "").replace(/\n+/g, ". ");
  const clipped = clean.length > 320 ? clean.slice(0, 320) + "…" : clean;
  const u = new SpeechSynthesisUtterance(clipped);
  const voices = speechSynthesis.getVoices();
  const v = voices.find((x) => x.voiceURI === voiceURI) ??
    voices.find((x) => /en(-|_)(GB|KE)/i.test(x.lang)) ??
    voices.find((x) => x.lang.startsWith("en"));
  if (v) u.voice = v;
  u.rate = 1.04; u.pitch = 0.95;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}
