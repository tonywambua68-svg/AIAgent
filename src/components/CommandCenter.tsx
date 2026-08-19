/* J.A.R.V.I.S OS — Command Center: primary AI interaction surface */
import { useEffect, useRef, useState } from "react";
import type { ChatMsg } from "../lib/types";
import { useStore, pushChat, patchChat, uid, logAudit, bus } from "../lib/store";
import { runBrainAsync, confirmAction, denyAction, type BrainResult } from "../lib/brain";
import { startRecognition, speak, speechSupported } from "../lib/voice";
import { sfx } from "../lib/audio";
import { Md, Badge, Logo, IcSend, IcMic, IcChevD, IcZap, IcCheck, IcX } from "./ui";

const STAGES = ["INTENT", "CONTEXT", "MEMORY", "PLAN", "EXEC", "VALIDATE", "RESPONSE"];

const QUICK = [
  "daily report",
  "show today's sales",
  "analyze my business",
  "what should I work on next?",
  "what should I learn today?",
  "low stock",
  "suggest a price: cost 38500, delivery 300, fees 1.5%, margin 20%",
  "simulate an order",
];

function storeResult(r: BrainResult) {
  const msg: ChatMsg = {
    id: uid(), role: "assistant", content: r.content, ts: Date.now(),
    trace: r.trace, tools: r.tools, kind: r.kind ?? "text",
    ...(r.pending ? { pending: r.pending } : {}),
  };
  pushChat(msg);
  return msg;
}

function MsgView({ m, animate, onConfirm, onDeny }: {
  m: ChatMsg; animate: boolean;
  onConfirm: (m: ChatMsg) => void; onDeny: (m: ChatMsg) => void;
}) {
  const [shown, setShown] = useState(animate ? 0 : m.content.length);
  const [traceOpen, setTraceOpen] = useState(false);
  useEffect(() => {
    if (!animate || shown >= m.content.length) return;
    const t = setTimeout(() => setShown((v) => Math.min(m.content.length, v + 4)), 10);
    return () => clearTimeout(t);
  }, [animate, shown, m.content.length]);

  const isUser = m.role === "user";
  const done = shown >= m.content.length;

  return (
    <div className={`fade-up flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded border border-acc/30 bg-acc/5 flex items-center justify-center mt-1">
          <Logo size={18} />
        </div>
      )}
      <div className={`max-w-[88%] ${isUser ? "text-right" : ""}`}>
        <div className={`inline-block text-left panel px-4 py-3 ${isUser ? "bg-acc/8 border-acc/25" : ""} ${m.kind === "report" ? "corner" : ""}`}>
          <Md text={m.content.slice(0, shown)} />
          {animate && !done && <span className="blink text-acc">▍</span>}
        </div>

        {!isUser && done && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {(m.tools ?? []).map((t, i) => (
              <span key={i} className="chip" title={`${t.input} → ${t.output}`}>
                <IcZap size={10} className="text-acc" /> {t.tool}
                <span className={t.risk === "LOW" ? "text-mut" : t.risk === "MEDIUM" ? "text-warn" : "text-danger"}>{t.risk}</span>
              </span>
            ))}
            {(m.trace ?? []).length > 0 && (
              <button onClick={() => setTraceOpen((v) => !v)} className="chip hover:text-txt hover:border-line2 transition-colors cursor-pointer">
                reasoning <IcChevD size={10} className={`transition-transform ${traceOpen ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        )}

        {!isUser && traceOpen && (
          <div className="mt-2 panel px-3 py-2 font-mono text-[10.5px] leading-relaxed text-mut fade-up">
            {(m.trace ?? []).map((t, i) => (
              <div key={i}><span className="text-acc">{String(i + 1).padStart(2, "0")}</span> <span className="text-info">{t.stage.padEnd(9)}</span> {t.detail}</div>
            ))}
          </div>
        )}

        {m.kind === "confirm" && m.pending && !m.resolved && done && (
          <div className="mt-2 flex items-center gap-2 fade-up">
            <Badge tone={m.pending.risk === "HIGH" ? "danger" : "warn"}>{m.pending.risk} RISK</Badge>
            <button className="btn-acc !py-1.5" onClick={() => onConfirm(m)}><span className="flex items-center gap-1"><IcCheck size={12} /> Approve</span></button>
            <button className="btn-ghost !py-1.5" onClick={() => onDeny(m)}><span className="flex items-center gap-1"><IcX size={12} /> Deny</span></button>
          </div>
        )}
        {m.resolved && (
          <div className="mt-1.5"><Badge tone={m.resolved === "approved" ? "acc" : "mut"}>{m.resolved === "approved" ? "executed with confirmation" : "denied by user"}</Badge></div>
        )}
      </div>
    </div>
  );
}

export default function CommandCenter() {
  const s = useStore();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(-1);
  const [listening, setListening] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);

  const chat = s.chat;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.length, busy, stage]);

  /* other sections can hand commands to the input via the bus */
  useEffect(() => {
    const off = bus.on("prefill", (t) => { setInput(String(t)); inputRef.current?.focus(); });
    return () => { off(); };
  }, []);

  function send(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    pushChat({ id: uid(), role: "user", content: text, ts: Date.now() });
    setBusy(true);
    // animate the pipeline strip while the engine "thinks"
    let i = 0;
    setStage(0);
    const iv = setInterval(() => {
      i++;
      if (i < STAGES.length) { setStage(i); sfx.tick(); }
      else {
        clearInterval(iv);
        (async () => {
          // placeholder message — computer-control plans stream step results into it live
          const msgId = uid();
          pushChat({ id: msgId, role: "assistant", ts: Date.now(), content: "_observing → planning → executing…_", kind: "text" });
          try {
            const result = await runBrainAsync(text, (md) => patchChat(msgId, { content: md }));
            patchChat(msgId, {
              content: result.content,
              trace: result.trace, tools: result.tools,
              kind: result.kind ?? "text",
              ...(result.pending ? { pending: result.pending } : {}),
            });
            setLastId(msgId);
            if (s.settings.ttsOn) speak(result.content, s.settings.ttsVoice);
          } catch (err) {
            logAudit({ action: "brain.error", tool: "jarvis_brain", input: text.slice(0, 60), result: String(err), status: "FAILED", risk: "LOW" });
            patchChat(msgId, {
              content: `### Processing error — told honestly\nThe engine threw: \`${String(err)}\`. Nothing was executed or recorded. Try rephrasing, or run _"check system health"_.`,
              trace: [{ stage: "ERROR", detail: "exception caught and surfaced, not hidden" }], tools: [],
            });
            sfx.error();
          } finally {
            setStage(-1);
            setBusy(false);
          }
        })();
      }
    }, 85);
  }

  function onConfirm(m: ChatMsg) {
    if (!m.pending) return;
    const r = confirmAction(m.pending.id);
    patchChat(m.id, { resolved: "approved" });
    if (r) {
      const msg = storeResult(r);
      setLastId(msg.id);
      sfx.confirm();
    }
  }
  function onDeny(m: ChatMsg) {
    if (!m.pending) return;
    denyAction(m.pending.id);
    patchChat(m.id, { resolved: "denied" });
    pushChat({ id: uid(), role: "assistant", content: "Understood — action aborted, nothing was changed. The denial is logged.", ts: Date.now() });
  }

  function toggleMic() {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    if (!speechSupported()) {
      pushChat({
        id: uid(), role: "assistant", ts: Date.now(),
        content: "### Voice input unavailable\nThis browser doesn't expose the Web Speech API (Firefox doesn't ship it). Use Chrome/Edge, or type the command — everything else works identically.",
        trace: [{ stage: "DIAG", detail: "SpeechRecognition missing from window" }], tools: [],
      });
      sfx.error();
      return;
    }
    setListening(true);
    recRef.current = startRecognition({
      onResult: (t) => { setListening(false); send(t); },
      onEnd: () => setListening(false),
      onError: (msg) => {
        setListening(false);
        pushChat({ id: uid(), role: "assistant", content: `### Microphone error — actual cause\n${msg}`, ts: Date.now() });
        sfx.error();
      },
    });
    if (!recRef.current) setListening(false);
  }

  return (
    <div className="h-full flex flex-col">
      {/* pipeline strip */}
      <div className="flex items-center gap-1 px-1 pb-3 overflow-x-auto">
        {STAGES.map((st, i) => {
          const active = stage === i;
          const passed = stage > i || (stage === -1 && false);
          return (
            <div key={st} className="flex items-center gap-1">
              <span className={`chip transition-all duration-200 ${active ? "!text-ink !bg-acc !border-acc font-bold scale-105" : passed ? "text-acc/70 border-acc/30" : ""}`}>
                {active && <span className="w-1 h-1 rounded-full bg-ink pulse-dot" />}
                {st}
              </span>
              {i < STAGES.length - 1 && <span className={`text-[10px] ${stage >= i ? "text-acc/60" : "text-line2"}`}>→</span>}
            </div>
          );
        })}
        <span className="ml-auto chip !text-[10px]">engine: local rule + tool</span>
      </div>

      {/* transcript */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-5 min-h-0">
        {chat.length === 0 && (
          <div className="fade-up max-w-xl mx-auto mt-8 text-center">
            <div className="flex justify-center mb-4"><Logo size={46} /></div>
            <h2 className="font-display text-xl font-bold tracking-wide">COMMAND CENTER</h2>
            <p className="text-mut text-[13px] mt-2 leading-relaxed">
              Speak in plain language — business, work, learning or system commands.
              Every response carries its reasoning trace and tool calls; risky actions ask first.
            </p>
            <p className="font-mono text-[11px] text-acc/70 mt-3">try: "daily report" · "analyze my business" · "what should I learn today?"</p>
          </div>
        )}
        {chat.map((m) => (
          <MsgView key={m.id} m={m} animate={m.id === lastId && m.role === "assistant"} onConfirm={onConfirm} onDeny={onDeny} />
        ))}
        {busy && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded border border-acc/30 bg-acc/5 flex items-center justify-center"><Logo size={18} /></div>
            <div className="panel px-4 py-3 flex gap-1.5 items-center">
              {[0, 1, 2].map((i) => <span key={i} className="typing-dot w-1.5 h-1.5 rounded-full bg-acc inline-block" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* quick commands */}
      <div className="flex gap-1.5 overflow-x-auto py-2.5 -mx-1 px-1">
        {QUICK.map((q) => (
          <button key={q} onClick={() => send(q)} disabled={busy}
            className="chip hover:!text-acc hover:!border-acc/40 transition-colors shrink-0 cursor-pointer disabled:opacity-40">
            {q}
          </button>
        ))}
      </div>

      {/* input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex gap-2 items-center panel corner px-2.5 py-2"
      >
        <button type="button" onClick={toggleMic}
          className={`relative shrink-0 w-9 h-9 rounded flex items-center justify-center border transition-all cursor-pointer ${listening ? "border-danger text-danger bg-danger/10" : "border-line text-mut hover:text-acc hover:border-acc/40"}`}
          title="Voice command">
          {listening && <span className="absolute inset-0 rounded border border-danger ring-pulse" />}
          <IcMic size={16} />
        </button>
        <input
          ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
          placeholder={listening ? "Listening…" : 'Command JARVIS — e.g. "analyze my business"'}
          className="flex-1 bg-transparent outline-none text-[13.5px] placeholder:text-mut/60 min-w-0"
        />
        <button type="submit" disabled={!input.trim() || busy}
          className="btn-acc !px-3.5 !py-2 shrink-0 disabled:opacity-30" aria-label="Send">
          <IcSend size={14} />
        </button>
      </form>
    </div>
  );
}
