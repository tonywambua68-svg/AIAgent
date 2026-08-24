/* J.A.R.V.I.S OS — Computer Control (modules 60-96)
 * Live vitals, sandboxed terminal, dev services, REAL screen capture,
 * action history, permission matrix, emergency stop. */
import { useEffect, useRef, useState } from "react";
import { useStore, bus, fmtAgo, fmtTime, updateCompSettings, clearCaptures, logEvent } from "../lib/store";
import {
  probeSystem, measureLoopLatency, execTerminal, startDevService, stopDevService,
  takeCapture, emergencyStop, osAdapters, detectPlatform, CAPABILITIES, LEVELS,
  type SystemProbe,
} from "../lib/computer";
import { sfx } from "../lib/audio";
import {
  Panel, Badge, Bar, Sparkline, IcChip, IcMonitor, IcStopSq, IcCam, IcPlay,
  IcTrash, IcZap, IcMic, IcWarn,
} from "./ui";

const PLAT_LABEL: Record<string, string> = { windows: "Windows", linux: "Linux", macos: "macOS", browser: "Browser" };

function Vitals() {
  const s = useStore();
  const [probe, setProbe] = useState<SystemProbe | null>(null);
  const [latency, setLatency] = useState<number[]>([]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const p = await probeSystem();
      const lat = await measureLoopLatency();
      if (!alive) return;
      setProbe({ ...p, loopLatencyMs: lat });
      setLatency((prev) => [...prev.slice(-29), lat]);
    };
    void tick();
    const iv = setInterval(tick, 2500);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const running = s.devServices.filter((v) => v.status === "running");
  const cards: { label: string; value: string; sub: string; tone?: string; extra?: React.ReactNode }[] = probe ? [
    {
      label: "CPU", value: `${probe.cores} cores`,
      sub: `loop latency ${probe.loopLatencyMs ?? "…"} ms`,
      extra: <Sparkline data={latency} color={latency.length && latency[latency.length - 1] > 40 ? "#ffc24b" : "#00ff88"} w={120} h={26} />,
    },
    {
      label: "Memory", value: probe.jsHeapMB !== null ? `${probe.jsHeapMB} MB` : "n/a",
      sub: probe.jsHeapMB !== null ? `JS heap of ${probe.heapLimitMB} MB limit` : "browser hides system RAM — companion agent required",
      extra: probe.jsHeapMB !== null && probe.heapLimitMB ? <Bar value={(probe.jsHeapMB / probe.heapLimitMB) * 100} /> : undefined,
    },
    {
      label: "Storage", value: probe.storageUsedMB !== null ? `${probe.storageUsedMB} MB` : "n/a",
      sub: probe.storageQuotaMB ? `of ${probe.storageQuotaMB.toLocaleString()} MB quota` : "estimate unavailable",
      extra: probe.storageUsedMB !== null && probe.storageQuotaMB ? <Bar value={(probe.storageUsedMB / probe.storageQuotaMB) * 100} color="var(--color-info)" /> : undefined,
    },
    {
      label: "Network", value: probe.online ? probe.net.toUpperCase() : "OFFLINE",
      sub: probe.online ? "browser connectivity API" : "local subsystems keep running",
      tone: probe.online ? undefined : "var(--color-danger)",
    },
    {
      label: "Displays", value: `${probe.screenW}×${probe.screenH}`,
      sub: `${probe.dpr}× DPI · ${probe.extended ? "extended/multi-monitor detected" : "single display"}`,
    },
    {
      label: "Input devices", value: probe.micAvailable ? "mic ready" : "no mic access",
      sub: `speech recognition ${probe.speech ? "available" : "unsupported"}`,
      tone: probe.micAvailable ? undefined : "var(--color-warn)",
    },
  ] : [];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((c, i) => (
        <div key={c.label} className="panel panel-hover p-3 fade-up" style={{ animationDelay: `${i * 45}ms` }}>
          <div className="text-[9.5px] font-mono uppercase tracking-widest text-mut">{c.label}</div>
          <div className="font-display font-bold text-[15px] mt-1 truncate" style={c.tone ? { color: c.tone } : undefined}>{c.value}</div>
          <div className="text-[10px] text-mut mt-0.5 leading-snug">{c.sub}</div>
          {c.extra && <div className="mt-1.5">{c.extra}</div>}
        </div>
      ))}
      {!probe && <div className="col-span-full panel p-4 text-mut text-[12px]">Probing system…</div>}
      <div className="col-span-2 md:col-span-3 xl:col-span-6 flex flex-wrap items-center gap-2 -mt-1">
        <Badge tone="acc">active window: {`JARVIS OS — ${document.title.split("—")[1]?.trim() || "dashboard"}`}</Badge>
        <Badge tone="mut">platform: {PLAT_LABEL[detectPlatform()]}</Badge>
        <Badge tone={running.length ? "acc" : "mut"}>{running.length} dev service{running.length === 1 ? "" : "s"} running</Badge>
        <Badge tone="info">{s.compActions.length} computer actions logged</Badge>
        <span className="text-[10px] text-mut ml-auto">vitals refresh every 2.5s — observed, never invented</span>
      </div>
    </div>
  );
}

/* ---------------- terminal ---------------- */

interface TermLine { kind: "in" | "out" | "err"; text: string; }

function Terminal() {
  const [lines, setLines] = useState<TermLine[]>([
    { kind: "out", text: "JARVIS sandbox shell — commands classified by risk before execution.\nType 'help'. Destructive commands are blocked and demonstrated, never executed." },
  ]);
  const [cmd, setCmd] = useState("");
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [lines]);

  function run() {
    const c = cmd.trim();
    if (!c) return;
    setHist((h) => [c, ...h].slice(0, 40));
    setHi(-1);
    const r = execTerminal(c);
    if (r.output === "\x00CLEAR") { setLines([]); setCmd(""); return; }
    const next: TermLine[] = [
      ...lines,
      { kind: "in" as const, text: c },
      { kind: (r.blocked ? "err" : "out") as TermLine["kind"], text: r.output + (r.blocked ? "" : `\n  └ ${r.classification.risk} risk · level ${r.classification.level}${r.classification.destructive ? " · DESTRUCTIVE" : ""}`) },
    ];
    setLines(next.slice(-120));
    setCmd("");
    if (r.blocked) sfx.error(); else sfx.tick();
  }

  return (
    <div className="bg-ink rounded-b-[6px] font-mono text-[11.5px] leading-relaxed">
      <div className="h-56 overflow-y-auto p-3 space-y-1.5">
        {lines.map((l, i) => (
          <div key={i} className={l.kind === "in" ? "text-txt" : l.kind === "err" ? "text-danger" : "text-mut"}>
            {l.kind === "in" ? <span><span className="text-acc">owner@jarvis</span><span className="text-mut/60">:~/workspace $</span> {l.text}</span> : <pre className="whitespace-pre-wrap font-mono">{l.text}</pre>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2 border-t border-line px-3 py-2">
        <span className="text-acc text-[11px] shrink-0">$</span>
        <input
          className="flex-1 bg-transparent outline-none text-txt placeholder:text-mut/50 font-mono text-[11.5px]"
          placeholder="type a command — try: tree · cat package.json · npm run dev · npm test · rm -rf /"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
            if (e.key === "ArrowUp") { e.preventDefault(); const n = Math.min(hi + 1, hist.length - 1); if (hist[n]) { setHi(n); setCmd(hist[n]); } }
            if (e.key === "ArrowDown") { e.preventDefault(); const n = hi - 1; setHi(n); setCmd(n >= 0 ? hist[n] : ""); }
          }}
        />
        <button className="btn-acc !py-1 !px-2.5 !text-[10.5px]" onClick={run}>run</button>
      </div>
    </div>
  );
}

/* ---------------- dev services ---------------- */

function DevServices() {
  const s = useStore();
  const [, bump] = useState(0);
  useEffect(() => {
    const off = bus.on("comp:log", () => bump((x) => x + 1));
    return () => { off(); };
  }, []);
  const svcs = s.devServices;
  return (
    <div className="p-3.5 space-y-3">
      {svcs.length === 0 && (
        <div className="text-center py-5">
          <p className="text-mut text-[12px]">No dev services yet.</p>
          <button className="btn-acc mt-2.5" onClick={() => { startDevService("npm run dev"); sfx.confirm(); }}>
            <span className="flex items-center gap-1.5"><IcPlay size={12} /> npm run dev</span>
          </button>
        </div>
      )}
      {svcs.map((v) => (
        <div key={v.id} className="panel bg-ink/60">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-line/60">
            <span className={`w-1.5 h-1.5 rounded-full ${v.status === "running" ? "bg-acc pulse-dot" : "bg-mut"}`} />
            <span className="font-mono text-[11.5px] text-txt">{v.cmd}</span>
            <Badge tone={v.status === "running" ? "acc" : "mut"}>{v.status === "running" ? `:${v.port}` : "stopped"}</Badge>
            <span className="text-[10px] text-mut/70 font-mono ml-1">{v.startedAt ? `up ${fmtAgo(v.startedAt)}` : ""}</span>
            {v.status === "running"
              ? <button className="btn-danger ml-auto !py-1 !px-2 !text-[10px]" onClick={() => { stopDevService(v.id); sfx.notify(); }}>stop</button>
              : <button className="btn-ghost ml-auto !py-1 !px-2 !text-[10px]" onClick={() => startDevService(v.cmd)}>restart</button>}
          </div>
          <div className="font-mono text-[10.5px] text-mut p-2.5 max-h-24 overflow-y-auto space-y-0.5">
            {v.log.length === 0 && <span className="text-mut/50">booting…</span>}
            {v.log.map((l, i) => (
              <div key={i} className={l.includes("✓") ? "text-acc" : l.startsWith("^C") ? "text-warn" : ""}>{l}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- screen capture ---------------- */

function ScreenCapture() {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  async function capture() {
    setBusy(true); setMsg(null);
    const r = await takeCapture("screen");
    setBusy(false);
    setMsg(r.ok ? `Captured surface: ${r.label}. Stored under retention (max ${s.compSettings.retention}).` : r.error!);
    if (r.ok) sfx.notify(); else sfx.error();
  }

  return (
    <div className="p-3.5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-acc" disabled={busy} onClick={capture}>
          <span className="flex items-center gap-1.5"><IcCam size={13} /> {busy ? "requesting permission…" : "Capture screen / window / tab"}</span>
        </button>
        <label className="flex items-center gap-2 text-[11px] text-mut ml-auto">
          retention
          <select className="input !py-1 !text-[11px] w-24" value={s.compSettings.retention}
            onChange={(e) => updateCompSettings({ retention: parseInt(e.target.value) })}>
            <option value={5}>5 newest</option><option value={10}>10 newest</option>
            <option value={20}>20 newest</option><option value={50}>50 newest</option>
          </select>
        </label>
        {s.captures.length > 0 && (confirmClear
          ? <button className="btn-danger" onClick={() => { const n = clearCaptures(); setConfirmClear(false); setMsg(`${n} captures discarded (audited).`); }}>Confirm discard</button>
          : <button className="btn-ghost" onClick={() => setConfirmClear(true)}><span className="flex items-center gap-1"><IcTrash size={11} /> clear</span></button>)}
      </div>
      {msg && <div className="text-[11px] text-mut border border-line bg-ink/60 rounded px-3 py-2 fade-up">{msg}</div>}
      {s.captures.length === 0 ? (
        <div className="border border-dashed border-line rounded p-5 text-center">
          <IcMonitor size={22} className="text-mut/50 mx-auto" />
          <p className="text-[11.5px] text-mut mt-2">No captures yet. This uses the <span className="font-mono text-acc">real getDisplayMedia API</span> — the browser will ask which screen, window or tab to share. Nothing is captured without that explicit grant, and old frames are discarded automatically.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {s.captures.map((c) => (
            <figure key={c.id} className="panel bg-ink/60 overflow-hidden fade-up">
              <img src={c.dataUrl} alt={`capture ${c.label}`} className="w-full h-20 object-cover object-top" />
              <figcaption className="flex items-center gap-1.5 px-2 py-1.5">
                <Badge tone="info" className="!text-[8.5px]">{c.kind}</Badge>
                <span className="text-[9.5px] font-mono text-mut">{c.w}×{c.h}</span>
                <span className="text-[9.5px] font-mono text-mut/60 ml-auto">{fmtTime(c.ts)}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- main section ---------------- */

export default function ComputerControl() {
  const s = useStore();
  const [halted, setHalted] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  useEffect(() => {
    const off = bus.on("comp:abort", () => { setHalted(true); setTimeout(() => setHalted(false), 4000); });
    return () => { off(); };
  }, []);

  const testMode = s.compSettings.testMode;
  const last = s.compActions[0];

  return (
    <div className="space-y-4">
      {/* header + emergency stop */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold flex items-center gap-2"><IcChip size={18} className="text-acc" /> COMPUTER CONTROL</h2>
          <p className="text-[11.5px] text-mut mt-0.5">OBSERVE → PLAN → ACT → OBSERVE → VERIFY · timeouts · loop protection · human-in-the-loop</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-[11px] text-mut cursor-pointer select-none">
            TEST MODE
            <button className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${testMode ? "bg-warn/80" : "bg-line2"}`}
              onClick={() => { updateCompSettings({ testMode: !testMode }); logEvent("COMPUTER", `Test mode ${!testMode ? "enabled — plans are demonstrated, native actions withheld" : "disabled"}`, "warn"); }}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-ink transition-all ${testMode ? "left-5.5" : "left-0.5"}`} />
            </button>
          </label>
          {halted
            ? <Badge tone="danger" className="!py-1.5"><IcStopSq size={10} /> HALTED — awaiting new command</Badge>
            : confirmStop ? (
              <button className="btn-danger !py-2 !px-4 font-bold tracking-wider" onClick={() => { emergencyStop.stop("dashboard button"); setConfirmStop(false); sfx.error(); }}>
                <span className="flex items-center gap-1.5"><IcStopSq size={12} /> CONFIRM STOP</span>
              </button>
            ) : (
              <button className="btn-danger !py-2 !px-4 font-bold tracking-wider" onClick={() => { setConfirmStop(true); setTimeout(() => setConfirmStop(false), 2500); }}>
                <span className="flex items-center gap-1.5"><IcStopSq size={12} /> EMERGENCY STOP</span>
              </button>
            )}
        </div>
      </div>
      <p className="text-[10.5px] text-mut -mt-2">
        Stop sources: this button · <span className="font-mono">Esc</span> anywhere in the dashboard · saying <em>“JARVIS, stop”</em>. After a stop, nothing resumes until you issue a new command (module 83).
      </p>

      <Vitals />

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Sandbox terminal" right={<Badge tone="acc">risk-classified · real execution</Badge>} corner>
          <Terminal />
        </Panel>
        <div className="space-y-4">
          <Panel title="Dev services" right={<Badge tone={s.devServices.some((v) => v.status === "running") ? "acc" : "mut"}>{s.devServices.filter((v) => v.status === "running").length} running</Badge>}>
            <DevServices />
          </Panel>
          <Panel title="Current AI action">
            <div className="p-3.5">
              {last ? (
                <div className="flex items-center gap-2.5 fade-up">
                  <span className={`w-2 h-2 rounded-full ${last.ok ? "bg-acc" : "bg-danger"} pulse-dot`} />
                  <div className="min-w-0">
                    <div className="text-[12px]"><span className="font-mono text-info">{last.app}</span> · {last.action} → <span className="text-mut">{last.target}</span></div>
                    <div className="text-[10.5px] text-mut truncate">{last.result} · {fmtAgo(last.ts)}{last.testMode ? " · TEST" : ""}</div>
                  </div>
                  <Badge tone={last.ok ? "acc" : "danger"} className="ml-auto">{last.ok ? "OK" : "FAIL"}</Badge>
                </div>
              ) : <p className="text-[11.5px] text-mut">No computer actions yet — try <em>“run my project”</em> or <em>“check if node is installed”</em> in the Command Center.</p>}
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Screen capture — real browser API" right={<Badge tone="info">privacy-gated · retention-limited</Badge>} corner>
        <ScreenCapture />
      </Panel>

      <Panel title={`Computer action log — ${s.compActions.length}`} right={<Badge tone="mut">secrets never logged (module 87)</Badge>}>
        <div className="overflow-x-auto">
          <table className="tbl min-w-[760px]">
            <thead><tr><th>Time</th><th>App</th><th>Action</th><th>Target</th><th>Result</th><th>Risk</th><th>Lvl</th><th>Mode</th></tr></thead>
            <tbody>
              {s.compActions.slice(0, 30).map((a) => (
                <tr key={a.id}>
                  <td className="font-mono text-[10.5px] whitespace-nowrap">{fmtTime(a.ts)}</td>
                  <td className="font-mono text-[11px] text-info">{a.app}</td>
                  <td className="text-[11.5px]">{a.action}</td>
                  <td className="font-mono text-[10.5px] text-mut max-w-[150px] truncate" title={a.target}>{a.target}</td>
                  <td className="text-[11px] text-mut max-w-[220px] truncate" title={a.result}>{a.result}</td>
                  <td><Badge tone={a.risk === "LOW" ? "acc" : a.risk === "MEDIUM" ? "warn" : "danger"}>{a.risk}</Badge></td>
                  <td className="font-mono text-[11px]">L{a.level}</td>
                  <td>{a.testMode ? <Badge tone="warn" className="!text-[9px]">TEST</Badge> : <Badge tone="acc" className="!text-[9px]">REAL</Badge>}</td>
                </tr>
              ))}
              {s.compActions.length === 0 && <tr><td colSpan={8} className="text-center text-mut text-[11.5px] py-5">Every mouse, keyboard, terminal and window action lands here — with risk level and honest success/failure.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="Permission levels" corner>
          <div className="p-3.5 space-y-2">
            {LEVELS.map((l) => (
              <div key={l.level} className="panel bg-ink/60 px-3 py-2 flex items-start gap-2.5">
                <span className={`font-mono font-bold text-[12px] ${l.level === 3 ? "text-danger" : l.level === 2 ? "text-warn" : "text-acc"}`}>L{l.level}</span>
                <div>
                  <div className="text-[11.5px] font-display font-semibold">{l.name}{l.level === 3 && <span className="text-danger text-[9.5px] font-mono ml-1.5">always confirms</span>}</div>
                  <div className="text-[10.5px] text-mut leading-snug mt-0.5">{l.can}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Capability matrix — what's real here">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Capability</th><th>Browser sandbox</th><th>Lvl</th></tr></thead>
              <tbody>
                {CAPABILITIES.map((c) => (
                  <tr key={c.cap}>
                    <td className="text-[11px]">{c.cap}</td>
                    <td className={`text-[10.5px] font-mono ${c.browser.startsWith("REAL") ? "text-acc" : c.browser.startsWith("BLOCKED") ? "text-danger" : "text-warn"}`}>{c.browser}</td>
                    <td className="font-mono text-[11px]">L{c.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="OS adapters — cross-platform design">
          <div className="p-3.5 space-y-2">
            {osAdapters().map((a) => (
              <div key={a.id} className={`panel px-3 py-2 ${a.detected ? "border-acc/40 bg-acc/5" : "bg-ink/60"}`}>
                <div className="flex items-center gap-2">
                  <span className="font-display font-semibold text-[12px]">{a.label}</span>
                  {a.detected && <Badge tone="acc" className="!text-[8.5px]">ACTIVE</Badge>}
                  <Badge tone={a.nativeControl ? "acc" : "warn"} className="ml-auto !text-[8.5px]">{a.nativeControl ? "NATIVE" : "AGENT NEEDED"}</Badge>
                </div>
                <p className="text-[10.5px] text-mut leading-snug mt-1">{a.note}</p>
              </div>
            ))}
            <p className="text-[10px] text-mut/80 flex gap-1 pt-1"><IcWarn size={11} className="shrink-0 mt-0.5 text-warn" /> Native mouse/keyboard/window control is deliberately not faked. The same planner and verifier drive the companion agent when attached — nothing changes upstream (rule 49).</p>
          </div>
        </Panel>
      </div>

      <div className="panel p-4 flex flex-wrap items-center gap-3">
        <IcZap size={16} className="text-acc" />
        <p className="text-[11.5px] text-mut flex-1 min-w-[260px]">
          <span className="text-txt font-display font-semibold">Try the full loop from the Command Center:</span>{" "}
          <em>“run my project”</em> streams the OBSERVE→PLAN→ACT→VERIFY plan live · <em>“find the error”</em> diagnoses then asks before fixing · <em>“stop the server”</em> is confirm-gated · <em>“delete this folder”</em> demonstrates the LEVEL-3 gate · <em>“take a screenshot”</em> is real.
        </p>
        <Badge tone="warn"><IcMic size={10} /> voice: “JARVIS, stop” works too</Badge>
      </div>
    </div>
  );
}
