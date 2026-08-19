/* J.A.R.V.I.S OS — state kernel
 * Persistence (localStorage), pub/sub, event bus, audit logger,
 * business pipelines (NEW ORDER / LOW STOCK), health monitor.
 * Designed as a swappable adapter: replace internals with REST/Socket.IO later. */

import { useSyncExternalStore } from "react";
import type {
  AppState, AppEvent, AuditEntry, Notification, Product, Sale, Risk, Severity,
  HealthCheck, Memory, Task, CompAction, Capture, DevService,
} from "./types";
import { buildSeed, SEED_VERSION } from "./seed";

const KEY = "jarvis-os-state";
const DAY = 86_400_000;

/* ---------------- load / persist ---------------- */

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.version === SEED_VERSION && Array.isArray(parsed.products)) {
        // forward-compatible merge: older persisted states gain new subsystem fields
        const fallbacks = {
          compActions: [] as AppState["compActions"],
          devServices: [] as AppState["devServices"],
          captures: [] as AppState["captures"],
          compSettings: { testMode: true, retention: 20, autoTimeoutMs: 8000 },
        };
        return { ...fallbacks, ...parsed, compSettings: { ...fallbacks.compSettings, ...(parsed.compSettings ?? {}) } };
      }
    }
  } catch { /* corrupted state → reseed */ }
  return buildSeed();
}

let state: AppState = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full */ }
  }, 220);
}

export const getState = () => state;
export function mutate(fn: (s: AppState) => void) {
  fn(state);
  state = { ...state };
  listeners.forEach((l) => l());
  persist();
}
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function useStore(): AppState {
  return useSyncExternalStore(subscribe, getState);
}

/* ---------------- tiny event bus ---------------- */

type Handler = (payload?: unknown) => void;
const busMap = new Map<string, Set<Handler>>();
export const bus = {
  on(type: string, cb: Handler) {
    if (!busMap.has(type)) busMap.set(type, new Set());
    busMap.get(type)!.add(cb);
    return () => busMap.get(type)?.delete(cb);
  },
  emit(type: string, payload?: unknown) {
    busMap.get(type)?.forEach((cb) => { try { cb(payload); } catch { /* listener error isolated */ } });
  },
};

/* ---------------- ids & formatting ---------------- */

export const uid = () => Math.random().toString(36).slice(2, 10);
export const fmtKSh = (n: number) => `KSh ${Math.round(n).toLocaleString("en-US")}`;
export const fmtNum = (n: number) => n.toLocaleString("en-US");
export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString("en-KE", { day: "2-digit", month: "short" });
export function fmtAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "just now";
  if (d < 3600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < DAY) return `${Math.floor(d / 3600_000)}h ago`;
  return `${Math.floor(d / DAY)}d ago`;
}
export const dayKey = (ts: number) => new Date(ts).toDateString();
export const isToday = (ts: number) => dayKey(ts) === dayKey(Date.now());

/* ---------------- logging primitives ---------------- */

export function logEvent(type: string, message: string, severity: Severity = "info", simulated = false) {
  mutate((s) => {
    const e: AppEvent = { id: uid(), ts: Date.now(), type, message, severity, ...(simulated ? { simulated } : {}) };
    s.events = [e, ...s.events].slice(0, 140);
  });
  bus.emit("event", type);
}

export function notify(title: string, body: string, severity: Severity = "info", simulated = false) {
  mutate((s) => {
    const nt: Notification = { id: uid(), ts: Date.now(), title, body, severity, read: false, ...(simulated ? { simulated } : {}) };
    s.notifications = [nt, ...s.notifications].slice(0, 80);
  });
  bus.emit("notify", severity);
}

export function logAudit(entry: Omit<AuditEntry, "id" | "ts" | "actor"> & { actor?: string }) {
  mutate((s) => {
    s.audit = [{ id: uid(), ts: Date.now(), actor: entry.actor ?? "jarvis", ...entry }, ...s.audit].slice(0, 400);
  });
}

export function markAllRead() {
  mutate((s) => { s.notifications = s.notifications.map((x) => ({ ...x, read: true })); });
}

/* ---------------- business math ---------------- */

export function feeFor(channel: Sale["channel"], revenue: number): number {
  const rate = channel === "card" ? 0.03 : channel === "mpesa" ? 0.015 : 0;
  return Math.round(revenue * rate);
}
export function deliveryEstimate(p: Product): number {
  return p.category === "Laptops" ? 300 : p.category === "Phones" ? 250 : p.category === "Displays" ? 350 : 100;
}
export function saleProfit(sale: Sale, p: Product): number {
  return sale.unitPrice * sale.qty - p.costPrice * sale.qty - sale.deliveryCost - sale.fees;
}
export const velocityOf = (p: Product) => p.sold14d / 14;

export interface ProductPerf {
  product: Product; units: number; revenue: number; profit: number;
  margin: number; velocity: number; status: "HOT" | "OK" | "LOW" | "SLOW" | "LOSS";
  daysOfCover: number | null;
}

export function productPerformance(list: Product[], sales: Sale[]): ProductPerf[] {
  return list.map((p) => {
    const ps = sales.filter((x) => x.productId === p.id);
    const units = ps.reduce((a, b) => a + b.qty, 0);
    const revenue = ps.reduce((a, b) => a + b.unitPrice * b.qty, 0);
    const profit = ps.reduce((a, b) => a + saleProfit(b, p), 0);
    const margin = revenue > 0 ? profit / revenue : 0;
    const velocity = velocityOf(p);
    const daysOfCover = velocity > 0 ? p.stock / velocity : null;
    let status: ProductPerf["status"] = "OK";
    if (profit < 0 && units > 0) status = "LOSS";
    else if (p.stock <= p.reorderPoint) status = "LOW";
    else if (velocity >= 0.45 && margin >= 0.15) status = "HOT";
    else if (velocity < 0.12) status = "SLOW";
    return { product: p, units, revenue, profit, margin, velocity, status, daysOfCover };
  });
}

export interface DayPoint { label: string; revenue: number; profit: number; orders: number; }

export function dailySeries(s: AppState, days = 14): DayPoint[] {
  const out: DayPoint[] = [];
  const perfs = new Map(s.products.map((p) => [p.id, p]));
  for (let d = days - 1; d >= 0; d--) {
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const start = dayStart.getTime() - d * DAY;
    const end = start + DAY;
    const inDay = s.sales.filter((x) => x.ts >= start && x.ts < end);
    const revenue = inDay.reduce((a, b) => a + b.unitPrice * b.qty, 0);
    const profit = inDay.reduce((a, b) => a + saleProfit(b, perfs.get(b.productId)!), 0);
    out.push({
      label: d === 0 ? "today" : new Date(start).toLocaleDateString("en-KE", { weekday: "short" }).slice(0, 2),
      revenue, profit, orders: inDay.length,
    });
  }
  return out;
}

export function rangeTotals(s: AppState, days: number) {
  const perfs = new Map(s.products.map((p) => [p.id, p]));
  const from = Date.now() - days * DAY;
  const inRange = s.sales.filter((x) => x.ts >= from);
  const revenue = inRange.reduce((a, b) => a + b.unitPrice * b.qty, 0);
  const profit = inRange.reduce((a, b) => a + saleProfit(b, perfs.get(b.productId)!), 0);
  const expenses = s.expenses.filter((x) => x.ts >= from && x.category !== "sourcing")
    .reduce((a, b) => a + b.amount, 0);
  return { revenue, profit, expenses, netAfterExpenses: profit - expenses, orders: inRange.length };
}

/* ---------------- NEW ORDER pipeline ---------------- */

export interface SaleInput { productId: string; qty: number; channel: Sale["channel"]; customer?: string; simulated?: boolean; }
export interface SaleResult { ok: boolean; error?: string; sale?: Sale; profit?: number; warnings: string[]; }

export function recordSale(input: SaleInput): SaleResult {
  const s = getState();
  const p = s.products.find((x) => x.id === input.productId);
  const warnings: string[] = [];

  // STEP 1 — validate
  if (!p) {
    logAudit({ action: "business.record_sale", tool: "business_manager", input: JSON.stringify(input), result: "product not found", status: "FAILED", risk: "MEDIUM" });
    return { ok: false, error: "Product not found in catalogue — nothing was recorded.", warnings };
  }
  if (input.qty < 1 || p.stock < input.qty) {
    logAudit({ action: "business.record_sale", tool: "business_manager", input: JSON.stringify(input), result: `rejected: stock ${p.stock} < qty ${input.qty}`, status: "BLOCKED", risk: "MEDIUM" });
    return { ok: false, error: `Rejected: only ${p.stock} × ${p.name} in stock. Sale was NOT recorded (inventory integrity protected).`, warnings };
  }

  // STEP 2 — compute (FACT: prices from catalogue; EST: delivery)
  const revenue = p.sellPrice * input.qty;
  const delivery = deliveryEstimate(p);
  const fees = feeFor(input.channel, revenue);
  const sale: Sale = {
    id: uid(), productId: p.id, qty: input.qty, unitPrice: p.sellPrice,
    channel: input.channel, customer: input.customer, deliveryCost: delivery,
    fees, ts: Date.now(), simulated: !!input.simulated,
  };
  const profit = saleProfit(sale, p);

  // STEP 3 — update database
  mutate((st) => {
    st.sales = [sale, ...st.sales].slice(0, 500);
    st.products = st.products.map((x) =>
      x.id === p.id ? { ...x, stock: x.stock - input.qty, sold14d: x.sold14d + input.qty } : x,
    );
  });

  // STEP 4 — metrics + notification + audit
  logEvent("NEW ORDER", `${p.name} ×${input.qty} — ${fmtKSh(revenue)} (est. profit ${fmtKSh(profit)})${input.simulated ? " [SIM]" : ""}`, "success", !!input.simulated);
  notify("New sale", `${p.name} ×${input.qty} → ${fmtKSh(revenue)} · est. profit ${fmtKSh(profit)}`, "success", !!input.simulated);
  logAudit({
    action: "business.record_sale", tool: "business_manager",
    input: `${p.name} ×${input.qty} via ${input.channel}`,
    result: `revenue ${fmtKSh(revenue)}, est. profit ${fmtKSh(profit)}`,
    status: "SUCCESS", risk: "MEDIUM",
  });

  // STEP 5 — LOW STOCK automation
  const remaining = p.stock - input.qty;
  const velocity = (p.sold14d + input.qty) / 14;
  if (remaining <= p.reorderPoint) {
    const reorder = Math.max(p.reorderPoint * 2, Math.ceil(velocity * 14));
    const cover = velocity > 0 ? Math.floor(remaining / velocity) : null;
    logEvent("LOW STOCK", `${p.name}: ${remaining} left${cover !== null ? ` (~${cover}d cover)` : ""} — suggested reorder ${reorder} units from ${p.supplier}`, "warn");
    notify("Low stock", `${p.name} down to ${remaining}. Suggested reorder: ${reorder} units (${p.supplier}).`, "warn");
    warnings.push(`LOW STOCK — ${p.name} now at ${remaining}; suggested reorder ${reorder} units.`);
  }
  if (profit / revenue < 0.12) warnings.push(`Margin on this sale is ${Math.round((profit / revenue) * 100)}% — below your 12% floor. Review pricing or delivery cost.`);

  bus.emit("sale", { sale, product: p, simulated: input.simulated });
  return { ok: true, sale, profit, warnings };
}

/* ---------------- entity ops (audited where it matters) ---------------- */

export function updatePrice(productId: string, newPrice: number, reason: string) {
  const p = getState().products.find((x) => x.id === productId);
  if (!p || newPrice <= 0) return false;
  const old = p.sellPrice;
  mutate((s) => { s.products = s.products.map((x) => (x.id === productId ? { ...x, sellPrice: Math.round(newPrice) } : x)); });
  logEvent("PRICING", `${p.name}: ${fmtKSh(old)} → ${fmtKSh(newPrice)} (${reason})`, "info");
  logAudit({ action: "business.update_price", tool: "business_manager", input: `${p.name} → ${fmtKSh(newPrice)}`, result: `was ${fmtKSh(old)}; ${reason}`, status: "SUCCESS", risk: "MEDIUM", confirmed: true });
  return true;
}

export function addTask(title: string, priority: Task["priority"], projectId?: string): Task {
  const t: Task = { id: uid(), title, priority, projectId, status: "OPEN", tags: [], createdAt: Date.now() };
  mutate((s) => { s.tasks = [t, ...s.tasks]; });
  logEvent("TASK", `Added: "${title}" [${priority}]`, "info");
  logAudit({ action: "tasks.add", tool: "task_manager", input: title, result: "created", status: "SUCCESS", risk: "LOW" });
  return t;
}
export function toggleTask(id: string) {
  mutate((s) => {
    s.tasks = s.tasks.map((t) => {
      if (t.id !== id) return t;
      const done = t.status === "DONE";
      if (!done) logEvent("TASK", `Completed: "${t.title}"`, "success");
      return { ...t, status: done ? "OPEN" : "DONE", completedAt: done ? undefined : Date.now() };
    });
  });
}
export function deleteTask(id: string) {
  mutate((s) => { s.tasks = s.tasks.filter((t) => t.id !== id); });
}

export function addMemory(category: Memory["category"], title: string, body: string, source = "manual"): Memory {
  const m: Memory = { id: uid(), category, title, body, ts: Date.now(), source };
  mutate((s) => { s.memories = [m, ...s.memories]; });
  logAudit({ action: "memory.add", tool: "memory_manager", input: `[${category}] ${title}`, result: "stored", status: "SUCCESS", risk: "LOW" });
  return m;
}
export function updateMemory(id: string, title: string, body: string) {
  mutate((s) => { s.memories = s.memories.map((m) => (m.id === id ? { ...m, title, body, updatedTs: Date.now() } : m)); });
  logAudit({ action: "memory.update", tool: "memory_manager", input: id, result: "edited", status: "SUCCESS", risk: "LOW" });
}
export function deleteMemory(id: string) {
  const m = getState().memories.find((x) => x.id === id);
  mutate((s) => { s.memories = s.memories.filter((x) => x.id !== id); });
  logAudit({ action: "memory.delete", tool: "memory_manager", input: m ? `[${m.category}] ${m.title}` : id, result: "deleted (audited)", status: "SUCCESS", risk: "MEDIUM" });
}

export function logPractice(skillId: string, hours: number, conceptDone?: string) {
  mutate((s) => {
    s.skills = s.skills.map((k) => {
      if (k.id !== skillId) return k;
      const path = conceptDone
        ? k.path.map((st) => (st.name === conceptDone ? { ...st, done: true } : st))
        : k.path;
      const doneCount = path.filter((x) => x.done).length;
      const level = Math.min(100, Math.round((doneCount / Math.max(1, path.length)) * 80 + Math.min(20, k.practiceHours / 3)));
      return { ...k, path, practiceHours: +(k.practiceHours + hours).toFixed(1), lastPracticed: Date.now(), level };
    });
  });
  const k = getState().skills.find((x) => x.id === skillId);
  if (k) logEvent("LEARNING", `Logged ${hours}h on ${k.name}${conceptDone ? ` — completed "${conceptDone}"` : ""}`, "success");
}

export function addExpense(label: string, amount: number, category: "logistics" | "marketing" | "software" | "ops" | "sourcing") {
  mutate((s) => { s.expenses = [{ id: uid(), label, amount, category, ts: Date.now() }, ...s.expenses]; });
  logEvent("EXPENSE", `${label} — ${fmtKSh(amount)}`, "info");
  logAudit({ action: "business.add_expense", tool: "business_manager", input: label, result: fmtKSh(amount), status: "SUCCESS", risk: "LOW" });
}

export function pushChat(msg: AppState["chat"][number]) {
  mutate((s) => { s.chat = [...s.chat, msg].slice(-80); });
}
export function patchChat(id: string, patch: Partial<AppState["chat"][number]>) {
  mutate((s) => { s.chat = s.chat.map((m) => (m.id === id ? { ...m, ...patch } : m)); });
}
export function clearChat() {
  mutate((s) => { s.chat = []; });
  logAudit({ action: "chat.clear", tool: "conversation_memory", result: "transcript cleared", status: "SUCCESS", risk: "LOW" });
}

export function updateSettings(patch: Partial<AppState["settings"]>) {
  mutate((s) => { s.settings = { ...s.settings, ...patch }; });
}

/* ---------------- computer-control persistence ---------------- */

export function updateCompSettings(patch: Partial<AppState["compSettings"]>) {
  mutate((s) => { s.compSettings = { ...s.compSettings, ...patch }; });
}

export function logCompAction(entry: Omit<CompAction, "id" | "ts">) {
  mutate((s) => {
    s.compActions = [{ id: uid(), ts: Date.now(), ...entry }, ...s.compActions].slice(0, 300);
  });
  logAudit({
    action: `computer.${entry.app.toLowerCase().replace(/\s+/g, "_")}`,
    tool: "computer_controller",
    input: `${entry.action} → ${entry.target}`.slice(0, 90),
    result: entry.result.slice(0, 120),
    status: entry.ok ? "SUCCESS" : "FAILED",
    risk: entry.risk,
  });
}

export function addCapture(c: Omit<Capture, "id" | "ts">): Capture {
  const cap: Capture = { id: uid(), ts: Date.now(), ...c };
  mutate((s) => {
    s.captures = [cap, ...s.captures].slice(0, s.compSettings.retention);
  });
  return cap;
}
export function clearCaptures() {
  const n = getState().captures.length;
  mutate((s) => { s.captures = []; });
  logAudit({ action: "computer.clear_captures", tool: "screen_capture", result: `${n} screenshots discarded (privacy retention)`, status: "SUCCESS", risk: "MEDIUM", confirmed: true });
  return n;
}

export function upsertDevService(svc: DevService) {
  mutate((s) => {
    const i = s.devServices.findIndex((x) => x.id === svc.id);
    if (i >= 0) s.devServices = s.devServices.map((x) => (x.id === svc.id ? svc : x));
    else s.devServices = [svc, ...s.devServices];
  });
}
export function appendServiceLog(id: string, line: string) {
  mutate((s) => {
    s.devServices = s.devServices.map((x) =>
      x.id === id ? { ...x, log: [...x.log.slice(-60), line] } : x,
    );
  });
  bus.emit("comp:log", id);
}
export function removeDevService(id: string) {
  mutate((s) => { s.devServices = s.devServices.filter((x) => x.id !== id); });
}

export function updateIntegration(id: string, patch: Partial<AppState["integrations"][number]>) {
  mutate((s) => { s.integrations = s.integrations.map((i) => (i.id === id ? { ...i, ...patch } : i)); });
}
export function addWebhook(entry: Omit<AppState["webhooks"][number], "id" | "ts">) {
  mutate((s) => { s.webhooks = [{ id: uid(), ts: Date.now(), ...entry }, ...s.webhooks].slice(0, 60); });
}

/* ---------------- health monitor ---------------- */

export function runHealth(): HealthCheck[] {
  const s = getState();
  const checks: HealthCheck[] = [];
  let storageOk = false;
  try { localStorage.setItem("__jtest", "1"); localStorage.removeItem("__jtest"); storageOk = true; } catch { storageOk = false; }
  checks.push({
    id: "storage", label: "Storage / persistence",
    status: storageOk ? "ONLINE" : "ERROR",
    detail: storageOk ? `${s.products.length} products · ${s.sales.length} sales · ${s.memories.length} memories persisted` : "localStorage unavailable — data will not survive reload",
  });
  const speech = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  checks.push({
    id: "voice", label: "Voice system",
    status: speech ? "ONLINE" : "DEGRADED",
    detail: speech ? "Speech recognition available · TTS via speechSynthesis" : "SpeechRecognition API not supported in this browser — mic input disabled, typing still works",
  });
  checks.push({
    id: "audio", label: "Audio engine",
    status: typeof AudioContext !== "undefined" ? "ONLINE" : "DEGRADED",
    detail: typeof AudioContext !== "undefined" ? `WebAudio ready · volume ${Math.round(s.settings.volume * 100)}%` : "WebAudio unsupported — event sounds disabled",
  });
  const live = s.integrations.filter((i) => i.mode === "READY").length;
  checks.push({
    id: "integrations", label: "Integrations",
    status: live > 0 ? "ONLINE" : "DEGRADED",
    detail: live > 0 ? `${live} adapter(s) configured` : "All adapters in MOCK/OFF — expected until credentials are provided (rule 49)",
  });
  checks.push({
    id: "network", label: "Network",
    status: navigator.onLine ? "ONLINE" : "OFFLINE",
    detail: navigator.onLine ? "Browser reports connectivity" : "Browser offline — local subsystems continue to operate",
  });
  checks.push({
    id: "ai", label: "AI engine",
    status: "ONLINE",
    detail: s.integrations.find((i) => i.id === "openai")?.mode === "READY"
      ? "External LLM configured — provider adapter active"
      : "Local rule + tool engine active (deterministic, offline-capable)",
  });
  return checks;
}

export function overallHealth(checks: HealthCheck[]): "ONLINE" | "DEGRADED" | "ERROR" {
  if (checks.some((c) => c.status === "ERROR" || c.status === "OFFLINE")) return "ERROR";
  if (checks.some((c) => c.status === "DEGRADED")) return "DEGRADED";
  return "ONLINE";
}

/* ---------------- data management ---------------- */

export function exportState(): string {
  return JSON.stringify(getState(), null, 2);
}
export function importState(json: string): { ok: boolean; error?: string } {
  try {
    const parsed = JSON.parse(json) as AppState;
    if (parsed.version !== SEED_VERSION || !Array.isArray(parsed.products) || !Array.isArray(parsed.sales)) {
      return { ok: false, error: "Rejected: not a valid JARVIS OS state file (version/schema mismatch)." };
    }
    mutate(() => { state = parsed; });
    logAudit({ action: "system.import_state", tool: "memory_manager", result: "state restored from file", status: "SUCCESS", risk: "HIGH", confirmed: true });
    return { ok: true };
  } catch {
    return { ok: false, error: "Rejected: file is not valid JSON." };
  }
}
export function resetAll() {
  state = buildSeed();
  listeners.forEach((l) => l());
  persist();
  logEvent("SYSTEM", "Factory reset — state reseeded", "warn");
}
