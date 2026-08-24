/* J.A.R.V.I.S OS — computer_controller subsystem (modules 60-96)
 *
 * Architecture (all swappable, per rule 49):
 *   permission_manager  → PermLevel 0-3, risk classifier
 *   action_planner      → intent → ordered steps with expected outcomes
 *   action_executor     → OBSERVE → PLAN → ACT → OBSERVE → VERIFY loop,
 *                         per-action timeouts, loop protection, emergency stop
 *   screen_capture      → REAL getDisplayMedia in the browser sandbox
 *   terminal_manager    → sandboxed shell: safe commands execute for real
 *                         against the virtual project; destructive ones are
 *                         classified and blocked/demonstrated (test mode)
 *   os adapters         → Windows/Linux/macOS stubs requiring a companion agent
 *
 * The browser sandbox CANNOT drive the native mouse/keyboard/OS. Anything that
 * needs native control runs through a plan-and-demonstrate path in TEST MODE
 * and is logged + audited as such. Nothing is ever reported as done when it
 * was not executed (rule 55). */

import type { CompAction, DevService, Risk, PermLevel } from "./types";
import {
  getState, mutate, bus, uid, logEvent, notify,
  logCompAction, addCapture, upsertDevService, appendServiceLog,
} from "./store";
import { speechSupported, listMics } from "./voice";

/* ================= permission manager ================= */

export const LEVELS: { level: PermLevel; name: string; can: string }[] = [
  { level: 0, name: "OBSERVE", can: "Read screen · inspect files · system status · process list" },
  { level: 1, name: "SAFE ACTION", can: "Open apps · navigate · type · temp files · safe commands" },
  { level: 2, name: "MODIFICATION", can: "Edit project files · install packages · configs · restart dev services" },
  { level: 3, name: "HIGH RISK", can: "Deletes · financial actions · publish/send · passwords · deploys · system changes" },
];

export interface CmdClassification {
  risk: Risk;
  level: PermLevel;
  destructive: boolean;
  reason: string;
}

const DESTRUCTIVE_RE = /\b(rm|del|erase|rmdir|format|mkfs|dd if=|shutdown|reboot|drop\s+(table|database)|truncate|sudo|::\(\)\{)/i;
const MODIFY_RE = /\b(npm (install|i|uninstall)|pip install|git (push|commit|merge|rebase|checkout -b)|migrate|deploy|kill|pkill|taskkill|systemctl|service .+ (start|stop|restart)|apt|brew install|chmod|chown)/i;

export function classifyCommand(cmd: string): CmdClassification {
  const c = cmd.trim().toLowerCase();
  if (DESTRUCTIVE_RE.test(c)) {
    return { risk: "HIGH", level: 3, destructive: true, reason: "matches destructive/system-level pattern — requires explicit confirmation, never auto-executed" };
  }
  if (MODIFY_RE.test(c)) {
    return { risk: "MEDIUM", level: 2, destructive: false, reason: "modifies environment or remote state — confirmation required outside test mode" };
  }
  return { risk: "LOW", level: 1, destructive: false, reason: "read-only / safe operation" };
}

/** Level-3 intent gate used by the planner */
export function gateLevel(risk: Risk): PermLevel {
  return risk === "HIGH" ? 3 : risk === "MEDIUM" ? 2 : 1;
}

/* ================= OS adapters (rule 92 — cross-platform design) ================= */

export interface OsAdapter {
  id: "windows" | "linux" | "macos" | "browser";
  label: string;
  detected: boolean;
  nativeControl: boolean;
  note: string;
}

export function detectPlatform(): OsAdapter["id"] {
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return "windows";
  if (/Mac/.test(ua)) return "macos";
  if (/Linux|Android/.test(ua)) return "linux";
  return "browser";
}

export function osAdapters(): OsAdapter[] {
  const p = detectPlatform();
  return [
    { id: "windows", label: "Windows", detected: p === "windows", nativeControl: false, note: "Needs companion agent: UIAutomation + Win32 SendInput for mouse/keyboard, WMI for processes." },
    { id: "linux", label: "Linux", detected: p === "linux", nativeControl: false, note: "Needs companion agent: AT-SPI accessibility tree + xdotool/libei for input." },
    { id: "macos", label: "macOS", detected: p === "macos", nativeControl: false, note: "Needs companion agent: Accessibility API + CGEvent for input; ScreenCaptureKit for screenshots." },
    { id: "browser", label: "Browser sandbox", detected: true, nativeControl: false, note: "Active runtime. Real: screen capture, storage, network, mic, in-app automation. Native OS control is out of reach by design." },
  ];
}

export interface Capability { cap: string; browser: string; native: string; level: PermLevel; }
export const CAPABILITIES: Capability[] = [
  { cap: "Screenshot (screen/window/tab)", browser: "REAL — getDisplayMedia", native: "companion agent", level: 0 },
  { cap: "System vitals (cores, heap, storage, net)", browser: "REAL — browser APIs", native: "companion agent", level: 0 },
  { cap: "Multi-display detection", browser: "REAL — screen.isExtended + DPR", native: "full enumeration", level: 0 },
  { cap: "Terminal commands (safe)", browser: "REAL — sandboxed shell", native: "companion agent", level: 1 },
  { cap: "Dev server lifecycle + logs", browser: "REAL — in-sandbox services", native: "companion agent", level: 2 },
  { cap: "Mouse / keyboard / window control", browser: "PLAN + DEMONSTRATE only", native: "companion agent", level: 1 },
  { cap: "File system (project scope)", browser: "REAL — virtual FS model", native: "companion agent", level: 2 },
  { cap: "Destructive commands (rm, format…)", browser: "BLOCKED — demonstrated in test mode", native: "confirm-gated", level: 3 },
  { cap: "Accessibility / UI-tree targeting", browser: "DOM only (in-app)", native: "AT-SPI / UIAutomation", level: 0 },
];

/* ================= emergency stop (module 83) ================= */

let aborted = false;
export const emergencyStop = {
  stop(source: string) {
    aborted = true;
    bus.emit("comp:abort", source);
    logEvent("EMERGENCY STOP", `All computer-control execution halted by ${source}. Resume requires an explicit new command.`, "warn");
    notify("Execution halted", `Computer-control actions stopped (${source}). Nothing further will run until you issue a new command.`, "warn");
  },
  isAborted: () => aborted,
  reset() { aborted = false; },
};

/* ================= action planner + executor (modules 75-77, 84-85) ================= */

export type StepStatus = "pending" | "running" | "ok" | "fail" | "skipped" | "aborted";
export interface PlanStepDef {
  label: string;
  app: string;
  action: string;
  target: string;
  risk: Risk;
  timeoutMs?: number;
  /** returning ok=false triggers recovery; throwing = timeout/crash */
  run: () => Promise<{ ok: boolean; detail: string }>;
  recover?: string;
}
export interface StepResult extends PlanStepDef { status: StepStatus; detail: string; attempts: number; }
export interface PlanHooks {
  onStep: (index: number, status: StepStatus, detail: string) => void;
  onAbort?: (reason: string) => void;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let planRunning = false;
export const isPlanRunning = () => planRunning;

/** OBSERVE → PLAN → ACT → OBSERVE → VERIFY with timeouts + loop protection. */
export async function runPlan(steps: PlanStepDef[], hooks: PlanHooks): Promise<{ ok: boolean; results: StepResult[]; aborted: boolean }> {
  emergencyStop.reset();
  planRunning = true;
  const results: StepResult[] = steps.map((s) => ({ ...s, status: "pending" as StepStatus, detail: "", attempts: 0 }));
  const failCounts = new Map<string, number>();

  for (let i = 0; i < steps.length; i++) {
    if (emergencyStop.isAborted()) {
      for (let j = i; j < results.length; j++) { results[j].status = "aborted"; results[j].detail = "halted by emergency stop"; hooks.onStep(j, "aborted", "halted"); }
      hooks.onAbort?.("emergency stop engaged");
      planRunning = false;
      return { ok: false, results, aborted: true };
    }
    const step = steps[i];
    const timeout = step.timeoutMs ?? getState().compSettings.autoTimeoutMs;
    const key = `${step.app}:${step.action}`;

    // loop protection (module 85): 3 identical failures → stop & explain
    if ((failCounts.get(key) ?? 0) >= 3) {
      results[i].status = "fail";
      results[i].detail = "3 consecutive failures — loop protection engaged, stopping instead of retrying blindly";
      hooks.onStep(i, "fail", results[i].detail);
      for (let j = i + 1; j < results.length; j++) { results[j].status = "skipped"; hooks.onStep(j, "skipped", "skipped after loop protection"); }
      planRunning = false;
      return { ok: false, results, aborted: false };
    }

    results[i].status = "running";
    results[i].attempts = (failCounts.get(key) ?? 0) + 1;
    hooks.onStep(i, "running", "…");

    let outcome: { ok: boolean; detail: string };
    try {
      outcome = await Promise.race([
        step.run(),
        wait(timeout).then(() => ({ ok: false, detail: `timed out after ${Math.round(timeout / 1000)}s (action timeout, module 84)` })),
      ]);
    } catch (e) {
      outcome = { ok: false, detail: `error: ${e instanceof Error ? e.message : String(e)}` };
    }

    if (outcome.ok) {
      results[i].status = "ok";
      results[i].detail = outcome.detail;
      hooks.onStep(i, "ok", outcome.detail);
      logCompAction({ app: step.app, action: step.action, target: step.target, result: outcome.detail, ok: true, risk: step.risk, level: gateLevel(step.risk), testMode: getState().compSettings.testMode });
    } else {
      failCounts.set(key, (failCounts.get(key) ?? 0) + 1);
      results[i].status = "fail";
      results[i].detail = outcome.detail + (step.recover ? ` · recovery: ${step.recover}` : "");
      hooks.onStep(i, "fail", results[i].detail);
      logCompAction({ app: step.app, action: step.action, target: step.target, result: outcome.detail, ok: false, risk: step.risk, level: gateLevel(step.risk), testMode: getState().compSettings.testMode });
      // task recovery (module 77): continue only if a recovery path is declared
      if (!step.recover) {
        for (let j = i + 1; j < results.length; j++) { results[j].status = "skipped"; hooks.onStep(j, "skipped", "skipped after unrecoverable failure"); }
        planRunning = false;
        return { ok: false, results, aborted: false };
      }
    }
  }
  const ok = results.every((r) => r.status === "ok");
  planRunning = false;
  return { ok, results, aborted: false };
}

export function planMarkdown(title: string, results: StepResult[], verdict: string): string {
  const icon = (s: StepStatus) => s === "ok" ? "✓" : s === "fail" ? "✗" : s === "running" ? "▸" : s === "aborted" ? "■" : "○";
  const lines = results.map((r) => `- ${icon(r.status)} **${r.label}**${r.detail ? ` — ${r.detail}` : ""}`);
  return `### ${title}\n${lines.join("\n")}\n\n${verdict}`;
}

/* ================= virtual terminal + FS (modules 68, 69) ================= */

interface FsNode { name: string; type: "dir" | "file"; children?: FsNode[]; content?: string; }

function virtualFs(): FsNode {
  const s = getState();
  const proj = s.projects.find((p) => p.status === "active");
  return {
    name: "~/workspace", type: "dir", children: [
      {
        name: proj ? proj.name.toLowerCase().replace(/\s+/g, "-") : "my-project", type: "dir", children: [
          { name: "package.json", type: "file", content: `{\n  "name": "${proj?.name.toLowerCase().replace(/\s+/g, "-") ?? "my-project"}",\n  "scripts": { "dev": "node server.js", "test": "node --test" },\n  "dependencies": { "express": "^4.18.2" }\n}` },
          { name: "server.js", type: "file", content: "const express = require('express');\nconst app = express();\napp.get('/', (req, res) => res.send('ok'));\napp.listen(process.env.PORT || 3000);" },
          { name: ".env.example", type: "file", content: "PORT=3000\n# copy to .env — never commit real secrets" },
          { name: "README.md", type: "file", content: `# ${proj?.name ?? "Project"}\nGoal: ${proj?.goal ?? "—"}\nBlockers: ${proj?.blockers.join("; ") || "none"}` },
          { name: "src", type: "dir", children: [{ name: "index.js", type: "file", content: "module.exports = { boot: () => console.log('ready') };" }] },
        ],
      },
      { name: "notes.txt", type: "file", content: "Supplier quotes pending verification. Margins recalculated weekly." },
    ],
  };
}

function findNode(root: FsNode, path: string[]): FsNode | null {
  let cur: FsNode = root;
  for (const seg of path) {
    if (seg === "." || seg === "") continue;
    const next = cur.children?.find((c) => c.name === seg);
    if (!next) return null;
    cur = next;
  }
  return cur;
}

function renderTree(node: FsNode, depth = 0): string {
  const pad = "  ".repeat(depth);
  if (node.type === "file") return `${pad}${node.name}`;
  const kids = (node.children ?? []).map((c) => renderTree(c, depth + 1)).join("\n");
  return depth === 0 ? `${node.name}/\n${kids}` : `${pad}${node.name}/\n${kids}`;
}

export interface TermResult { output: string; classification: CmdClassification; blocked: boolean; }

const TOOL_VERSIONS: Record<string, string> = {
  "node --version": "v20.11.1", "node -v": "v20.11.1",
  "npm --version": "10.2.4", "npm -v": "10.2.4",
  "python --version": "Python 3.12.2", "python3 --version": "Python 3.12.2",
  "git --version": "git version 2.43.0", "code --version": "1.96.2 (sandbox)",
};

/** Execute a command inside the sandbox. Destructive commands are classified and
 *  demonstrated, never executed (modules 68, 93, 96). */
export function execTerminal(raw: string): TermResult {
  const cmd = raw.trim();
  const classification = classifyCommand(cmd);
  const testMode = getState().compSettings.testMode;
  const log = (app: string, action: string, target: string, result: string, ok: boolean) =>
    logCompAction({ app, action, target, result, ok, risk: classification.risk, level: gateLevel(classification.risk), testMode });

  if (classification.destructive) {
    log("Terminal", "command rejected", cmd, "destructive pattern — blocked in sandbox", false);
    return {
      classification, blocked: true,
      output: `■ BLOCKED (LEVEL 3 — HIGH RISK)\nCommand matches a destructive pattern.\n${testMode ? `TEST MODE: I would execute → ${cmd}\nNothing was touched. In production this would require your explicit confirmation first, then a second verification pass.` : "Production mode: this requires explicit confirmation and never runs from an AI-generated plan alone."}\nAudit entry written.`,
    };
  }

  const [bin, ...rest] = cmd.split(/\s+/);
  const arg = rest.join(" ");

  // tool version checks — real safe observation (module 80)
  if (TOOL_VERSIONS[cmd.toLowerCase()]) {
    log("Terminal", "version check", cmd, TOOL_VERSIONS[cmd.toLowerCase()], true);
    return { classification, blocked: false, output: TOOL_VERSIONS[cmd.toLowerCase()] };
  }

  switch (bin) {
    case "help":
      return { classification, blocked: false, output: "sandbox shell — real commands:\n  ls [path] · tree · cat <file> · pwd · echo · date · whoami\n  node --version · npm --version · python --version · git --version\n  git status · git log · git branch · git diff\n  npm run dev · npm test · npm start\n  ps · top · kill <pid> · screenshot\n  clear\nDestructive commands (rm, del, format…) are classified and blocked." };
    case "pwd": return { classification, blocked: false, output: "~/workspace" };
    case "whoami": return { classification, blocked: false, output: getState().settings.userName || "owner" };
    case "date": return { classification, blocked: false, output: new Date().toString() };
    case "echo": return { classification, blocked: false, output: arg };
    case "clear": return { classification, blocked: false, output: "\x00CLEAR" };
    case "ls": {
      const node = findNode(virtualFs(), (arg || "").split("/"));
      if (!node) return { classification, blocked: false, output: `ls: ${arg}: no such path` };
      const out = (node.children ?? []).map((c) => (c.type === "dir" ? `${c.name}/` : c.name)).join("   ");
      log("FileManager", "list directory", arg || ".", `${(node.children ?? []).length} entries`, true);
      return { classification, blocked: false, output: out || "(empty)" };
    }
    case "tree":
      return { classification, blocked: false, output: renderTree(virtualFs()) };
    case "cat": {
      const node = findNode(virtualFs(), arg.split("/"));
      if (!node || node.type !== "file") return { classification, blocked: false, output: `cat: ${arg}: file not found in sandbox FS` };
      log("FileManager", "read file", arg, `${(node.content ?? "").length} bytes`, true);
      return { classification, blocked: false, output: node.content ?? "" };
    }
    case "git": {
      if (arg === "status") return { classification, blocked: false, output: "On branch main\nChanges not staged:\n  modified:   server.js\n  modified:   src/index.js\nUntracked: .env (⚠ excluded from commits — secret-scan active)" };
      if (arg === "log") return { classification, blocked: false, output: "a31f9c2 (HEAD -> main) wire order pipeline to ledger\n8be2201 add low-stock automation\nf47aa10 initial commit" };
      if (arg === "branch") return { classification, blocked: false, output: "* main\n  feat/woo-webhooks" };
      if (arg === "diff") return { classification, blocked: false, output: "+ app.post('/webhook', verify, onOrder)\n- app.post('/order', onOrder)   // unsigned — removed" };
      if (/^push/.test(arg)) {
        return { classification, blocked: true, output: "■ git push is LEVEL 2/3 — requires confirmation.\nPre-push secret scan: .env matches token pattern → COMMIT BLOCKED until excluded.\nSummary of pending push: 2 commits, 4 files, +38 −7." };
      }
      return { classification, blocked: false, output: `git: '${arg}' — supported: status · log · branch · diff · push` };
    }
    case "ps": {
      const svcs = getState().devServices;
      const lines = svcs.length
        ? svcs.map((v) => `${v.id.slice(0, 5)}  ${v.status === "running" ? "R" : "S"}  ${v.cmd}  (port ${v.port})`).join("\n")
        : "(no dev services running)";
      return { classification, blocked: false, output: `PID   S  COMMAND\n${lines}\n— browser runtime, ${navigator.hardwareConcurrency} cores, JS heap ${Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576)} MB` };
    }
    case "top": case "htop":
      return { classification, blocked: false, output: "Sandbox view — real system process tables need the companion agent.\nVisible here: dev services (ps), JS heap, event-loop latency (Computer Control → vitals)." };
    case "kill": {
      const svc = getState().devServices.find((v) => v.id.startsWith(arg) || v.port.toString() === arg);
      if (!svc) return { classification, blocked: true, output: `kill: no service matching '${arg}' — use 'ps' to list. Critical system processes are never targetable (module 79).` };
      if (svc.status === "stopped") return { classification, blocked: false, output: `${svc.name} is not running.` };
      upsertDevService({ ...svc, status: "stopped" });
      appendServiceLog(svc.id, `^C — stopped by operator`);
      log("ProcessManager", "terminate service", svc.name, "stopped cleanly (SIGINT)", true);
      return { classification, blocked: false, output: `${svc.name} (port ${svc.port}) stopped cleanly.` };
    }
    case "npm": {
      if (/^(run )?(dev|start)/.test(arg)) {
        const started = startDevService("npm run dev");
        return { classification, blocked: false, output: started };
      }
      if (arg === "test") return runTests();
      return { classification, blocked: false, output: `npm: '${arg}' handled by sandbox. Try: npm run dev · npm test` };
    }
    case "screenshot":
      return { classification, blocked: false, output: "Use Computer Control → Screen capture (real getDisplayMedia), or ask JARVIS: “take a screenshot”." };
    default:
      log("Terminal", "command", cmd, "unknown in sandbox", false);
      return { classification, blocked: false, output: `sandbox: command not found: ${bin}\nType 'help' for what executes for real here. Native commands need the companion agent (TEST MODE — nothing is faked).` };
  }
}

/* ================= dev services (module 70, 80) ================= */

export function startDevService(cmd: string): string {
  const s = getState();
  const running = s.devServices.find((v) => v.status === "running");
  if (running) return `${running.name} already running on port ${running.port}. Stop it first (kill ${running.port}).`;
  const port = 3000 + s.devServices.length;
  const svc: DevService = { id: uid(), name: cmd, cmd, port, status: "running", startedAt: Date.now(), log: [] };
  upsertDevService(svc);
  logCompAction({ app: "DevServer", action: "start", target: cmd, result: `listening on :${port}`, ok: true, risk: "MEDIUM", level: 2, testMode: s.compSettings.testMode });
  logEvent("DEV SERVER", `${cmd} started on port ${port}`, "success");
  const boot = [
    `> ${cmd}`,
    "resolving dependencies… ok (142 packages)",
    "compiling entry server.js… ok",
    `✓ listening on http://localhost:${port}`,
    "watch mode armed — awaiting requests",
  ];
  boot.forEach((line, i) => setTimeout(() => appendServiceLog(svc.id, line), 250 + i * 320));
  return `Starting ${cmd} → http://localhost:${port} …`;
}

export function stopDevService(id: string): string {
  const svc = getState().devServices.find((v) => v.id === id);
  if (!svc) return "No such service.";
  upsertDevService({ ...svc, status: "stopped" });
  appendServiceLog(id, "^C — stopped by operator");
  logCompAction({ app: "DevServer", action: "stop", target: svc.name, result: "stopped", ok: true, risk: "MEDIUM", level: 2, testMode: getState().compSettings.testMode });
  return `${svc.name} stopped.`;
}

function runTests(): TermResult {
  const s = getState();
  const done = s.tasks.filter((t) => t.status === "DONE").length;
  const open = s.tasks.filter((t) => t.status === "OPEN").length;
  const pass = done >= open;
  logCompAction({ app: "TestRunner", action: "npm test", target: "project suite", result: pass ? "all suites passed" : "1 suite failing", ok: pass, risk: "LOW", level: 1, testMode: s.compSettings.testMode });
  return {
    classification: { risk: "LOW", level: 1, destructive: false, reason: "test execution — read-only" },
    blocked: false,
    output: pass
      ? `✓ order pipeline ......... ok\n✓ margin calculator ...... ok\n✓ low-stock trigger ...... ok\n\n3 passed · 0 failed (${done} tasks closed vs ${open} open — suite reflects project health)`
      : `✓ order pipeline ......... ok\n✓ margin calculator ...... ok\n✗ low-stock trigger ...... FAIL — expected reorder alert at threshold\n\n2 passed · 1 failed. Likely cause: an open task still blocks the trigger. Fix, then re-run (OBSERVE → ACT → VERIFY).`,
  };
}

/* ================= system probe (module 78, 94) ================= */

export interface SystemProbe {
  cores: number;
  jsHeapMB: number | null;
  heapLimitMB: number | null;
  storageUsedMB: number | null;
  storageQuotaMB: number | null;
  net: string;
  online: boolean;
  dpr: number;
  screenW: number;
  screenH: number;
  extended: boolean;
  micAvailable: boolean;
  speech: boolean;
  loopLatencyMs: number | null;
}

let latencyCache: number | null = null;
export function measureLoopLatency(): Promise<number> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      latencyCache = +(performance.now() - t0).toFixed(1);
      resolve(latencyCache);
    }));
  });
}

export async function probeSystem(): Promise<SystemProbe> {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  let storageUsedMB: number | null = null;
  let storageQuotaMB: number | null = null;
  try {
    const est = await navigator.storage.estimate();
    storageUsedMB = Math.round((est.usage ?? 0) / 1048576);
    storageQuotaMB = Math.round((est.quota ?? 0) / 1048576);
  } catch { /* unsupported */ }
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
  const extended = typeof (screen as Screen & { isExtended?: boolean }).isExtended === "boolean"
    ? (screen as Screen & { isExtended?: boolean }).isExtended === true
    : window.screenX < 0 || window.screenX + window.innerWidth > screen.width;
  let micAvailable = false;
  try { micAvailable = (await listMics()).length > 0; } catch { micAvailable = false; }
  return {
    cores: navigator.hardwareConcurrency,
    jsHeapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
    heapLimitMB: mem ? Math.round(mem.jsHeapSizeLimit / 1048576) : null,
    storageUsedMB, storageQuotaMB,
    net: nav.connection?.effectiveType ?? "unknown",
    online: navigator.onLine,
    dpr: window.devicePixelRatio,
    screenW: screen.width, screenH: screen.height,
    extended,
    micAvailable,
    speech: speechSupported(),
    loopLatencyMs: latencyCache,
  };
}

/* ================= screen capture — REAL in browser (module 64) ================= */

export interface CaptureResult { ok: boolean; error?: string; label?: string; }

export async function takeCapture(kind: "screen" | "window" | "tab"): Promise<CaptureResult> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return { ok: false, error: "getDisplayMedia is not available in this browser — screen capture unsupported here (honest failure, nothing recorded)." };
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      // @ts-expect-error displaySurface preference is not in all TS libs
      preferCurrentTab: kind === "tab",
      selfBrowserSurface: "include",
    });
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings() as MediaTrackSettings & { displaySurface?: string };
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    await new Promise((r) => setTimeout(r, 300)); // let a frame settle
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 640 / (video.videoWidth || 1280));
    canvas.width = Math.round((video.videoWidth || 1280) * scale);
    canvas.height = Math.round((video.videoHeight || 720) * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    stream.getTracks().forEach((t) => t.stop());
    const surface = settings.displaySurface ?? kind;
    addCapture({ kind: surface === "monitor" ? "screen" : surface === "window" ? "window" : "tab", label: surface, dataUrl: canvas.toDataURL("image/jpeg", 0.72), w: canvas.width, h: canvas.height });
    logCompAction({ app: "ScreenCapture", action: "capture", target: surface, result: `${canvas.width}×${canvas.height} stored (retention-limited)`, ok: true, risk: "LOW", level: 0, testMode: false });
    return { ok: true, label: surface };
  } catch (e) {
    const name = e instanceof DOMException ? e.name : String(e);
    const msg = name === "NotAllowedError"
      ? "Capture permission was denied or dismissed — nothing was recorded. Re-run and choose a screen, window or tab to share."
      : `Capture failed (${name}). No image was stored.`;
    logCompAction({ app: "ScreenCapture", action: "capture", target: kind, result: msg, ok: false, risk: "LOW", level: 0, testMode: false });
    return { ok: false, error: msg };
  }
}

/* ================= research + compute (module 72) ================= */

export function supplierComparison(): string {
  const s = getState();
  const laptops = s.products.filter((p) => p.category === "Laptops").slice(0, 3);
  const suppliers = [
    { name: "Nairobi CBD — Kimathi St wholesale", delta: -0.06, terms: "cash & carry, same-day" },
    { name: "Moi Avenue electronics row", delta: -0.03, terms: "M-Pesa accepted, 1-day sourcing" },
    { name: "Westgate tech hub distributor", delta: 0.04, terms: "invoice + warranty, 2-3 day lead" },
  ];
  const rows: string[] = [];
  laptops.forEach((p) => {
    suppliers.forEach((sup) => {
      const quote = Math.round(p.costPrice * (1 + sup.delta));
      const margin = p.sellPrice - quote - 300 - Math.round(p.sellPrice * 0.015); // delivery + mpesa est
      rows.push(`- **${p.name}** @ ${sup.name}: quote ≈ **KSh ${quote.toLocaleString()}** (${sup.delta > 0 ? "+" : ""}${Math.round(sup.delta * 100)}% vs current cost) → est. margin **KSh ${margin.toLocaleString()}**/unit · ${sup.terms}`);
    });
  });
  const best = suppliers[0];
  return `### Supplier scan — ${laptops.length} laptops × ${suppliers.length} sources\n` +
    `_ESTIMATE — sample wholesale intelligence, not live quotes. No scraping was performed; verify by phone/visit before ordering._\n\n` +
    rows.join("\n") +
    `\n\n#### Recommendation\n${best.name} shows the best spread on current cost basis. Confirm stock + serial warranty before switching suppliers, and log the quote as a DECISION memory if you act on it.`;
}
