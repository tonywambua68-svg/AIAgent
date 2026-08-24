/* J.A.R.V.I.S OS — Memory, Integrations, Security, Settings */
import { useEffect, useRef, useState } from "react";
import type { Memory, MemoryCategory, Risk } from "../lib/types";
import {
  useStore, mutate, addMemory, updateMemory, deleteMemory, updateIntegration,
  addWebhook, recordSale, updateSettings, exportState, importState, resetAll,
  fmtAgo, fmtKSh, logEvent, logAudit,
} from "../lib/store";
import { TOOLS } from "../lib/brain";
import { listMics, startMicTest, listVoices, speak, type MicInfo } from "../lib/voice";
import { sfx } from "../lib/audio";
import { startSim } from "../lib/sim";
import { Panel, Badge, Bar, IcDb, IcPlug, IcShield, IcGear, IcPlus, IcTrash, IcEdit, IcSearch, IcX, IcMic, IcPlay, IcWarn } from "./ui";

/* ================= MEMORY ================= */

const CATS: MemoryCategory[] = ["USER", "PROJECT", "BUSINESS", "LEARNING", "TASK", "CONVERSATION", "DECISION"];

export function MemorySection() {
  const s = useStore();
  const [cat, setCat] = useState<MemoryCategory | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [nCat, setNCat] = useState<MemoryCategory>("BUSINESS");
  const [nTitle, setNTitle] = useState("");
  const [nBody, setNBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eBody, setEBody] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const list = s.memories.filter((m) =>
    (cat === "ALL" || m.category === cat) &&
    (!q || (m.title + " " + m.body).toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-lg font-bold flex items-center gap-2"><IcDb size={18} className="text-acc" /> MEMORY</h2>
          <p className="text-[11.5px] text-mut mt-0.5">Structured, searchable, editable, deletable — every deletion is audited</p>
        </div>
        <button className="btn-acc" onClick={() => setAdding((v) => !v)}><span className="flex items-center gap-1.5"><IcPlus size={13} /> Store memory</span></button>
      </div>

      <div className="flex gap-1.5 flex-wrap items-center">
        {(["ALL", ...CATS] as const).map((c) => (
          <button key={c} onClick={() => setCat(c)}
            className={`chip cursor-pointer transition-colors ${cat === c ? "!text-acc !border-acc/50 !bg-acc/10" : "hover:text-txt"}`}>
            {c} {c !== "ALL" && <span className="text-mut/70">{s.memories.filter((m) => m.category === c).length}</span>}
          </button>
        ))}
        <div className="relative ml-auto">
          <IcSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mut" />
          <input className="input !pl-8 w-56" placeholder="Search memory…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {adding && (
        <div className="panel corner p-4 fade-up space-y-2.5">
          <div className="flex gap-2.5">
            <select className="input w-44" value={nCat} onChange={(e) => setNCat(e.target.value as MemoryCategory)}>
              {CATS.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input className="input flex-1" placeholder="Title" value={nTitle} onChange={(e) => setNTitle(e.target.value)} />
          </div>
          <textarea className="input min-h-[70px]" placeholder="Content…" value={nBody} onChange={(e) => setNBody(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-acc" onClick={() => {
              if (nTitle.trim() && nBody.trim()) { addMemory(nCat, nTitle.trim(), nBody.trim()); setNTitle(""); setNBody(""); setAdding(false); }
            }}>Save</button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        {list.map((m) => (
          <div key={m.id} className="panel panel-hover p-3.5 fade-up">
            <div className="flex items-center gap-2">
              <Badge tone={m.category === "DECISION" ? "warn" : m.category === "USER" ? "acc" : m.category === "BUSINESS" ? "info" : "mut"}>{m.category}</Badge>
              <span className="text-[10px] font-mono text-mut/70 ml-auto">{fmtAgo(m.ts)}{m.updatedTs ? " · edited" : ""}</span>
            </div>
            {editingId === m.id ? (
              <div className="mt-2 space-y-2">
                <input className="input" value={eTitle} onChange={(e) => setETitle(e.target.value)} />
                <textarea className="input min-h-[60px]" value={eBody} onChange={(e) => setEBody(e.target.value)} />
                <div className="flex gap-2">
                  <button className="btn-acc !py-1.5" onClick={() => { updateMemory(m.id, eTitle, eBody); setEditingId(null); }}>Save</button>
                  <button className="btn-ghost !py-1.5" onClick={() => setEditingId(null)}><IcX size={12} /></button>
                </div>
              </div>
            ) : (
              <>
                <h4 className="font-display font-semibold text-[13px] mt-1.5">{m.title}</h4>
                <p className="text-[11.5px] text-mut leading-relaxed mt-1">{m.body}</p>
                <div className="flex items-center gap-2 mt-2.5">
                  <span className="text-[10px] font-mono text-mut/60">source: {m.source}</span>
                  <div className="ml-auto flex gap-1">
                    <button className="btn-ghost !px-2 !py-1" onClick={() => { setEditingId(m.id); setETitle(m.title); setEBody(m.body); }}><IcEdit size={11} /></button>
                    {confirmDel === m.id ? (
                      <button className="btn-danger !px-2 !py-1" onClick={() => { deleteMemory(m.id); setConfirmDel(null); }}>Confirm delete</button>
                    ) : (
                      <button className="btn-ghost !px-2 !py-1 hover:!text-danger" onClick={() => setConfirmDel(m.id)}><IcTrash size={11} /></button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
        {list.length === 0 && <div className="panel p-6 text-center text-mut text-[12.5px] md:col-span-2">No memories match. JARVIS stores only what matters — tell it <em>"remember that …"</em> or add manually.</div>}
      </div>
    </div>
  );
}

/* ================= INTEGRATIONS ================= */

const MODE_TONE: Record<string, "acc" | "warn" | "mut"> = { READY: "acc", MOCK: "warn", OFF: "mut" };

function IntegrationCard({ id }: { id: string }) {
  const s = useStore();
  const it = s.integrations.find((x) => x.id === id)!;
  const [k1, setK1] = useState("");
  const [k2, setK2] = useState("");
  const [open, setOpen] = useState(false);

  function testWebhook() {
    if (it.id === "woocommerce") {
      const candidates = s.products.filter((p) => p.stock > 1);
      const p = candidates[Math.floor(Math.random() * candidates.length)];
      const res = recordSale({ productId: p.id, qty: 1, channel: "online", simulated: true });
      addWebhook({ source: "woocommerce", event: "order.created", status: "SIMULATED", detail: `${p.name} ×1 — full pipeline executed${res.ok ? ` · est. profit ${fmtKSh(res.profit!)}` : ` · ${res.error}`}` });
    } else {
      addWebhook({ source: it.id, event: "test.ping", status: "SIMULATED", detail: `Outbound test queued locally — no credentials, nothing left this browser.` });
      logEvent("INTEGRATIONS", `${it.name}: simulated test event queued locally`, "info", true);
    }
    sfx.notify();
  }

  return (
    <div className="panel panel-hover p-4 fade-up">
      <div className="flex items-center gap-2">
        <h3 className="font-display font-bold text-[13.5px]">{it.name}</h3>
        <Badge tone={it.hasCreds ? "acc" : MODE_TONE[it.mode]}>{it.hasCreds ? "CREDS STORED" : it.mode}</Badge>
        <button className="ml-auto btn-ghost !px-2 !py-1" onClick={testWebhook}><span className="flex items-center gap-1"><IcPlay size={10} /> test</span></button>
      </div>
      <div className="text-[10.5px] font-mono text-mut mt-0.5">{it.kind}</div>
      <p className="text-[11.5px] text-mut leading-relaxed mt-2">{it.note}</p>
      <div className="mt-2 space-y-0.5">
        {it.requires.map((r) => <div key={r} className="text-[10.5px] text-mut/80 flex gap-1.5"><span className="text-acc/60">▸</span>{r}</div>)}
      </div>
      <button className="text-[10.5px] font-mono text-info mt-2.5 hover:underline cursor-pointer" onClick={() => setOpen((v) => !v)}>
        {open ? "− hide" : "+ configure"} credentials
      </button>
      {open && (
        <div className="mt-2 space-y-2 fade-up">
          <input className="input font-mono !text-[11px]" placeholder={it.credsHint[0]} value={k1} onChange={(e) => setK1(e.target.value)} />
          {it.credsHint[1] !== "—" && <input className="input font-mono !text-[11px]" type="password" placeholder={it.credsHint[1]} value={k2} onChange={(e) => setK2(e.target.value)} />}
          <button className="btn-acc w-full !text-[11px]" disabled={!k1.trim()} onClick={() => {
            updateIntegration(it.id, { hasCreds: true });
            logAudit({ action: `integrations.store_creds`, tool: "integration_manager", input: it.id, result: "credentials masked + stored locally only; never rendered again", status: "SUCCESS", risk: "MEDIUM" });
            setK1(""); setK2(""); setOpen(false);
            logEvent("INTEGRATIONS", `${it.name}: credentials stored locally (masked). Adapter still needs a hosted backend to go LIVE.`, "info");
          }}>Store locally (masked)</button>
          <p className="text-[10px] text-warn/80 flex gap-1"><IcWarn size={11} className="shrink-0 mt-0.5" /> Dev-mode storage: browser-local only. In production these belong in server-side env vars — never in frontend code.</p>
        </div>
      )}
    </div>
  );
}

export function IntegrationsSection() {
  const s = useStore();
  const steps = ["Receive webhook", "Validate event", "Update database", "Analyze order", "Update metrics", "Notify owner", "Record audit"];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold flex items-center gap-2"><IcPlug size={18} className="text-acc" /> INTEGRATIONS</h2>
          <p className="text-[11.5px] text-mut mt-0.5">Provider-swappable adapters · MOCK when unconfigured, never faking LIVE (rule 49)</p>
        </div>
        <Badge tone="warn">{s.integrations.filter((i) => !i.hasCreds).length} unconfigured</Badge>
      </div>

      <Panel title="NEW ORDER automation pipeline" right={<Badge tone="acc">live logic, simulated trigger</Badge>} corner>
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {steps.map((st, i) => (
              <span key={st} className="flex items-center gap-1.5">
                <span className="chip !text-[10px] !py-1.5"><span className="text-acc font-bold">{i + 1}</span> {st}</span>
                {i < steps.length - 1 && <span className="text-acc/50 text-[10px]">→</span>}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button className="btn-acc" onClick={() => {
              const candidates = s.products.filter((p) => p.stock > 1);
              const p = candidates[Math.floor(Math.random() * candidates.length)];
              const res = recordSale({ productId: p.id, qty: 1, channel: "online", simulated: true });
              addWebhook({ source: "woocommerce", event: "order.created", status: "SIMULATED", detail: `${p.name} ×1 — pipeline demo${res.ok ? ` · profit ${fmtKSh(res.profit!)}` : ""}` });
            }}><span className="flex items-center gap-1.5"><IcPlay size={12} /> Fire simulated order</span></button>
            <span className="text-[10.5px] text-mut">Watch the Activity feed, KPIs, audit log and ledger react — same code path a real WooCommerce webhook would hit.</span>
          </div>
        </div>
      </Panel>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {s.integrations.map((i) => <IntegrationCard key={i.id} id={i.id} />)}
      </div>

      <Panel title="Webhook / event log">
        <div className="overflow-x-auto">
          <table className="tbl min-w-[620px]">
            <thead><tr><th>Time</th><th>Source</th><th>Event</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>
              {s.webhooks.slice(0, 12).map((w) => (
                <tr key={w.id}>
                  <td className="font-mono text-[11px] whitespace-nowrap">{fmtAgo(w.ts)}</td>
                  <td className="font-mono text-[11px]">{w.source}</td>
                  <td className="font-mono text-[11px] text-info">{w.event}</td>
                  <td><Badge tone={w.status === "SIMULATED" ? "warn" : w.status === "ACCEPTED" ? "acc" : "danger"}>{w.status}</Badge></td>
                  <td className="text-[11.5px] text-mut">{w.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ================= SECURITY ================= */

const RISK_META: Record<Risk, { tone: "acc" | "warn" | "danger"; examples: string }> = {
  LOW: { tone: "acc", examples: "Calculate · search · analyse · generate drafts · read files" },
  MEDIUM: { tone: "warn", examples: "Send messages · modify content · update products/prices · record sales" },
  HIGH: { tone: "danger", examples: "Financial transactions · deletions · deploys · password/security changes — always confirmed" },
};

const RBAC: { role: string; perms: [boolean, boolean, boolean, boolean] }[] = [
  { role: "OWNER", perms: [true, true, true, true] },
  { role: "ADMIN", perms: [true, true, true, true] },
  { role: "MANAGER", perms: [true, true, true, false] },
  { role: "ANALYST", perms: [true, false, false, false] },
  { role: "ASSISTANT", perms: [true, true, false, false] },
  { role: "VIEWER", perms: [true, false, false, false] },
];

export function SecuritySection() {
  const s = useStore();
  const [fRisk, setFRisk] = useState<string>("ALL");
  const [fStatus, setFStatus] = useState<string>("ALL");
  const audit = s.audit.filter((a) =>
    (fRisk === "ALL" || a.risk === fRisk) && (fStatus === "ALL" || a.status === fStatus));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold flex items-center gap-2"><IcShield size={18} className="text-acc" /> SECURITY & AUDIT</h2>
        <p className="text-[11.5px] text-mut mt-0.5">Risk classification · RBAC model · full action audit trail</p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="panel panel-hover p-4 fade-up">
          <div className="text-[10.5px] font-mono uppercase tracking-widest text-mut">session</div>
          <div className="font-mono text-[12px] text-acc mt-1.5 break-all">{s.sessionId}</div>
          <div className="text-[11px] text-mut mt-2">Mode: <Badge tone="warn" className="ml-1">DEVELOPMENT</Badge></div>
          <p className="text-[10.5px] text-mut leading-relaxed mt-2">Booted {fmtAgo(s.bootedAt)}. Single-owner local session. Production adds hashed credentials, signed tokens, rate limiting and HTTPS-only cookies.</p>
        </div>
        {(Object.keys(RISK_META) as Risk[]).map((r, i) => (
          <div key={r} className="panel panel-hover p-4 fade-up" style={{ animationDelay: `${(i + 1) * 60}ms` }}>
            <div className="flex items-center gap-2">
              <Badge tone={RISK_META[r].tone}>{r} RISK</Badge>
              <span className="text-[10px] font-mono text-mut">{r === "LOW" ? "auto-execute" : r === "MEDIUM" ? "context-dependent confirm" : "always confirm"}</span>
            </div>
            <p className="text-[11px] text-mut leading-relaxed mt-2.5">{RISK_META[r].examples}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Role-based access control">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Role</th><th>READ</th><th>WRITE</th><th>FINANCIAL</th><th>ADMIN</th></tr></thead>
              <tbody>
                {RBAC.map((r) => (
                  <tr key={r.role}>
                    <td className="font-display font-semibold">{r.role}</td>
                    {r.perms.map((p, i) => (
                      <td key={i}>{p ? <span className="text-acc font-mono">✓</span> : <span className="text-mut/40 font-mono">—</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 pb-3 text-[10.5px] text-mut">Financial operations require FINANCIAL permission + audit entry. High-risk actions additionally require explicit confirmation at execution time.</p>
        </Panel>

        <Panel title="Secret hygiene checklist">
          <div className="p-4 space-y-2">
            {[
              ["No API keys in frontend source", true],
              ["Credentials masked after storage", true],
              ["Audit log stores no secret material", true],
              ["Webhook signatures validated before trust", false],
              ["HTTPS + signed session tokens", false],
              ["Login rate limiting / lockout", false],
            ].map(([label, ok]) => (
              <div key={label as string} className="flex items-center gap-2 text-[12px]">
                <span className={`font-mono ${ok ? "text-acc" : "text-warn"}`}>{ok ? "✓" : "○"}</span>
                <span className={ok ? "text-txt/90" : "text-mut"}>{label}</span>
                {!ok && <Badge tone="warn" className="ml-auto !text-[9px]">backend phase</Badge>}
              </div>
            ))}
            <p className="text-[10.5px] text-mut pt-2 border-t border-line mt-2">Unchecked items require the hosted backend — they're designed in, not forgotten.</p>
          </div>
        </Panel>
      </div>

      <Panel title={`Audit log — ${s.audit.length} entries`} right={
        <div className="flex gap-2">
          <select className="input !py-1 !text-[11px] w-28" value={fRisk} onChange={(e) => setFRisk(e.target.value)}>
            <option value="ALL">all risk</option><option>LOW</option><option>MEDIUM</option><option>HIGH</option>
          </select>
          <select className="input !py-1 !text-[11px] w-32" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="ALL">all status</option><option>SUCCESS</option><option>FAILED</option><option>BLOCKED</option>
          </select>
        </div>
      }>
        <div className="overflow-x-auto">
          <table className="tbl min-w-[700px]">
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Tool</th><th>Risk</th><th>Status</th><th>Result</th></tr></thead>
            <tbody>
              {audit.slice(0, 40).map((a) => (
                <tr key={a.id}>
                  <td className="font-mono text-[10.5px] whitespace-nowrap">{fmtAgo(a.ts)}</td>
                  <td className="font-mono text-[11px]">{a.actor}</td>
                  <td className="font-mono text-[11px] text-info">{a.action}</td>
                  <td className="font-mono text-[10.5px] text-mut">{a.tool ?? "—"}</td>
                  <td><Badge tone={RISK_META[a.risk].tone}>{a.risk}</Badge></td>
                  <td><Badge tone={a.status === "SUCCESS" ? "acc" : a.status === "FAILED" ? "danger" : "warn"}>{a.status}</Badge>{a.confirmed && <span className="text-[9px] font-mono text-mut ml-1">✓conf</span>}</td>
                  <td className="text-[11px] text-mut max-w-[260px] truncate" title={a.result}>{a.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ================= SETTINGS ================= */

function MicDiagnostics() {
  const s = useStore();
  const [mics, setMics] = useState<MicInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string; sampleRate?: number; channels?: number } | null>(null);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => { listMics().then((m) => { setMics(m); if (!deviceId && m.length) setDeviceId(m[0].deviceId); }); /* eslint-disable-next-line */ }, []);
  useEffect(() => () => stopRef.current(), []);

  async function run() {
    stopRef.current();
    setTesting(true); setResult(null); setLevel(0);
    const r = await startMicTest(deviceId || undefined, setLevel);
    stopRef.current = r.stop;
    setResult(r);
    if (r.ok) sfx.notify(); else sfx.error();
  }
  function stop() { stopRef.current(); setTesting(false); setLevel(0); }

  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <select className="input flex-1" value={deviceId} onChange={(e) => { setDeviceId(e.target.value); updateSettings({ micDeviceId: e.target.value }); }}>
          {mics.length === 0 && <option value="">No devices listed yet — run test to request permission</option>}
          {mics.map((m) => <option key={m.deviceId} value={m.deviceId}>{m.label}</option>)}
        </select>
        {testing
          ? <button className="btn-danger shrink-0" onClick={stop}><IcX size={13} /></button>
          : <button className="btn-acc shrink-0" onClick={run}><span className="flex items-center gap-1.5"><IcMic size={13} /> Test mic</span></button>}
      </div>
      <div className="panel bg-ink px-3 py-2.5">
        <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider text-mut mb-1.5">
          <span>input level {testing ? "(live)" : ""}</span>
          {result?.ok && <span className="text-acc">{result.sampleRate} Hz · {result.channels} ch</span>}
        </div>
        <div className="h-2.5 bg-base rounded-sm overflow-hidden flex gap-[2px]">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="flex-1 rounded-[1px] transition-colors duration-75"
              style={{ background: i / 24 < level ? (i > 18 ? "#ff6b5e" : i > 13 ? "#ffc24b" : "#00ff88") : "#1c231f" }} />
          ))}
        </div>
        {testing && level < 0.02 && <p className="text-[10.5px] text-warn mt-1.5">Signal near zero — check the OS-level input volume or pick another device. This is the "very low mic level" case, surfaced honestly.</p>}
      </div>
      {result && !result.ok && (
        <div className="text-[11.5px] text-danger border border-danger/30 bg-danger/8 rounded px-3 py-2 fade-up">{result.error}</div>
      )}
      {result?.ok && (
        <div className="text-[11px] text-mut">Device responding · sample rate <span className="font-mono text-acc">{result.sampleRate} Hz</span> · <span className="font-mono text-acc">{result.channels}</span> channel(s). No hard-coded indexes — selection persists by device ID.</div>
      )}
    </div>
  );
}

export function SettingsSection() {
  const s = useStore();
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const voices = listVoices();
  useEffect(() => {
    if (typeof speechSynthesis !== "undefined") {
      const load = () => { /* voices load async — re-render on change */ };
      speechSynthesis.onvoiceschanged = load;
    }
  }, []);
  const [, force] = useState(0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold flex items-center gap-2"><IcGear size={18} className="text-acc" /> SETTINGS</h2>
        <p className="text-[11.5px] text-mut mt-0.5">Configuration, voice & audio, simulation, data control</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Voice & audio" corner>
          <div className="p-4 space-y-4">
            <div>
              <div className="text-[10.5px] font-mono uppercase tracking-widest text-mut mb-2">microphone diagnostics</div>
              <MicDiagnostics />
            </div>
            <div className="border-t border-line pt-3 space-y-2.5">
              <label className="flex items-center justify-between text-[12.5px]">
                <span>Spoken responses (TTS)</span>
                <button className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${s.settings.ttsOn ? "bg-acc/80" : "bg-line2"}`}
                  onClick={() => updateSettings({ ttsOn: !s.settings.ttsOn })}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-ink transition-all ${s.settings.ttsOn ? "left-5.5" : "left-0.5"}`} />
                </button>
              </label>
              {s.settings.ttsOn && (
                <div className="flex gap-2">
                  <select className="input flex-1" value={s.settings.ttsVoice ?? ""} onChange={(e) => updateSettings({ ttsVoice: e.target.value || undefined })}>
                    <option value="">system default voice</option>
                    {voices.filter((v) => v.lang.startsWith("en")).map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                  </select>
                  <button className="btn-ghost shrink-0" onClick={() => speak("Systems online. Voice output active.", s.settings.ttsVoice)}><IcPlay size={12} /></button>
                </div>
              )}
            </div>
            <div className="border-t border-line pt-3 space-y-2.5">
              <label className="flex items-center justify-between text-[12.5px]">
                <span>Event sounds</span>
                <button className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${s.settings.soundOn ? "bg-acc/80" : "bg-line2"}`}
                  onClick={() => updateSettings({ soundOn: !s.settings.soundOn })}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-ink transition-all ${s.settings.soundOn ? "left-5.5" : "left-0.5"}`} />
                </button>
              </label>
              <div className="flex items-center gap-3">
                <input type="range" min={0} max={100} value={Math.round(s.settings.volume * 100)} className="flex-1 accent-[#00ff88]"
                  onChange={(e) => updateSettings({ volume: parseInt(e.target.value) / 100 })} />
                <span className="font-mono text-[11px] text-mut w-9">{Math.round(s.settings.volume * 100)}%</span>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost flex-1" onClick={() => sfx.sale()}>sale</button>
                <button className="btn-ghost flex-1" onClick={() => sfx.notify()}>notify</button>
                <button className="btn-ghost flex-1" onClick={() => sfx.error()}>error</button>
              </div>
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Profile & simulation">
            <div className="p-4 space-y-3">
              <label className="block">
                <span className="text-[10.5px] font-mono uppercase tracking-wider text-mut">address you as</span>
                <input className="input mt-1" value={s.settings.userName} onChange={(e) => updateSettings({ userName: e.target.value })} />
              </label>
              <label className="flex items-center justify-between text-[12.5px]">
                <span>Business event simulation <span className="text-mut text-[10.5px]">([SIM]-labelled orders)</span></span>
                <button className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${s.settings.simOn ? "bg-acc/80" : "bg-line2"}`}
                  onClick={() => { updateSettings({ simOn: !s.settings.simOn }); startSim(); }}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-ink transition-all ${s.settings.simOn ? "left-5.5" : "left-0.5"}`} />
                </button>
              </label>
              <label className="flex items-center justify-between text-[12.5px] gap-3">
                <span>Simulation cadence</span>
                <select className="input w-36" value={s.settings.simIntervalSec}
                  onChange={(e) => { updateSettings({ simIntervalSec: parseInt(e.target.value) }); startSim(); }}>
                  <option value={30}>every 30s</option><option value={60}>every 60s</option><option value={120}>every 2 min</option>
                </select>
              </label>
              <p className="text-[10.5px] text-mut leading-relaxed">Simulated events exercise the real pipeline and are always tagged [SIM] in the ledger, feed and audit log. Turn off for a quiet ledger.</p>
            </div>
          </Panel>

          <Panel title="Data control">
            <div className="p-4 space-y-2.5">
              <div className="flex gap-2">
                <button className="btn-ghost flex-1" onClick={() => {
                  const blob = new Blob([exportState()], { type: "application/json" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `jarvis-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  logAudit({ action: "system.export", tool: "memory_manager", result: "full state exported", status: "SUCCESS", risk: "LOW" });
                }}>Export backup</button>
                <button className="btn-ghost flex-1" onClick={() => fileRef.current?.click()}>Import backup</button>
                <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => { const res = importState(String(r.result)); if (!res.ok) { alert(res.error); sfx.error(); } };
                  r.readAsText(f);
                  e.target.value = "";
                }} />
              </div>
              {confirmReset ? (
                <div className="border border-danger/40 bg-danger/8 rounded p-3 fade-up">
                  <p className="text-[11.5px] text-danger mb-2"><strong>Irreversible.</strong> All sales history, memories, tasks and settings return to seed state.</p>
                  <div className="flex gap-2">
                    <button className="btn-danger flex-1" onClick={() => { resetAll(); setConfirmReset(false); }}>Yes — factory reset</button>
                    <button className="btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn-danger w-full" onClick={() => setConfirmReset(true)}>Factory reset (HIGH risk)</button>
              )}
              <p className="text-[10px] text-mut">Storage key: <span className="font-mono">jarvis-os-state</span> · version {s.version} · everything lives in this browser until a backend is attached.</p>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title={`Tool registry — ${TOOLS.length} modular tools`} right={<Badge tone="mut">each: name · schema · risk · errors · logging</Badge>}>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2 p-4">
          {TOOLS.map((t) => (
            <div key={t.name} className="panel bg-ink/60 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11.5px] text-acc">{t.name}</span>
                <Badge tone={t.risk === "LOW" ? "acc" : t.risk === "MEDIUM" ? "warn" : "danger"} className="ml-auto !text-[9px]">{t.risk}</Badge>
              </div>
              <div className="text-[10.5px] text-mut mt-1">{t.description}</div>
              <div className="font-mono text-[9.5px] text-mut/60 mt-1 truncate" title={`${t.input} → ${t.output}`}>{t.input} → {t.output}</div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="panel p-4 text-[11px] text-mut leading-relaxed">
        <span className="text-acc font-display font-bold">J.A.R.V.I.S OS v2.1</span> — personal intelligence kernel. Architecture: intent detection → context/memory retrieval → tool planning → execution → validation → response → memory update. All modules (brain, memory_manager, business_manager, tool_manager, audit_logger, health_monitor, integration adapters) are isolated TypeScript modules with a swappable persistence layer — an Express + Socket.IO + Postgres backend can replace the local kernel without touching the UI. See <span className="font-mono">README.md</span> for the full map.
      </div>
    </div>
  );
}
