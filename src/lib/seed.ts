import type {
  AppState, Product, Sale, Expense, Customer, Competitor, Project, Task,
  Skill, Memory, AuditEntry, Integration, WebhookLog, Opportunity, AppEvent, Notification,
} from "./types";

export const SEED_VERSION = 3;

/* deterministic RNG so first-run data is stable */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const now = () => Date.now();
const H = 3600_000, D = 24 * H;
let n = 0;
const uid = () => `s${(++n).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

const PRODUCTS: Product[] = [
  { id: "p1", name: "HP EliteBook 840 G5 (i5/8GB/256SSD)", category: "Laptops", supplier: "Nairobi Refurb Hub", costPrice: 38500, sellPrice: 47500, stock: 4, sold14d: 5, reorderPoint: 3, tags: ["refurb", "business", "programming"] },
  { id: "p2", name: "Dell Latitude 7490 (i5/8GB/256SSD)", category: "Laptops", supplier: "Moi Ave Traders", costPrice: 36000, sellPrice: 44000, stock: 3, sold14d: 4, reorderPoint: 3, tags: ["refurb", "business"] },
  { id: "p3", name: "Lenovo ThinkPad T480 (i5/8GB/256SSD)", category: "Laptops", supplier: "Nairobi Refurb Hub", costPrice: 33000, sellPrice: 41500, stock: 6, sold14d: 3, reorderPoint: 2, tags: ["refurb", "durable"] },
  { id: "p4", name: "MacBook Air M1 256GB", category: "Laptops", supplier: "Official Distributor KE", costPrice: 62000, sellPrice: 74500, stock: 2, sold14d: 2, reorderPoint: 2, tags: ["apple", "premium"] },
  { id: "p5", name: "HP 15s (i5 11th Gen/8GB/512SSD)", category: "Laptops", supplier: "Official Distributor KE", costPrice: 52000, sellPrice: 63500, stock: 3, sold14d: 2, reorderPoint: 2, tags: ["new", "student"] },
  { id: "p6", name: "iPhone 11 128GB (UK Used)", category: "Phones", supplier: "Luthuli Ave Imports", costPrice: 41000, sellPrice: 49500, stock: 5, sold14d: 6, reorderPoint: 3, tags: ["apple", "used"] },
  { id: "p7", name: "Samsung Galaxy A54 128GB", category: "Phones", supplier: "Official Distributor KE", costPrice: 29500, sellPrice: 36900, stock: 7, sold14d: 4, reorderPoint: 3, tags: ["new", "midrange"] },
  { id: "p8", name: "Anker PowerCore 20,000mAh", category: "Accessories", supplier: "Kamukunji Wholesale", costPrice: 2400, sellPrice: 3800, stock: 18, sold14d: 11, reorderPoint: 6, tags: ["fast-mover"] },
  { id: "p9", name: "Logitech MX Keys Keyboard", category: "Accessories", supplier: "Moi Ave Traders", costPrice: 6800, sellPrice: 9500, stock: 9, sold14d: 3, reorderPoint: 3, tags: ["productivity"] },
  { id: "p10", name: "JBL Tune 510BT Headphones", category: "Audio", supplier: "Kamukunji Wholesale", costPrice: 3600, sellPrice: 5400, stock: 2, sold14d: 7, reorderPoint: 4, tags: ["fast-mover", "bluetooth"] },
  { id: "p11", name: 'LG 24" Full HD Monitor', category: "Displays", supplier: "Moi Ave Traders", costPrice: 12500, sellPrice: 16900, stock: 5, sold14d: 2, reorderPoint: 2, tags: ["office"] },
  { id: "p12", name: "WD Blue 1TB NVMe SSD", category: "Storage", supplier: "Kamukunji Wholesale", costPrice: 5200, sellPrice: 7400, stock: 10, sold14d: 5, reorderPoint: 4, tags: ["upgrade"] },
];

function buildSales(): Sale[] {
  const rnd = mulberry32(20240817);
  const sales: Sale[] = [];
  const channels: Sale["channel"][] = ["mpesa", "mpesa", "mpesa", "card", "cash", "online"];
  for (let d = 13; d >= 0; d--) {
    // guarantee activity today
    const count = d === 0 ? 3 : 1 + Math.floor(rnd() * (d < 4 ? 4 : 3));
    for (let i = 0; i < count; i++) {
      const p = PRODUCTS[Math.floor(rnd() * PRODUCTS.length)];
      const qty = p.category === "Accessories" || p.category === "Audio" ? (rnd() > 0.7 ? 2 : 1) : 1;
      const channel = channels[Math.floor(rnd() * channels.length)];
      const unit = p.sellPrice;
      const revenue = unit * qty;
      const fees = channel === "card" ? revenue * 0.03 : channel === "mpesa" ? revenue * 0.015 : 0;
      const deliveryCost = p.category === "Laptops" || p.category === "Phones" ? 150 + Math.floor(rnd() * 250) : Math.floor(rnd() * 120);
      sales.push({
        id: uid(), productId: p.id, qty, unitPrice: unit, channel,
        deliveryCost: Math.round(deliveryCost), fees: Math.round(fees),
        ts: now() - d * D - Math.floor(rnd() * 10) * H - 2 * H,
        simulated: false,
      });
    }
  }
  return sales.sort((a, b) => b.ts - a.ts);
}

const EXPENSES: Expense[] = [
  { id: uid(), label: "WooCommerce hosting + domain", amount: 1800, category: "software", ts: now() - 12 * D },
  { id: uid(), label: "Boda delivery reimbursements", amount: 2350, category: "logistics", ts: now() - 9 * D },
  { id: uid(), label: "TikTok boosted post — JBL 510BT", amount: 1500, category: "marketing", ts: now() - 7 * D },
  { id: uid(), label: "Packaging + airtime/data", amount: 1450, category: "ops", ts: now() - 6 * D },
  { id: uid(), label: "Stock float — power banks (Kamukunji)", amount: 21600, category: "sourcing", ts: now() - 5 * D },
  { id: uid(), label: "Instagram ad — EliteBook bundle", amount: 2000, category: "marketing", ts: now() - 3 * D },
  { id: uid(), label: "Sendy courier — Westlands run", amount: 600, category: "logistics", ts: now() - 1 * D },
];

const CUSTOMERS: Customer[] = [
  { id: uid(), name: "Brian O.", segment: "Developer", orders: 3, lifetimeValue: 96500, lastOrder: now() - 2 * D, notes: "Bought EliteBook + SSD. Values warranty honesty. Referral potential." },
  { id: uid(), name: "Wanjiku M.", segment: "Student", orders: 2, lifetimeValue: 43400, lastOrder: now() - 5 * D, notes: "Budget-driven. Responds to M-Pesa instalment offers." },
  { id: uid(), name: "TechHub SME Ltd", segment: "SME", orders: 4, lifetimeValue: 214000, lastOrder: now() - 1 * D, notes: "Bulk buyer — 3 monitors + keyboards. Wants invoice + LPO." },
  { id: uid(), name: "Kevin R.", segment: "Reseller", orders: 5, lifetimeValue: 167500, lastOrder: now() - 4 * D, notes: "Resells in Nakuru. Negotiates hard; volume over margin." },
  { id: uid(), name: "Amina S.", segment: "Consumer", orders: 1, lifetimeValue: 49500, lastOrder: now() - 8 * D, notes: "iPhone 11 buyer. Ask for review + unboxing video collab." },
];

const COMPETITORS: Competitor[] = [
  { id: uid(), name: "GadgetKE Online", channel: "Shop + Instagram", focus: "Refurb laptops, Nairobi CBD", priceIndex: 0.94, strength: "Established reviews, same-day delivery", weakness: "Weak product pages, no financing options" },
  { id: uid(), name: "PigiaMe top seller (refurbs)", channel: "Marketplace", focus: "Price wars on EliteBook/Latitude", priceIndex: 0.9, strength: "Marketplace traffic is free", weakness: "No brand, no warranty story, race to bottom" },
  { id: uid(), name: "@nairobigadgets (IG/TikTok)", channel: "Social commerce", focus: "Phones + audio, content-led", priceIndex: 1.06, strength: "Strong video content, young audience", weakness: "Prices 5–8% above market, thin catalogue" },
];

const PROJECTS: Project[] = [
  {
    id: "pr1", name: "J.A.R.V.I.S OS", goal: "Personal intelligence kernel: memory, tools, business + learning engines, command dashboard.",
    tech: ["TypeScript", "React", "Vite", "Web Speech API", "WebAudio"], status: "active",
    blockers: [], nextAction: "Wire WooCommerce webhook adapter to a hosted relay when backend is available.",
    repo: "local/jarvis-os", deployment: "static build", updatedAt: now() - 2 * H,
  },
  {
    id: "pr2", name: "Duka Electronics Store", goal: "WooCommerce storefront for the electronics resale business with M-Pesa checkout.",
    tech: ["WordPress", "WooCommerce", "Elementor", "M-Pesa Daraja"], status: "active",
    blockers: ["Daraja STK-push credentials pending business verification"],
    nextAction: "Publish 5 product pages with AI-drafted descriptions + KSh pricing.", repo: "wordpress/duka-store",
    deployment: "shared hosting (duka.ke planned)", updatedAt: now() - 26 * H,
  },
  {
    id: "pr3", name: "Freelance Portfolio v1", goal: "Position as WordPress + WooCommerce + AI-integration freelancer for SME clients.",
    tech: ["Astro", "Tailwind", "GitHub Pages"], status: "planning",
    blockers: ["Needs 2 case studies — use Duka store metrics once live"],
    nextAction: "Write service page: 'WooCommerce setup + AI product descriptions — KSh 25,000'.", repo: "github/planned",
    updatedAt: now() - 3 * D,
  },
];

const TASKS: Task[] = [
  { id: uid(), title: "Publish 5 WooCommerce product pages (EliteBook, T480, A54, JBL, PowerCore)", projectId: "pr2", priority: "HIGH", status: "OPEN", tags: ["store", "content"], createdAt: now() - 3 * D },
  { id: uid(), title: "Apply Daraja API business verification documents", projectId: "pr2", priority: "HIGH", status: "BLOCKED", tags: ["payments"], createdAt: now() - 6 * D },
  { id: uid(), title: "Send proposal: bookkeeping firm site rebuild (WordPress)", priority: "HIGH", status: "OPEN", tags: ["freelance"], createdAt: now() - 2 * D },
  { id: uid(), title: "Node.js lesson — Express middleware + error handling", projectId: "pr1", priority: "MEDIUM", status: "OPEN", tags: ["learning", "node"], createdAt: now() - 2 * D },
  { id: uid(), title: "Shoot 3 TikTok clips: PowerCore + JBL combo demo", priority: "MEDIUM", status: "OPEN", tags: ["marketing"], createdAt: now() - 4 * D },
  { id: uid(), title: "Restock JBL 510BT — only 2 units left vs 0.5/day velocity", priority: "HIGH", status: "OPEN", tags: ["stock"], createdAt: now() - 1 * D },
  { id: uid(), title: "SQL practice — design orders/order_items schema from scratch", priority: "MEDIUM", status: "OPEN", tags: ["learning", "db"], createdAt: now() - 5 * D },
  { id: uid(), title: "Follow up TechHub SME — quote 5 more monitors", priority: "MEDIUM", status: "OPEN", tags: ["sales"], createdAt: now() - 1 * D },
  { id: uid(), title: "Set up WooCommerce order webhook → relay endpoint (mock until hosted)", projectId: "pr1", priority: "LOW", status: "DONE", tags: ["integration"], createdAt: now() - 8 * D, completedAt: now() - 2 * D },
  { id: uid(), title: "Draft invoice template + terms for freelance clients", priority: "LOW", status: "DONE", tags: ["freelance"], createdAt: now() - 10 * D, completedAt: now() - 4 * D },
];

const SKILLS: Skill[] = [
  {
    id: "sk1", name: "JavaScript", level: 62, target: 90,
    path: [{ name: "Fundamentals & ES2020+", done: true }, { name: "DOM & events", done: true }, { name: "Async: promises, fetch, patterns", done: true }, { name: "Closures, prototypes, this", done: false }, { name: "Modules & build tooling", done: false }],
    weak: ["event loop mental model", "prototype chain"], practiceHours: 41, lastPracticed: now() - 2 * D, nextLesson: "Closures — build a memoize() and a private-counter module from scratch.",
  },
  {
    id: "sk2", name: "Node.js + Express", level: 38, target: 85,
    path: [{ name: "Node runtime & modules", done: true }, { name: "Express routing", done: true }, { name: "Middleware & error handling", done: false }, { name: "REST API design", done: false }, { name: "Auth: sessions/JWT", done: false }, { name: "Production deploy", done: false }],
    weak: ["middleware ordering", "async error propagation"], practiceHours: 18, lastPracticed: now() - 3 * D, nextLesson: "Middleware — write a request logger, rate limiter and central error handler for a mini API.",
  },
  {
    id: "sk3", name: "Databases & SQL", level: 42, target: 80,
    path: [{ name: "Relational modelling", done: true }, { name: "SELECT/JOIN fluency", done: true }, { name: "Indexes & query plans", done: false }, { name: "Transactions", done: false }, { name: "Postgres security hardening", done: false }],
    weak: ["JOIN strategy", "index selection"], practiceHours: 14, lastPracticed: now() - 6 * D, nextLesson: "Model the Duka schema: products, orders, order_items, suppliers — then write 5 analytical queries.",
  },
  {
    id: "sk4", name: "WordPress + WooCommerce", level: 55, target: 85,
    path: [{ name: "WP admin & themes", done: true }, { name: "Woo products/orders", done: true }, { name: "REST API & webhooks", done: false }, { name: "Payment gateways (M-Pesa)", done: false }, { name: "Performance & security", done: false }],
    weak: ["webhook verification", "gateway callbacks"], practiceHours: 26, lastPracticed: now() - 1 * D, nextLesson: "Wire a WooCommerce order webhook to a local relay and verify the signature.",
  },
  {
    id: "sk5", name: "AI Integration & Agents", level: 30, target: 75,
    path: [{ name: "Prompt engineering", done: true }, { name: "Chat completion APIs", done: true }, { name: "Tool/function calling", done: false }, { name: "RAG & embeddings", done: false }, { name: "Agent loops & guardrails", done: false }],
    weak: ["structured outputs", "cost control"], practiceHours: 11, lastPracticed: now() - 4 * D, nextLesson: "Rebuild one JARVIS intent handler against a real LLM tool-calling API.",
  },
  {
    id: "sk6", name: "Python + OpenCV", level: 20, target: 60,
    path: [{ name: "Python basics", done: true }, { name: "NumPy arrays", done: false }, { name: "Image loading & filtering", done: false }, { name: "Detection basics", done: false }],
    weak: ["vectorised thinking"], practiceHours: 6, lastPracticed: now() - 12 * D, nextLesson: "OpenCV — load an image, threshold it, count objects. 45-minute sprint.",
  },
  {
    id: "sk7", name: "Git & GitHub", level: 70, target: 85,
    path: [{ name: "Daily workflow", done: true }, { name: "Branching & PRs", done: true }, { name: "Rebase & conflict surgery", done: false }, { name: "Actions CI", done: false }],
    weak: ["interactive rebase"], practiceHours: 30, lastPracticed: now() - 1 * D, nextLesson: "Deliberately create and resolve a merge conflict, then rebase a 3-commit branch.",
  },
  {
    id: "sk8", name: "Cybersecurity Basics", level: 15, target: 55,
    path: [{ name: "OWASP Top 10 awareness", done: true }, { name: "Input validation & SQLi", done: false }, { name: "Auth/session attacks", done: false }, { name: "Secrets management", done: false }],
    weak: ["threat modelling"], practiceHours: 4, lastPracticed: now() - 15 * D, nextLesson: "Audit one of your forms end-to-end for XSS + SQLi. Write findings in DECISION memory.",
  },
];

const MEMORIES: Memory[] = [
  { id: uid(), category: "USER", title: "Core objectives", body: "Become highly skilled in tech (web dev → Node → AI integration). Grow freelancing income. Scale electronics resale business in Kenya. Long arc: SKILLS → FREELANCING → INCOME → BUSINESS → ASSETS. No get-rich-quick shortcuts.", ts: now() - 20 * D, source: "user statement" },
  { id: uid(), category: "USER", title: "Working style", body: "Prefers direct, calm, strategic communication. Wants to be challenged and taught, not just answered. Distrusts inflated claims — label estimates as estimates.", ts: now() - 20 * D, source: "user statement" },
  { id: uid(), category: "BUSINESS", title: "Supplier map", body: "Nairobi Refurb Hub — best refurb laptop prices, 30-day warranty. Moi Ave Traders — monitors/keyboards, negotiable on 3+ units. Kamukunji Wholesale — accessories, cash only, lowest prices. Luthuli Ave Imports — phones, verify IMEI + battery health every time.", ts: now() - 15 * D, source: "user notes" },
  { id: uid(), category: "BUSINESS", title: "Pricing rule", body: "Target gross margin ≥ 18% on laptops, ≥ 30% on accessories. Always subtract delivery + channel fees before calling anything profit. Revenue ≠ profit.", ts: now() - 15 * D, source: "decision" },
  { id: uid(), category: "DECISION", title: "Dropship-lite model first", body: "Decision: source on demand from trusted suppliers instead of holding big inventory. Trade-off: lower margin per unit, much lower capital risk. Review when monthly profit > KSh 40,000 for 3 straight months.", ts: now() - 14 * D, source: "strategy session" },
  { id: uid(), category: "LEARNING", title: "Learning policy", body: "Project-based learning only. Every concept must end in something built or broken and fixed. 45–60 min focused sprints, log hours, raise difficulty each week.", ts: now() - 18 * D, source: "user statement" },
  { id: uid(), category: "PROJECT", title: "Duka store positioning", body: "Angle: 'tested refurbs with honest spec sheets + WhatsApp support'. Competitors either race price to the bottom or overprice with flashy content. We win on trust + response speed.", ts: now() - 10 * D, source: "competitor review" },
  { id: uid(), category: "TASK", title: "Freelance pricing anchor", body: "Starting rates: WordPress business site KSh 25k–40k; WooCommerce setup KSh 30k–60k; AI product-description integration KSh 15k add-on. Raise after 3 paid projects.", ts: now() - 9 * D, source: "market scan" },
];

const AUDIT: AuditEntry[] = [
  { id: uid(), ts: now() - 5 * H, actor: "system", action: "seed_initialized", tool: "memory_manager", input: "v" + SEED_VERSION, result: "12 products, 8 skills, 8 memories loaded", status: "SUCCESS", risk: "LOW" },
  { id: uid(), ts: now() - 4 * H, actor: "jarvis", action: "business.recompute_metrics", tool: "analytics_engine", result: "14-day window: margins, velocity, status refreshed", status: "SUCCESS", risk: "LOW" },
  { id: uid(), ts: now() - 3 * H, actor: "jarvis", action: "integrations.mock_mode", tool: "integration_manager", result: "7 adapters in MOCK/OFF — no credentials configured", status: "SUCCESS", risk: "LOW" },
  { id: uid(), ts: now() - 2 * H, actor: "jarvis", action: "health.self_diagnostic", tool: "health_monitor", result: "core subsystems nominal", status: "SUCCESS", risk: "LOW" },
];

const INTEGRATIONS: Integration[] = [
  { id: "woocommerce", name: "WooCommerce", kind: "Storefront / orders", mode: "MOCK", hasCreds: false, credsHint: ["Consumer key (ck_…)", "Consumer secret (cs_…)"], requires: ["WordPress site URL", "REST keys with read/write scope", "Webhook endpoint (hosted)"], note: "Order webhooks currently simulated locally. Goes LIVE once keys + hosted relay exist." },
  { id: "mpesa", name: "M-Pesa Daraja", kind: "Payments (STK push)", mode: "OFF", hasCreds: false, credsHint: ["Consumer key", "Consumer secret"], requires: ["Safaricom developer account", "Business verification (till/paybill)", "Public HTTPS callback URL"], note: "Cannot go live without business verification. Do not fake payment confirmations." },
  { id: "telegram", name: "Telegram Bot", kind: "Notifications", mode: "MOCK", hasCreds: false, credsHint: ["Bot token", "Chat ID"], requires: ["BotFather token", "Owner chat id"], note: "Alerts (new sale, low stock) queue locally until a token is set." },
  { id: "meta", name: "Meta (IG/Facebook)", kind: "Social analytics", mode: "OFF", hasCreds: false, credsHint: ["Access token", "IG business account id"], requires: ["Meta developer app review", "Instagram Business account", "pages_show_list + insights perms"], note: "Insights API needs app review; content publishing needs advanced access." },
  { id: "tiktok", name: "TikTok", kind: "Social analytics", mode: "OFF", hasCreds: false, credsHint: ["Client key", "Client secret"], requires: ["TikTok developer app approval", "video.insights scope (restricted)"], note: "Video insights scope is restricted-access — expect a manual approval process." },
  { id: "openai", name: "AI Provider (OpenAI-compatible)", kind: "LLM backbone", mode: "MOCK", hasCreds: false, credsHint: ["API key (sk-…)", "Model name"], requires: ["API key", "Billing enabled"], note: "Intent + tools currently run on the local rule engine. Adapter is provider-swappable." },
  { id: "zapier", name: "Zapier / webhooks", kind: "Automation bridge", mode: "MOCK", hasCreds: false, credsHint: ["Catch-hook URL", "—"], requires: ["Zapier catch-hook URL"], note: "Can forward business events to 5,000+ apps once a hook URL is set." },
];

const WEBHOOKS: WebhookLog[] = [
  { id: uid(), ts: now() - 6 * H, source: "woocommerce", event: "order.created", status: "SIMULATED", detail: "Order #1042 — JBL Tune 510BT ×1 — pipeline: validate → metrics → notify → audit" },
  { id: uid(), ts: now() - 1 * D, source: "telegram", event: "notification.queued", status: "SIMULATED", detail: "'New sale: KSh 5,400' held in local queue (no bot token configured)" },
];

function buildOpportunities(): Opportunity[] {
  return [
    { id: uid(), kind: "restock", score: 86, title: "Restock JBL Tune 510BT", rationale: "Velocity ≈ 0.5/day but 2 units remain (~4 days of cover). 33% gross margin — your best accessory margin.", ts: now() - 3 * H },
    { id: uid(), kind: "bundle", score: 74, title: "Bundle PowerCore + JBL 510BT", rationale: "Both fast movers bought by the same student/consumer segment. Bundle at KSh 8,800 (vs 9,200 apart) lifts basket while keeping ~30% margin.", ts: now() - 5 * H },
    { id: uid(), kind: "pricing", score: 68, title: "EliteBook 840 G5 holds a price premium", rationale: "Competitor marketplace listings sit ~6–10% lower, but buyers keep choosing tested units with warranty. Do not cut price; emphasise the 30-day warranty in the listing.", ts: now() - 8 * H },
    { id: uid(), kind: "freelance", score: 71, title: "WooCommerce + AI descriptions service", rationale: "You already run this pipeline for Duka. Package it: store setup + 20 AI-drafted product pages, KSh 35,000. 3 SME leads in your network fit.", ts: now() - 1 * D },
  ];
}

const EVENTS: AppEvent[] = [
  { id: uid(), ts: now() - 40 * 60_000, type: "SYSTEM", message: "JARVIS kernel online — all local subsystems nominal", severity: "success" },
  { id: uid(), ts: now() - 35 * 60_000, type: "INTEGRATIONS", message: "7 adapters initialised in MOCK/OFF mode (no credentials configured)", severity: "info", simulated: true },
  { id: uid(), ts: now() - 22 * 60_000, type: "BUSINESS", message: "Daily metrics recomputed over 14-day window", severity: "info" },
];

const NOTIFS: Notification[] = [
  { id: uid(), ts: now() - 50 * 60_000, title: "Low stock", body: "JBL Tune 510BT: 2 left, ~4 days of cover at current velocity.", severity: "warn", read: false },
  { id: uid(), ts: now() - 90 * 60_000, title: "Follow-up due", body: "TechHub SME asked about 5 more monitors — no reply yet.", severity: "info", read: false },
];

export function buildSeed(): AppState {
  return {
    version: SEED_VERSION,
    settings: {
      userName: "Boss",
      soundOn: true, volume: 0.6, ttsOn: false,
      simOn: true, simIntervalSec: 60,
    },
    products: PRODUCTS,
    sales: buildSales(),
    expenses: EXPENSES,
    customers: CUSTOMERS,
    competitors: COMPETITORS,
    projects: PROJECTS,
    tasks: TASKS,
    skills: SKILLS,
    memories: MEMORIES,
    audit: AUDIT,
    events: EVENTS,
    notifications: NOTIFS,
    chat: [],
    integrations: INTEGRATIONS,
    webhooks: WEBHOOKS,
    opportunities: buildOpportunities(),
    sessionId: uid() + uid(),
    bootedAt: now(),
  };
}
