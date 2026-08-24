/* J.A.R.V.I.S OS — domain models */

export type ID = string;

export type Risk = "LOW" | "MEDIUM" | "HIGH";
export type Severity = "info" | "success" | "warn" | "error";
export type ProductStatus = "HOT" | "OK" | "LOW" | "SLOW" | "LOSS";

export interface Product {
  id: ID;
  name: string;
  category: "Laptops" | "Phones" | "Accessories" | "Audio" | "Displays" | "Storage";
  supplier: string;
  costPrice: number;   // KSh, latest supplier quote
  sellPrice: number;   // KSh
  stock: number;
  sold14d: number;
  reorderPoint: number;
  tags: string[];
}

export interface Sale {
  id: ID;
  productId: ID;
  qty: number;
  unitPrice: number;
  channel: "mpesa" | "card" | "cash" | "online";
  customer?: string;
  deliveryCost: number;
  fees: number;
  ts: number;
  simulated: boolean;
}

export interface Expense {
  id: ID;
  label: string;
  amount: number;
  category: "logistics" | "marketing" | "software" | "ops" | "sourcing";
  ts: number;
}

export interface Customer {
  id: ID;
  name: string;
  segment: "Student" | "Developer" | "SME" | "Reseller" | "Consumer";
  orders: number;
  lifetimeValue: number;
  lastOrder: number;
  notes: string;
}

export interface Project {
  id: ID;
  name: string;
  goal: string;
  tech: string[];
  status: "active" | "planning" | "blocked" | "done";
  blockers: string[];
  nextAction: string;
  repo?: string;
  deployment?: string;
  updatedAt: number;
}

export interface Task {
  id: ID;
  title: string;
  projectId?: ID;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: "OPEN" | "DONE" | "BLOCKED";
  tags: string[];
  createdAt: number;
  completedAt?: number;
}

export interface Skill {
  id: ID;
  name: string;
  level: number;          // 0-100
  target: number;
  path: { name: string; done: boolean }[];
  weak: string[];
  practiceHours: number;
  lastPracticed?: number;
  nextLesson: string;
}

export type MemoryCategory =
  | "USER" | "PROJECT" | "BUSINESS" | "LEARNING"
  | "TASK" | "CONVERSATION" | "DECISION";

export interface Memory {
  id: ID;
  category: MemoryCategory;
  title: string;
  body: string;
  ts: number;
  updatedTs?: number;
  source: string;
}

export interface AuditEntry {
  id: ID;
  ts: number;
  actor: string;
  action: string;
  tool?: string;
  input?: string;
  result: string;
  status: "SUCCESS" | "FAILED" | "BLOCKED";
  risk: Risk;
  confirmed?: boolean;
}

export interface AppEvent {
  id: ID;
  ts: number;
  type: string;
  message: string;
  severity: Severity;
  simulated?: boolean;
}

export interface Notification {
  id: ID;
  ts: number;
  title: string;
  body: string;
  severity: Severity;
  read: boolean;
  simulated?: boolean;
}

export interface TraceStep { stage: string; detail: string; }
export interface ToolCallInfo { tool: string; input: string; output: string; risk: Risk; }

export interface PendingAction { id: string; label: string; risk: Risk; }

export interface ChatMsg {
  id: ID;
  role: "user" | "assistant";
  content: string;
  ts: number;
  trace?: TraceStep[];
  tools?: ToolCallInfo[];
  kind?: "text" | "report" | "confirm";
  pending?: PendingAction;
  resolved?: string;       // set after confirm/deny
}

export interface Integration {
  id: string;
  name: string;
  kind: string;
  mode: "OFF" | "MOCK" | "READY";
  hasCreds: boolean;
  credsHint: [string, string];
  requires: string[];
  note: string;
}

export interface WebhookLog {
  id: ID;
  ts: number;
  source: string;
  event: string;
  status: "ACCEPTED" | "REJECTED" | "SIMULATED";
  detail: string;
}

export interface Opportunity {
  id: ID;
  title: string;
  score: number;        // 0-100
  kind: "restock" | "pricing" | "bundle" | "market" | "freelance";
  rationale: string;
  ts: number;
}

export interface Competitor {
  id: ID;
  name: string;
  channel: string;
  focus: string;
  priceIndex: number;   // 1.0 = parity with our prices
  strength: string;
  weakness: string;
}

/* ---------- computer-control subsystem (modules 60-96) ---------- */

export type PermLevel = 0 | 1 | 2 | 3;

export interface CompAction {
  id: ID;
  ts: number;
  app: string;        // target application / subsystem
  action: string;     // what was attempted
  target: string;     // element / file / url / command
  result: string;     // observed outcome
  ok: boolean;
  risk: Risk;
  level: PermLevel;   // 0 OBSERVE · 1 SAFE · 2 MODIFY · 3 HIGH
  testMode: boolean;
}

export interface DevService {
  id: ID;
  name: string;
  cmd: string;
  port: number;
  status: "running" | "stopped";
  startedAt?: number;
  log: string[];
}

export interface Capture {
  id: ID;
  ts: number;
  kind: "screen" | "window" | "tab";
  label: string;
  dataUrl: string;
  w: number;
  h: number;
}

export interface CompSettings {
  testMode: boolean;      // demonstrate plans instead of executing natively
  retention: number;      // max stored screenshots
  autoTimeoutMs: number;  // per-action timeout
}

export interface Settings {
  userName: string;
  soundOn: boolean;
  volume: number;       // 0-1
  ttsOn: boolean;
  ttsVoice?: string;
  micDeviceId?: string;
  simOn: boolean;
  simIntervalSec: number;
  voiceContinuous?: boolean;  // Voice Link: auto-resume listening after JARVIS speaks
}

export interface HealthCheck {
  id: string;
  label: string;
  status: "ONLINE" | "DEGRADED" | "OFFLINE" | "ERROR";
  detail: string;
}

export interface AppState {
  version: number;
  settings: Settings;
  products: Product[];
  sales: Sale[];
  expenses: Expense[];
  customers: Customer[];
  competitors: Competitor[];
  projects: Project[];
  tasks: Task[];
  skills: Skill[];
  memories: Memory[];
  audit: AuditEntry[];
  events: AppEvent[];
  notifications: Notification[];
  chat: ChatMsg[];
  integrations: Integration[];
  webhooks: WebhookLog[];
  opportunities: Opportunity[];
  sessionId: string;
  bootedAt: number;
  compActions: CompAction[];
  devServices: DevService[];
  captures: Capture[];
  compSettings: CompSettings;
}
