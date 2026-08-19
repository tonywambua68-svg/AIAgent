/* J.A.R.V.I.S OS — shell: boot sequence, navigation, topbar, activity rail, event wiring */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { HealthCheck } from "./lib/types";
import { useStore, bus, runHealth, overallHealth, markAllRead, recordSale, fmtAgo, fmtTime, getState, updateSettings } from "./lib/store";
import { startSim } from "./lib/sim";
import { sfx, setVolume, setMuted, primeAudio } from "./lib/audio";
import CommandCenter from "./components/CommandCenter";
import Business from "./components/Business";
import { ProjectsSection, TasksSection, LearningSection } from "./components/Operations";
import Analytics from "./components/Analytics";
import ComputerControl from "./components/ComputerControl";
import { MemorySection, IntegrationsSection, SecuritySection, SettingsSection } from "./components/System";
import { emergencyStop, isPlanRunning } from "./lib/computer";
import {
  Logo, Badge, IcTerminal, IcStore, IcFolder, IcCheck, IcBook, IcChart, IcDb, IcPlug,
  IcShield, IcGear, IcBell, IcVol, IcVolX, IcMenu, IcX, IcZap, IcPlay, IcMic, IcChip,
} from "./components/ui";

type SectionId = "command" | "business" | "projects" | "tasks" | "learning" | "analytics" | "computer" | "memory" | "integrations" | "security" | "settings";

const NAV: { id: SectionId; label: string; icon: (p: { size?: number }) => ReactNode }[] = [
  { id: "command", label: "Command Center", icon: IcTerminal },
  { id: "business", label: "Business", icon: IcStore },
  { id: "projects", label: "Projects", icon: IcFolder },
  { id: "tasks", label: "Tasks", icon: IcCheck },
  { id: "learning", label: "Learning", icon: IcBook },
  { id: "analytics", label: "Analytics", icon: IcChart },
  { id: "computer", label: "Computer", icon: IcChip },
  { id: "memory", label: "Memory", icon: IcDb },
  { id: "integrations", label: "Integrations", icon: IcPlug },
  { id: "security", label: "Security", icon: IcShield },
  { id: "settings", label: "Settings", icon: IcGear },
];

const TITLES: Record<SectionId, string> = {
  command: "COMMAND CENTER", business: "BUSINESS OPS", projects: "PROJECTS", tasks: "TASK QUEUE",
  learning: "LEARNING ENGINE", analytics: "ANALYTICS", computer: "COMPUTER CONTROL", memory: "MEMORY VAULT",
  integrations: "INTEGRATIONS", security: "SECURITY & AUDIT", settings: "SETTINGS",
};

/* ---------------- boot sequence ---------------- */

const BOOT_LINES = [
  "JARVIS OS v2.1.0 — personal intelligence kernel",
  "▸ memory_manager ......... 8 memories · 7 categories      [ OK ]",
  "▸ tool_registry .......... 16 tools · risk-classified     [ OK ]",
  "▸ business_manager ....... 12 SKUs · ledger verified      [ OK ]",
  "▸ integrations ........... 7 adapters · MOCK/OFF mode     [WARN]",
  "▸ voice_system ........... Web Speech API probe           [ OK ]",
  "▸ audit_logger ........... history attached               [ OK ]",
  "▸ dashboard .............. ONLINE",
];

function BootScreen({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= BOOT_LINES.length) {
      const t = setTimeout(onDone, 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setN((v) => v + 1), n === 0 ? 250 : 150);
    return () => clearTimeout(t);
  }, [n, onDone]);
  return (
    <div className="fixed inset-0 z-[100] bg-base flex items-center justify-center">
      <div className="absolute inset-0 bg-grid" />
      <div className="absolute inset-0 bg-glow" />
      <div className="w-full max-w-lg px-6">
        <div className="flex items-center gap-3 mb-6">
          <Logo size={34} />
          <div>
            <div className="font-display font-bold tracking-[0.25em] text-lg">J.A.R.V.I.S</div>
            <div className="font-mono text-[10px] text-mut tracking-widest">PERSONAL INTELLIGENCE OS</div>
          </div>
          <button onClick={onDone} className="ml-auto btn-ghost !text-[10.5px]">skip →</button>
        </div>
        <div className="font-mono text-[11.5px] leading-relaxed space-y-1">
          {BOOT_LINES.slice(0, n).map((l, i) => (
            <div key={i} className={`boot-line ${l.includes("WARN") ? "text-warn" : l.includes("ONLINE") ? "text-acc font-bold" : "text-mut"}`}>{l}</div>
          ))}
          {n < BOOT_LINES.length && <span className="blink text-acc">▍</span>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- activity rail ---------------- */

function ActivityRail({ onNavigate }: { onNavigate: (s: SectionId) => void }) {
  const s = useStore();
  const [tab, setTab] = useState<"feed" | "alerts">("feed");
  const [checks, setChecks] = useState<HealthCheck[]>(() => runHealth());
  useEffect(() => {
    const iv = setInterval(() => setChecks(runHealth()), 12_000);
    return () => clearInterval(iv);
  }, []);
  const unread = s.notifications.filter((x) => !x.read).length;
  const overall = overallHealth(checks);

  return (
    <aside className="w-[300px] shrink-0 border-l border-line bg-panel/40 flex flex-col min-h-0">
      <div className="flex border-b border-line">
        {(["feed", "alerts"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 font-mono text-[10.5px] tracking-widest uppercase transition-colors cursor-pointer ${tab === t ? "text-acc border-b border-acc" : "text-mut hover:text-txt"}`}>
            {t === "feed" ? "Live feed" : `Alerts${unread ? ` (${unread})` : ""}`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === "feed" ? (
          <div className="p-3 space-y-1.5">
            {s.events.slice(0, 40).map((e) => (
              <div key={e.id} className="panel bg-ink/50 px-3 py-2 fade-up">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.severity === "success" ? "bg-acc" : e.severity === "warn" ? "bg-warn" : e.severity === "error" ? "bg-danger" : "bg-info"}`} />
                  <span className="font-mono text-[9.5px] tracking-wider text-mut uppercase">{e.type}</span>
                  {e.simulated && <Badge tone="warn" className="!text-[8.5px] !px-1.5">SIM</Badge>}
                  <span className="ml-auto font-mono text-[9.5px] text-mut/60">{fmtTime(e.ts)}</span>
                </div>
                <p className="text-[11px] text-txt/85 leading-snug mt-1">{e.message}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3 space-y-1.5">
            {unread > 0 && (
              <button className="btn-ghost w-full !text-[10.5px]" onClick={markAllRead}>Mark all read ({unread})</button>
            )}
            {s.notifications.slice(0, 30).map((nt) => (
              <div key={nt.id} className={`panel px-3 py-2 fade-up ${nt.read ? "bg-ink/30 opacity-60" : "bg-ink/60 border-l-2 border-l-acc"}`}>
                <div className="flex items-center gap-1.5">
                  <span className="font-display font-semibold text-[11.5px]">{nt.title}</span>
                  {nt.simulated && <Badge tone="warn" className="!text-[8.5px] !px-1.5">SIM</Badge>}
                  <span className="ml-auto font-mono text-[9.5px] text-mut/60">{fmtAgo(nt.ts)}</span>
                </div>
                <p className="text-[11px] text-mut leading-snug mt-0.5">{nt.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-line p-3 space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[9.5px] tracking-widest text-mut uppercase">system status</span>
            <Badge tone={overall === "ONLINE" ? "acc" : overall === "DEGRADED" ? "warn" : "danger"}>{overall}</Badge>
          </div>
          <div className="space-y-1">
            {checks.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-[10.5px]" title={c.detail}>
                <span className={`w-1.5 h-1.5 rounded-full ${c.status === "ONLINE" ? "bg-acc" : c.status === "DEGRADED" ? "bg-warn" : "bg-danger"}`} />
                <span className="text-mut">{c.label}</span>
                <span className="ml-auto font-mono text-[9px] text-mut/60">{c.status}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button className="btn-ghost !text-[10.5px]" onClick={() => { bus.emit("prefill", "daily report"); onNavigate("command"); }}><span className="flex items-center gap-1 justify-center"><IcZap size={11} /> Report</span></button>
          <button className="btn-ghost !text-[10.5px]" onClick={() => {
            const c = getState().products.filter((p) => p.stock > 1);
            const p = c[Math.floor(Math.random() * c.length)];
            if (p) recordSale({ productId: p.id, qty: 1, channel: "mpesa", simulated: true });
          }}><span className="flex items-center gap-1 justify-center"><IcPlay size={11} /> Sim sale</span></button>
          <button className="btn-ghost !text-[10.5px] col-span-2" onClick={() => onNavigate("settings")}><span className="flex items-center gap-1 justify-center"><IcMic size={11} /> Mic diagnostics</span></button>
        </div>
      </div>
    </aside>
  );
}

/* ---------------- shell ---------------- */

export default function App() {
  const s = useStore();
  const [section, setSection] = useState<SectionId>("command");
  const [booted, setBooted] = useState(() => sessionStorage.getItem("jarvis-booted") === "1");
  const [clock, setClock] = useState(new Date());
  const [flashKey, setFlashKey] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const lastSaleAt = useRef(0);

  /* clock */
  useEffect(() => {
    const iv = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  /* tab title mirrors the active section — this is the "active window" captures will see */
  useEffect(() => {
    document.title = `JARVIS OS — ${TITLES[section]}`;
  }, [section]);

  /* emergency stop shortcuts (module 83): Esc or Ctrl+. while a plan is executing */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Escape" || (e.ctrlKey && e.key === ".")) && isPlanRunning()) {
        emergencyStop.stop("keyboard shortcut");
        sfx.error();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* audio settings sync */
  useEffect(() => {
    setVolume(s.settings.volume);
    setMuted(!s.settings.soundOn);
  }, [s.settings.volume, s.settings.soundOn]);

  /* prime audio on first gesture (browser autoplay policy) */
  useEffect(() => {
    const prime = () => primeAudio();
    window.addEventListener("pointerdown", prime, { once: true });
    return () => window.removeEventListener("pointerdown", prime);
  }, []);

  /* simulation engine */
  useEffect(() => { startSim(); }, [s.settings.simOn, s.settings.simIntervalSec]);

  /* live event wiring */
  useEffect(() => {
    const offSale = bus.on("sale", () => {
      lastSaleAt.current = Date.now();
      setFlashKey(Date.now());
      sfx.sale();
    });
    const offNotify = bus.on("notify", () => {
      if (Date.now() - lastSaleAt.current > 600) sfx.notify();
    });
    return () => { offSale(); offNotify(); };
  }, []);

  const unread = s.notifications.filter((x) => !x.read).length;
  const openTasks = s.tasks.filter((t) => t.status === "OPEN").length;
  const lowStock = s.products.filter((p) => p.stock <= p.reorderPoint).length;

  const navigate = (id: SectionId) => { setSection(id); setNavOpen(false); };

  const NavList = ({ compact = false }: { compact?: boolean }) => (
    <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
      {NAV.map((n) => {
        const active = section === n.id;
        const count = n.id === "tasks" ? openTasks : 0;
        return (
          <button key={n.id} onClick={() => navigate(n.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-[12.5px] transition-all cursor-pointer border ${active ? "bg-acc/10 text-acc border-acc/30" : "text-mut hover:text-txt hover:bg-white/[0.025] border-transparent"}`}>
            {n.icon({ size: 15 })}
            <span className="font-display font-medium tracking-wide">{n.label}</span>
            {count > 0 && <span className="ml-auto chip !text-[9.5px]">{count}</span>}
            {n.id === "business" && lowStock > 0 && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-warn pulse-dot" />}
            {n.id === "integrations" && <span className="ml-auto chip !text-[8.5px] !text-warn !border-warn/30">MOCK</span>}
            {compact && null}
          </button>
        );
      })}
    </nav>
  );

  if (!booted) {
    return <BootScreen onDone={() => { sessionStorage.setItem("jarvis-booted", "1"); setBooted(true); sfx.boot(); }} />;
  }

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* ambient layers */}
      <div className="fixed inset-0 bg-grid pointer-events-none" />
      <div className="fixed inset-0 bg-glow pointer-events-none" />
      <div className="fixed inset-0 bg-scan pointer-events-none opacity-60" />
      <div className="fixed inset-0 noise pointer-events-none opacity-40" />
      {flashKey > 0 && <div key={flashKey} className="sale-flash" />}

      {/* topbar */}
      <header className="relative z-20 flex items-center gap-3 px-4 h-14 border-b border-line bg-panel/70 backdrop-blur-sm shrink-0">
        <button className="lg:hidden btn-ghost !px-2" onClick={() => setNavOpen(true)} aria-label="Menu"><IcMenu size={16} /></button>
        <div className="flex items-center gap-2.5">
          <Logo size={24} />
          <div className="leading-none">
            <div className="font-display font-bold tracking-[0.2em] text-[13px]">J.A.R.V.I.S</div>
            <div className="font-mono text-[8.5px] text-mut tracking-[0.18em] mt-0.5">PERSONAL INTELLIGENCE OS</div>
          </div>
        </div>
        <div className="hidden md:block ml-4 pl-4 border-l border-line">
          <span className="font-display font-semibold text-[13px] text-txt/90 tracking-wide">{TITLES[section]}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Badge tone="warn" className="hidden sm:inline-flex">DEV MODE</Badge>
          <span className="hidden sm:flex items-center gap-1.5 chip">
            <span className="w-1.5 h-1.5 rounded-full bg-acc pulse-dot" />
            {overallHealth(runHealth())}
          </span>
          <span className="hidden md:block font-mono text-[11.5px] text-mut tabular-nums">
            {clock.toLocaleTimeString("en-KE", { hour12: false })}
          </span>

          {/* sound */}
          <div className="relative">
            <button className={`btn-ghost !px-2.5 !py-2 ${soundOpen ? "!text-acc !border-acc/40" : ""}`} onClick={() => setSoundOpen((v) => !v)} aria-label="Sound">
              {s.settings.soundOn ? <IcVol size={15} /> : <IcVolX size={15} />}
            </button>
            {soundOpen && (
              <div className="absolute right-0 top-11 panel corner p-3 w-56 z-40 fade-up">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-mut">event sounds</span>
                  <button className={`chip cursor-pointer ${s.settings.soundOn ? "!text-acc !border-acc/40" : ""}`}
                    onClick={() => updateSettings({ soundOn: !s.settings.soundOn })}>
                    {s.settings.soundOn ? "ON" : "MUTED"}
                  </button>
                </div>
                <input type="range" min={0} max={100} value={Math.round(s.settings.volume * 100)} className="w-full accent-[#00ff88]"
                  onChange={(e) => updateSettings({ volume: parseInt(e.target.value) / 100 })} />
                <div className="flex gap-1.5 mt-2.5">
                  <button className="btn-ghost flex-1 !text-[10px] !py-1" onClick={() => sfx.sale()}>sale</button>
                  <button className="btn-ghost flex-1 !text-[10px] !py-1" onClick={() => sfx.notify()}>alert</button>
                  <button className="btn-ghost flex-1 !text-[10px] !py-1" onClick={() => sfx.error()}>error</button>
                </div>
              </div>
            )}
          </div>

          {/* alerts */}
          <button className="relative btn-ghost !px-2.5 !py-2 xl:hidden" onClick={() => setRailOpen(true)} aria-label="Alerts">
            <IcBell size={15} />
            {unread > 0 && <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 rounded-full bg-danger text-[9px] font-bold flex items-center justify-center text-ink">{unread}</span>}
          </button>
        </div>
      </header>

      <div className="relative z-10 flex flex-1 min-h-0">
        {/* sidebar */}
        <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-line bg-panel/40">
          <NavList />
          <div className="p-3 border-t border-line">
            <div className="panel bg-ink/60 px-3 py-2.5">
              <div className="flex items-center gap-2 text-[10.5px]">
                <span className="w-1.5 h-1.5 rounded-full bg-acc pulse-dot" />
                <span className="font-mono text-mut">kernel online</span>
                <span className="ml-auto font-mono text-mut/60">v2.1</span>
              </div>
              <p className="text-[9.5px] text-mut/70 mt-1.5 leading-relaxed">local engine · {s.memories.length} memories · {s.audit.length} audit entries</p>
            </div>
          </div>
        </aside>

        {/* mobile nav drawer */}
        {navOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setNavOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-64 bg-panel border-r border-line flex flex-col fade-up">
              <div className="flex items-center justify-between p-3 border-b border-line">
                <span className="font-display font-bold tracking-widest text-[12px]">NAVIGATION</span>
                <button className="btn-ghost !px-2" onClick={() => setNavOpen(false)}><IcX size={14} /></button>
              </div>
              <NavList compact />
            </div>
          </div>
        )}

        {/* main */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className={`h-full ${section === "command" ? "p-4" : "p-4 md:p-5 max-w-[1200px] mx-auto"}`}>
            {section === "command" && <CommandCenter />}
            {section === "business" && <Business />}
            {section === "projects" && <ProjectsSection />}
            {section === "tasks" && <TasksSection />}
            {section === "learning" && <LearningSection />}
            {section === "analytics" && <Analytics />}
            {section === "computer" && <ComputerControl />}
            {section === "memory" && <MemorySection />}
            {section === "integrations" && <IntegrationsSection />}
            {section === "security" && <SecuritySection />}
            {section === "settings" && <SettingsSection />}
          </div>
        </main>

        {/* activity rail (desktop) */}
        <div className="hidden xl:flex"><ActivityRail onNavigate={navigate} /></div>

        {/* activity rail (mobile drawer) */}
        {railOpen && (
          <div className="fixed inset-0 z-50 xl:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setRailOpen(false)} />
            <div className="absolute right-0 top-0 bottom-0 flex fade-up">
              <ActivityRail onNavigate={(id) => { navigate(id); setRailOpen(false); }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


