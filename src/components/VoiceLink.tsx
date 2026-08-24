/* J.A.R.V.I.S OS — Voice Link (module 14 + 88)
 * Full-duplex conversation surface: mic → speech-to-text → brain → tools →
 * response → text-to-speech → auto-resume. Barge-in cancels JARVIS mid-speech.
 * Every exchange is mirrored into the Command Center transcript. */
import { useEffect, useRef, useState } from "react";
import { getState, pushChat, updateSettings, uid } from "../lib/store";
import { runBrainAsync } from "../lib/brain";
import { startRecognition, startMicTest, speechSupported, speak, stopSpeaking, type RecognitionHandle } from "../lib/voice";
import { sfx, primeAudio } from "../lib/audio";
import { emergencyStop } from "../lib/computer";
import { Logo, Badge, IcMic, IcX } from "./ui";

type VState = "idle" | "listening" | "thinking" | "speaking";

const STATE_META: Record<VState, { label: string; tone: "mut" | "acc" | "info" | "warn" }> = {
  idle: { label: "STANDBY", tone: "mut" },
  listening: { label: "LISTENING", tone: "acc" },
  thinking: { label: "PROCESSING", tone: "info" },
  speaking: { label: "SPEAKING", tone: "warn" },
};

const stripMd = (t: string) => t.replace(/[#*_`▸■✓✗○—]/g, "").replace(/\n+/g, ". ");

export default function VoiceLink() {
  const [open, setOpen] = useState(false);
  const [vstate, setVState] = useState<VState>("idle");
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const activeRef = useRef(false);
  const vstateRef = useRef<VState>("idle");
  const recRef = useRef<RecognitionHandle | null>(null);
  const micStopRef = useRef<() => void>(() => {});

  const setV = (v: VState) => { vstateRef.current = v; setVState(v); };

  useEffect(() => () => { activeRef.current = false; recRef.current?.stop(); micStopRef.current(); stopSpeaking(); }, []);

  const continuous = () => getState().settings.voiceContinuous ?? true;

  function beginListening() {
    if (!activeRef.current) return;
    if (!speechSupported()) {
      setErr("Speech recognition isn't supported in this browser (Firefox doesn't ship the Web Speech API). Use Chrome or Edge for the Voice Link — typing works everywhere.");
      activeRef.current = false;
      setV("idle");
      sfx.error();
      return;
    }
    setErr(null);
    setV("listening");
    // live input meter — real analyser stream, honest levels (module 15)
    micStopRef.current();
    void startMicTest(getState().settings.micDeviceId, setLevel).then((r) => {
      micStopRef.current = r.stop;
      if (!r.ok && r.error) setErr(r.error);
    });
    recRef.current = startRecognition({
      onResult: (text) => {
        stopSpeaking(); // barge-in: user interrupted JARVIS
        setHeard(text);
        void handleUtterance(text);
      },
      onEnd: () => {
        micStopRef.current();
        setLevel(0);
        // recognition times out on silence → resume if conversation still live & not mid-turn
        setTimeout(() => {
          if (activeRef.current && vstateRef.current === "listening") beginListening();
        }, 380);
      },
      onError: (msg) => {
        micStopRef.current();
        setLevel(0);
        setErr(msg);
        activeRef.current = false;
        setV("idle");
        sfx.error();
      },
    });
    if (!recRef.current) { activeRef.current = false; setV("idle"); }
  }

  async function handleUtterance(text: string) {
    setV("thinking");
    pushChat({ id: uid(), role: "user", content: text, ts: Date.now() });

    // voice emergency stop (module 83): "JARVIS stop"
    if (/^(jarvis[, ]+)?(stop|halt)\b/i.test(text)) {
      emergencyStop.stop("voice command");
      activeRef.current = false;
      setV("idle");
      speak("Halted. Standing down.", getState().settings.ttsVoice);
      pushChat({ id: uid(), role: "assistant", content: "Halted. All execution stopped — standing by for your next command.", ts: Date.now() });
      return;
    }

    try {
      const r = await runBrainAsync(text);
      pushChat({
        id: uid(), role: "assistant", content: r.content, ts: Date.now(),
        trace: r.trace, tools: r.tools, kind: r.kind ?? "text",
        ...(r.pending ? { pending: r.pending } : {}),
      });
      setReply(r.content.length > 170 ? r.content.slice(0, 170) + "…" : r.content);
      if (activeRef.current) {
        setV("speaking");
        speak(r.content, getState().settings.ttsVoice, () => {
          if (activeRef.current && continuous()) beginListening();
          else if (activeRef.current) setV("idle");
        });
      }
    } catch (e) {
      setErr(`The engine threw: ${String(e)}. Nothing was executed. Try again or rephrase.`);
      if (activeRef.current) setV("idle");
      sfx.error();
    }
  }

  function toggle() {
    primeAudio();
    if (activeRef.current) {
      activeRef.current = false;
      recRef.current?.stop();
      micStopRef.current();
      stopSpeaking();
      setLevel(0);
      setV("idle");
      return;
    }
    activeRef.current = true;
    setOpen(true);
    setErr(null);
    sfx.notify();
    beginListening();
  }

  const meta = STATE_META[vstate];
  const active = vstate !== "idle";

  return (
    <>
      {/* floating orb */}
      <button
        onClick={toggle}
        aria-label="Voice Link"
        className={`fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full border flex items-center justify-center transition-all cursor-pointer shadow-[0_8px_30px_rgba(0,0,0,0.5)] ${
          active
            ? "bg-acc/15 border-acc/60 text-acc hover:bg-acc/25"
            : "bg-panel border-line2 text-mut hover:text-acc hover:border-acc/50"
        }`}
      >
        {active && <span className="absolute inset-0 rounded-full border border-acc/50 ring-pulse" />}
        {active && <span className="absolute inset-0 rounded-full border border-acc/30 ring-pulse" style={{ animationDelay: "0.5s" }} />}
        {active ? <IcX size={20} /> : <IcMic size={20} />}
      </button>

      {/* conversation panel */}
      {open && (
        <div className="fixed bottom-22 right-5 z-50 w-[min(92vw,350px)] panel corner fade-up overflow-hidden" style={{ bottom: "5.5rem" }}>
          <header className="flex items-center gap-2.5 px-4 py-3 border-b border-line bg-panel2/60">
            <Logo size={22} />
            <div className="leading-none">
              <div className="font-display font-bold text-[12.5px] tracking-[0.18em]">VOICE LINK</div>
              <div className="font-mono text-[8.5px] text-mut tracking-widest mt-1">DUPLEX CONVERSATION</div>
            </div>
            <Badge tone={meta.tone} className="ml-auto">{meta.label}</Badge>
            <button className="btn-ghost !px-2 !py-1" onClick={() => setOpen(false)} aria-label="Close panel"><IcX size={12} /></button>
          </header>

          <div className="p-4 space-y-3.5">
            {/* orb visual + meter */}
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                <span className={`absolute inset-0 rounded-full border ${active ? "border-acc/40 ring-pulse" : "border-line"}`} />
                <span className={`absolute rounded-full border transition-all duration-150 ${active ? "border-acc/25" : "border-line/50"}`}
                  style={{ inset: `${6 - Math.round(level * 5)}px` }} />
                <span className={`w-8 h-8 rounded-full transition-all duration-100 ${
                  vstate === "listening" ? "bg-acc shadow-[0_0_24px_rgba(0,255,136,0.6)]"
                    : vstate === "thinking" ? "bg-info shadow-[0_0_24px_rgba(90,215,255,0.5)]"
                    : vstate === "speaking" ? "bg-warn shadow-[0_0_24px_rgba(255,194,75,0.5)]"
                    : "bg-line2"}`}
                  style={{ transform: `scale(${1 + level * 0.35})` }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[9.5px] font-mono uppercase tracking-widest text-mut mb-1.5">input level {vstate === "listening" ? "(live)" : ""}</div>
                <div className="h-2.5 bg-ink rounded-sm overflow-hidden flex gap-[2px]">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} className="flex-1 rounded-[1px] transition-colors duration-75"
                      style={{ background: i / 20 < level ? (i > 15 ? "#ff6b5e" : i > 11 ? "#ffc24b" : "#00ff88") : "#1c231f" }} />
                  ))}
                </div>
                <label className="flex items-center justify-between mt-2 text-[10.5px] text-mut cursor-pointer select-none">
                  <span>continuous — resume after each reply</span>
                  <button className={`w-9 h-4.5 rounded-full relative transition-colors cursor-pointer shrink-0 ${continuous() ? "bg-acc/80" : "bg-line2"}`}
                    style={{ height: 18 }}
                    onClick={() => updateSettings({ voiceContinuous: !continuous() })}>
                    <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-ink transition-all ${continuous() ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                </label>
              </div>
            </div>

            {/* exchange */}
            <div className="space-y-2">
              <div className={`panel bg-ink/60 px-3 py-2 ${heard ? "" : "opacity-50"}`}>
                <div className="text-[9px] font-mono uppercase tracking-widest text-mut">you said</div>
                <p className="text-[12px] text-txt/90 mt-0.5 leading-snug">{heard || "…speak naturally — “daily report”, “show today's sales”, “JARVIS stop”"}</p>
              </div>
              <div className={`panel bg-ink/60 px-3 py-2 border-l-2 ${vstate === "speaking" ? "border-l-warn" : "border-l-acc"} ${reply ? "" : "opacity-50"}`}>
                <div className="text-[9px] font-mono uppercase tracking-widest text-mut">jarvis {vstate === "speaking" ? "· speaking" : ""}</div>
                <p className="text-[12px] text-txt/90 mt-0.5 leading-snug">{reply ? stripMd(reply) : vstate === "thinking" ? "processing — tools engaged…" : "responses are spoken aloud and mirrored to the Command Center transcript"}</p>
              </div>
            </div>

            {err && <div className="text-[11px] text-danger border border-danger/30 bg-danger/8 rounded px-3 py-2 fade-up">{err}</div>}

            <button className={active ? "btn-danger w-full" : "btn-acc w-full"} onClick={toggle}>
              <span className="flex items-center justify-center gap-1.5">
                <IcMic size={13} /> {active ? "End conversation" : "Start talking to JARVIS"}
              </span>
            </button>
            <p className="text-[9.5px] text-mut/80 leading-relaxed text-center">
              Barge in anytime — JARVIS stops speaking when you start. Mic failures are reported honestly, never hidden.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
