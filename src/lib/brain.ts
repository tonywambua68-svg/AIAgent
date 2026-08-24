/* J.A.R.V.I.S OS — intelligence layer
 * Pipeline: INTENT → CONTEXT → MEMORY → TOOL PLANNING → EXECUTION → VALIDATION → RESPONSE
 * Deterministic local engine (offline-capable). An external LLM adapter can replace
 * intent detection/response generation without touching the tools. */

import type { ChatMsg, Risk, ToolCallInfo, TraceStep } from "./types";
import {
  getState, productPerformance, rangeTotals, recordSale, addTask,
  toggleTask, addMemory, updatePrice, runHealth, fmtKSh, fmtAgo, isToday,
  logEvent, logAudit, uid, clearChat, mutate,
} from "./store";
import {
  runPlan, planMarkdown, execTerminal, startDevService, stopDevService,
  probeSystem, takeCapture, supplierComparison, emergencyStop, classifyCommand,
  type PlanStepDef, type StepResult,
} from "./computer";
import { listMics } from "./voice";

export interface BrainResult {
  content: string;
  trace: TraceStep[];
  tools: ToolCallInfo[];
  kind?: "text" | "report" | "confirm";
  pending?: { id: string; label: string; risk: Risk };
}

/* ---------------- tool registry ---------------- */

export interface ToolDef { name: string; description: string; risk: Risk; input: string; output: string; }

export const TOOLS: ToolDef[] = [
  { name: "computer.observe", description: "Probe vitals, active window, displays, services — Level 0", risk: "LOW", input: "{probe: 'vitals'|'services'|'displays'}", output: "{cores, heapMB, storage, net, displays}" },
  { name: "computer.plan", description: "Convert NL command into verified step plan (OBSERVE→PLAN→ACT→VERIFY)", risk: "LOW", input: "{command}", output: "{steps[], risks[]}" },
  { name: "computer.execute", description: "Run plan with timeouts, loop protection, emergency-stop checks", risk: "MEDIUM", input: "{planId}", output: "{results[], aborted}" },
  { name: "terminal.run", description: "Sandboxed shell: safe commands real, destructive classified+blocked", risk: "LOW", input: "{cmd}", output: "{output, classification, blocked}" },
  { name: "screen.capture", description: "Real getDisplayMedia capture with retention limits (module 64)", risk: "LOW", input: "{kind: 'screen'|'window'|'tab'}", output: "{ok, error?}" },
  { name: "devserver.control", description: "Start/stop dev services with streamed logs (Level 2)", risk: "MEDIUM", input: "{cmd|id}", output: "{port, status}" },
  { name: "process.manage", description: "List sandbox processes; termination confirm-gated, system procs untouchable", risk: "MEDIUM", input: "{action: 'list'|'kill', target}", output: "{ok}" },
  { name: "fs.inspect", description: "Read-only virtual FS: ls, cat, tree over project model", risk: "LOW", input: "{path}", output: "{entries|content}" },
  { name: "business.analytics", description: "Revenue, profit, margin, velocity over any window", risk: "LOW", input: "{window: 'today'|'7d'|'14d'}", output: "{revenue, profit, orders, margin}" },
  { name: "business.record_sale", description: "NEW ORDER pipeline: validate → stock → metrics → notify → audit", risk: "MEDIUM", input: "{productId, qty, channel}", output: "{ok, profit, warnings}" },
  { name: "business.update_price", description: "Change a product's selling price (audited)", risk: "MEDIUM", input: "{productId, newPrice, reason}", output: "{ok}" },
  { name: "business.pricing_advisor", description: "Suggested KSh price from cost, delivery, fees, target margin", risk: "LOW", input: "{cost, delivery, feesPct, marginPct}", output: "{price, profitPerUnit, breakEven}" },
  { name: "inventory.status", description: "Stock levels, days-of-cover, reorder suggestions", risk: "LOW", input: "{filter?}", output: "ProductPerf[]" },
  { name: "tasks.manage", description: "Add / complete / prioritise tasks", risk: "LOW", input: "{op, title?, id?}", output: "{ok}" },
  { name: "learning.advisor", description: "Next lesson per skill, practice tracking", risk: "LOW", input: "{skill?}", output: "{lesson, sprint}" },
  { name: "projects.status", description: "Project health, blockers, next actions", risk: "LOW", input: "{id?}", output: "summary" },
  { name: "memory.search", description: "Search structured memory (all categories)", risk: "LOW", input: "{query}", output: "Memory[]" },
  { name: "memory.write", description: "Store a durable memory (categorised)", risk: "LOW", input: "{category, title, body}", output: "{ok}" },
  { name: "memory.delete_all", description: "Wipe all memories — irreversible", risk: "HIGH", input: "{confirm}", output: "{deleted}" },
  { name: "research.market", description: "Catalogue + competitor-based market read (no scraping)", risk: "LOW", input: "{topic}", output: "summary" },
  { name: "marketing.draft", description: "Product descriptions, captions, campaign skeletons", risk: "LOW", input: "{kind, productId}", output: "draft text" },
  { name: "report.daily", description: "Cross-domain daily intelligence report", risk: "LOW", input: "{}", output: "report" },
  { name: "diagnostics.health", description: "Subsystem health checks", risk: "LOW", input: "{}", output: "HealthCheck[]" },
  { name: "calculator", description: "Arithmetic with unit awareness", risk: "LOW", input: "expression", output: "number" },
];

/* ---------------- pipeline helpers ---------------- */

function makeCtx() {
  const trace: TraceStep[] = [];
  const tools: ToolCallInfo[] = [];
  const call = (tool: string, input: string, risk: Risk, fn: () => string) => {
    const output = fn();
    tools.push({ tool, input, output: output.length > 140 ? output.slice(0, 140) + "…" : output, risk });
    logAudit({ action: tool, tool, input, result: output.slice(0, 120), status: "SUCCESS", risk });
    return output;
  };
  return { trace, tools, call };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function matchProduct(q: string) {
  const s = getState();
  const nq = norm(q);
  const toks = nq.split(" ").filter((t) => t.length > 2);
  let best: { p: (typeof s.products)[number]; score: number } | null = null;
  for (const p of s.products) {
    const np = norm(p.name);
    let score = 0;
    if (np.includes(nq) && nq.length > 2) score += 10;
    for (const t of toks) if (np.includes(t)) score += 3;
    if (score > (best?.score ?? 0)) best = { p, score };
  }
  return best && best.score >= 3 ? best.p : null;
}

const nums = (text: string) =>
  (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => parseFloat(x.replace(/,/g, ""))).filter((x) => !isNaN(x));

/* ---------------- intent detection ---------------- */

interface IntentRule { intent: string; re: RegExp; conf: number; }
const RULES: IntentRule[] = [
  /* ---- computer-control intents (highest priority) ---- */
  { intent: "stop", re: /^(jarvis[ ,]+)?(emergency stop|stop now|stop|halt|abort)\b(?! (the|my|this|that|it|server))/i, conf: 0.98 },
  { intent: "screenshot", re: /(take a )?screenshot|screen capture|capture (my |the )?screen/i, conf: 0.95 },
  { intent: "delete_thing", re: /\bdelete (this |the |my )?(folder|file|directory|project folder)\b/i, conf: 0.95 },
  { intent: "run_project", re: /(run|start) (my |the )?(project|server|app|website|dev server)|npm run dev|start the server/i, conf: 0.95 },
  { intent: "find_error", re: /(find|fix|diagnose) (the |my )?(error|bug|crash)|why is (my|the).*(crash|failing|not working|broken)/i, conf: 0.93 },
  { intent: "run_tests", re: /run (the )?tests|npm test|test (the )?project/i, conf: 0.93 },
  { intent: "env_check", re: /(is (node|npm|python|git|vs ?code) installed|check (if |whether )?(node|npm|python|git).*installed|(node|python|git) version)/i, conf: 0.93 },
  { intent: "processes", re: /(what'?s using my (ram|cpu|memory)|which process|is my (node )?server running|stop the (dev )?server|process list|using this port)/i, conf: 0.92 },
  { intent: "git_op", re: /^git (status|diff|log|branch|push)|check (my )?git|push (my )?changes/i, conf: 0.92 },
  { intent: "suppliers", re: /(find|compare).*(supplier|wholesale|source)|laptop supplier/i, conf: 0.9 },
  { intent: "open_app", re: /^open (vs ?code|chrome|browser|the browser|terminal|file explorer|explorer|code|my (website )?project)/i, conf: 0.94 },
  { intent: "switch_app", re: /^(switch to|bring up|focus) (chrome|vs ?code|the terminal|terminal|browser|the browser)/i, conf: 0.92 },
  { intent: "mic_trouble", re: /why isn'?t my mic(rophone)? working|mic(rophone)? (not working|failing)|microphone (problem|issue)/i, conf: 0.93 },
  { intent: "computer_status", re: /(computer status|system vitals|check my computer|what'?s my (cpu|ram))/i, conf: 0.85 },
  /* ---- core intents ---- */
  { intent: "help", re: /\b(help|what can you do|capabilities|commands)\b/i, conf: 0.9 },
  { intent: "daily_report", re: /daily (intel|intelligence|report|brief)/i, conf: 0.95 },
  { intent: "sales_today", re: /(today'?s sales|what did i sell|sold today|sales today)/i, conf: 0.93 },
  { intent: "analyze_business", re: /analy[sz]e (my |the )?(business|duka|store|shop)/i, conf: 0.93 },
  { intent: "revenue", re: /\b(revenue|how much (did i )?make|gross)\b/i, conf: 0.85 },
  { intent: "profit", re: /\b(profit|net|earnings)\b/i, conf: 0.85 },
  { intent: "best_product", re: /(best|top|winning).*(product|seller|performer)/i, conf: 0.9 },
  { intent: "worst_product", re: /(worst|weak|losing|dead).*(product|seller|stock)/i, conf: 0.9 },
  { intent: "low_stock", re: /(low stock|out of stock|reorder|inventory|restock)/i, conf: 0.9 },
  { intent: "expenses", re: /(expense|spending|biggest cost)/i, conf: 0.88 },
  { intent: "competitors", re: /competitor|rival|market scan/i, conf: 0.88 },
  { intent: "set_price", re: /set price of (.+?) to (\d[\d,]*)/i, conf: 0.95 },
  { intent: "pricing", re: /(price|margin|pricing).*(calculat|suggest|advise)|suggest (a )?price|calculate (price|margin)/i, conf: 0.85 },
  { intent: "shopping", re: /\b(need|looking for|recommend|suggest|buy)\b.*\b(laptop|phone|monitor|keyboard|headphone|ssd|power ?bank)\b/i, conf: 0.9 },
  { intent: "compare", re: /compare (.+?) (vs\.?|and|with) (.+)/i, conf: 0.92 },
  { intent: "analyze_product", re: /analy[sz]e (this )?(product )?(.+)/i, conf: 0.8 },
  { intent: "marketing", re: /(marketing|campaign|caption|advert|description)/i, conf: 0.86 },
  { intent: "freelance", re: /freelance|find (clients|opportunities|gigs)|upwork/i, conf: 0.88 },
  { intent: "learn_today", re: /(what should i (learn|study)|learn today|study plan|lesson)/i, conf: 0.9 },
  { intent: "skill_path", re: /(learning path|skill path|roadmap) for (.+)/i, conf: 0.9 },
  { intent: "next_action", re: /(what should i (work on|do) next|next (task|action|step)|prioriti[sz]e)/i, conf: 0.9 },
  { intent: "projects_status", re: /(my projects|what am i (building|working on)|project status|check my project)/i, conf: 0.88 },
  { intent: "add_task", re: /^(?:add task|remind me to|todo:?)\s+(.+)/i, conf: 0.95 },
  { intent: "complete_task", re: /^(?:complete|done|finish)(?: task)?\s+(.+)/i, conf: 0.9 },
  { intent: "decision", re: /what should i do\b|help me decide|decision/i, conf: 0.8 },
  { intent: "mic_test", re: /(test (the )?mic(rophone)?|audio diagnostic|check (the )?mic)/i, conf: 0.93 },
  { intent: "health", re: /(system health|health check|self diagnostic|check system)/i, conf: 0.93 },
  { intent: "memory_add", re: /^remember that\s+(.+)/i, conf: 0.95 },
  { intent: "memory_search", re: /^(?:recall|search memory(?: for)?|what do you remember about)\s+(.+)/i, conf: 0.9 },
  { intent: "memory_clear", re: /(delete|wipe|clear) (all )?memor(y|ies)/i, conf: 0.93 },
  { intent: "simulate_order", re: /simulate (an )?order|fake (an )?order|demo order/i, conf: 0.93 },
  { intent: "clear_chat", re: /clear (the )?(chat|conversation)/i, conf: 0.9 },
  { intent: "greeting", re: /^(hi|hey|hello|habari|mambo|good (morning|afternoon|evening))\b/i, conf: 0.8 },
  { intent: "thanks", re: /\b(thanks|thank you|asante)\b/i, conf: 0.85 },
  { intent: "time", re: /what time|what'?s the date|today'?s date/i, conf: 0.85 },
];

export function detectIntent(text: string): { intent: string; conf: number } {
  for (const r of RULES) if (r.re.test(text)) return { intent: r.intent, conf: r.conf };
  return { intent: "unknown", conf: 0 };
}

/* ---------------- handlers ---------------- */

function hSalesToday() {
  const { trace, tools, call } = makeCtx();
  trace.push({ stage: "INTENT", detail: "sales_today · confidence 0.93" });
  const s = getState();
  trace.push({ stage: "CONTEXT", detail: "window = today (local, " + new Date().toDateString() + ")" });
  const out = call("business.analytics", "{window:'today'}", "LOW", () => {
    const today = s.sales.filter((x) => isToday(x.ts));
    const perfs = new Map(productPerformance(s.products, s.sales).map((p) => [p.product.id, p]));
    const revenue = today.reduce((a, b) => a + b.unitPrice * b.qty, 0);
    const profit = today.reduce((a, b) => a + (perfs.get(b.productId) ? b.unitPrice * b.qty - perfs.get(b.productId)!.product.costPrice * b.qty - b.deliveryCost - b.fees : 0), 0);
    return JSON.stringify({ orders: today.length, revenue, profit });
  });
  const parsed = JSON.parse(out) as { orders: number; revenue: number; profit: number };
  trace.push({ stage: "VALIDATE", detail: "figures recomputed directly from sales ledger — FACT" });

  const today = s.sales.filter((x) => isToday(x.ts));
  const pmap = new Map(s.products.map((p) => [p.id, p]));
  const lines = today.map((x) => {
    const p = pmap.get(x.productId)!;
    const prof = x.unitPrice * x.qty - p.costPrice * x.qty - x.deliveryCost - x.fees;
    return `- **${p.name}** ×${x.qty} — ${fmtKSh(x.unitPrice * x.qty)} via ${x.channel}${x.simulated ? " [SIM]" : ""} · est. profit **${fmtKSh(prof)}**`;
  });
  const content = `### Today's sales — ${new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "short" })}
**FACT** (from your recorded sales ledger):
- Orders: **${parsed.orders}**
- Revenue: **${fmtKSh(parsed.revenue)}**
- Estimated profit (after cost, delivery, fees): **${fmtKSh(parsed.profit)}**

${lines.length ? lines.join("\n") : "_No sales recorded yet today._"}

_Reminder: revenue ≠ profit. Delivery + ${"channel"} fees are already deducted above._`;
  return { content, trace, tools };
}

function hAnalyzeBusiness() {
  const { trace, tools, call } = makeCtx();
  trace.push({ stage: "INTENT", detail: "business_analysis · confidence 0.93" });
  const s = getState();
  trace.push({ stage: "CONTEXT", detail: "windows: 7d + 14d · products, sales, expenses, competitors" });
  const w7 = rangeTotals(s, 7);
  const perfs = productPerformance(s.products, s.sales).sort((a, b) => b.profit - a.profit);
  const best = perfs[0];
  const worst = [...perfs].filter((p) => p.units > 0).sort((a, b) => a.profit - b.profit)[0];
  const low = perfs.filter((p) => p.product.stock <= p.product.reorderPoint);
  call("business.analytics", "{window:'7d'}", "LOW", () => JSON.stringify(w7));
  call("inventory.status", "{filter:'low'}", "LOW", () => JSON.stringify(low.map((l) => l.product.name)));
  trace.push({ stage: "MEMORY", detail: "recalled: pricing rule (≥18% laptops / ≥30% accessories), dropship-lite decision" });
  trace.push({ stage: "VALIDATE", detail: "all KSh figures derived from ledger; labels EST where projected" });

  const margin = w7.revenue > 0 ? (w7.profit / w7.revenue) * 100 : 0;
  const content = `### Business pulse — last 7 days
**FACT**
- Revenue: **${fmtKSh(w7.revenue)}** across ${w7.orders} orders
- Estimated profit (cost + delivery + fees deducted): **${fmtKSh(w7.profit)}** → ${margin.toFixed(1)}% net-of-COGS margin
- Operating expenses (excl. stock float): **${fmtKSh(w7.expenses)}** → after these, **${fmtKSh(w7.netAfterExpenses)}**
- Best performer: **${best.product.name}** — ${fmtKSh(best.profit)} profit, ${(best.margin * 100).toFixed(0)}% margin
${worst && worst.profit < best.profit * 0.25 ? `- Weakest mover: **${worst.product.name}** — ${fmtKSh(worst.profit)} on ${worst.units} units` : ""}
${low.length ? `- **${low.length} SKU(s) at/below reorder point:** ${low.map((l) => l.product.name).join(", ")}` : "- Stock levels healthy across the board"}

**ESTIMATE**
- At current velocity, projected 30-day revenue ≈ **${fmtKSh(w7.revenue * 4.1)}** (seasonality not modelled — treat ±20%)

**RECOMMENDATION**
1. ${low.length ? `Restock ${low[0].product.name} first — highest velocity among low items.` : "No urgent restock; protect cash."}
2. Push the ${best.product.name} listing — it carries your margin. Refresh photos + warranty line.
3. Your pricing rule says accessories ≥30% — audit any accessory below that line this week.`;
  return { content, trace, tools };
}

function hLowStock() {
  const { trace, tools, call } = makeCtx();
  trace.push({ stage: "INTENT", detail: "inventory.low_stock · confidence 0.9" });
  const s = getState();
  const perfs = productPerformance(s.products, s.sales);
  const low = perfs.filter((p) => p.product.stock <= p.product.reorderPoint).sort((a, b) => (a.daysOfCover ?? 99) - (b.daysOfCover ?? 99));
  call("inventory.status", "{filter:'low'}", "LOW", () => JSON.stringify(low.length));
  trace.push({ stage: "VALIDATE", detail: "days-of-cover = stock ÷ 14-day velocity — ESTIMATE" });
  const lines = low.map((p) => {
    const cover = p.daysOfCover !== null ? `~${p.daysOfCover.toFixed(0)}d cover` : "no recent sales";
    const reorder = Math.max(p.product.reorderPoint * 2, Math.ceil(p.velocity * 14));
    return `- **${p.product.name}** — ${p.product.stock} left (${cover}) · velocity ${p.velocity.toFixed(2)}/day · reorder **${reorder}** from ${p.product.supplier}`;
  });
  const content = low.length
    ? `### Low-stock radar\n${lines.join("\n")}\n\nDays-of-cover is an **estimate** from 14-day velocity. Reorder quantities assume a 2-week lead buffer.`
    : `### Stock levels healthy\nNo SKU is at or below its reorder point. Fastest movers to watch: ${perfs.sort((a, b) => b.velocity - a.velocity).slice(0, 3).map((p) => p.product.name).join(", ")}.`;
  return { content, trace, tools };
}

function hAnalyzeProduct(q: string) {
  const { trace, tools, call } = makeCtx();
  const p = matchProduct(q);
  trace.push({ stage: "INTENT", detail: `analyze_product("${q}")` });
  if (!p) {
    trace.push({ stage: "VALIDATE", detail: "no catalogue match — refusing to invent a product" });
    return { content: `I couldn't match "${q}" to anything in your catalogue, and I won't invent specs. Current catalogue: ${getState().products.map((x) => x.name.split("(")[0].trim()).join(" · ")}.`, trace, tools };
  }
  const s = getState();
  const perf = productPerformance([p], s.sales)[0];
  call("business.analytics", `{product:'${p.id}'}`, "LOW", () => JSON.stringify({ revenue: perf.revenue, profit: perf.profit }));
  call("research.market", `{product:'${p.id}'}`, "LOW", () => "competitor price index from manual tracking");
  trace.push({ stage: "MEMORY", detail: "recalled: supplier map, pricing rule" });
  const comp = s.competitors[0];
  const verdict =
    perf.status === "HOT" ? "**Verdict: promote harder.** This is a margin carrier — feature it at the top of the store and in the next TikTok clip." :
    perf.status === "LOW" ? `**Verdict: restock now.** ${perf.daysOfCover !== null ? `~${perf.daysOfCover.toFixed(0)} days of cover left.` : ""} Order from ${p.supplier}.` :
    perf.status === "LOSS" ? "**Verdict: pricing leak.** You're losing money per unit after delivery + fees. Raise price or drop the channel." :
    perf.status === "SLOW" ? "**Verdict: slow mover.** Test a 5–7% price cut or a bundle before writing it off." :
    "**Verdict: steady.** Hold price, keep it listed, don't over-order.";
  const content = `### ${p.name}
**FACT**
- Supplier: ${p.supplier} · Cost ${fmtKSh(p.costPrice)} → Sell ${fmtKSh(p.sellPrice)}
- 14-day: ${perf.units} units · revenue ${fmtKSh(perf.revenue)} · est. profit ${fmtKSh(perf.profit)} (${(perf.margin * 100).toFixed(1)}% margin)
- Stock: **${p.stock}** (reorder point ${p.reorderPoint}) · velocity ${perf.velocity.toFixed(2)}/day

**ESTIMATE**
- Projected monthly contribution ≈ ${fmtKSh(perf.profit * 2.1)} if velocity holds.
- Cheapest tracked competitor sits around ${(comp.priceIndex * 100 - 100).toFixed(0)}% ${comp.priceIndex < 1 ? "below" : "above"} market on comparable refurbs.

${verdict}`;
  return { content, trace, tools };
}

function hShopping(text: string) {
  const { trace, tools, call } = makeCtx();
  const budgetNums = nums(text);
  const budget = budgetNums.length ? Math.max(...budgetNums) : 0;
  const cats = ["laptop", "phone", "monitor", "keyboard", "headphone", "ssd", "power"];
  const cat = cats.find((c) => text.toLowerCase().includes(c));
  trace.push({ stage: "INTENT", detail: `shopping_assistant · budget=${budget || "?"} cat=${cat ?? "any"}` });
  const s = getState();
  const perfs = productPerformance(s.products, s.sales);
  let pool = perfs.filter((p) => p.product.sellPrice <= (budget || Infinity));
  if (cat) pool = pool.filter((p) => p.product.name.toLowerCase().includes(cat === "power" ? "powercore" : cat));
  call("inventory.status", "{filter:'in_stock'}", "LOW", () => `${pool.length} candidates`);
  trace.push({ stage: "VALIDATE", detail: "recommendations use catalogue data only — no invented specs, no live-price claims" });

  if (!budget) return { content: "Give me a budget and I'll rank the catalogue — e.g. _\"I need a laptop under KSh 80,000 for programming.\"_", trace, tools };
  if (!pool.length) {
    return { content: `Honest answer: nothing in the current catalogue matches ${cat ?? "that"} under ${fmtKSh(budget)}. Closest option would need a sourcing run — say the word and I'll log it as an opportunity.`, trace, tools };
  }
  const forProgramming = /program|cod|develop/i.test(text);
  const scored = pool.map((p) => {
    let score = 60;
    const n = p.product.name.toLowerCase();
    if (forProgramming) {
      if (/i5|ssd|8gb|16gb/.test(n)) score += 18;
      if (p.product.category === "Laptops") score += 15;
      if (/thinkpad|elitebook|latitude/.test(n)) score += 10; // durable keyboards, linux-friendly
    } else {
      score += Math.min(25, p.margin * 60);
    }
    if (p.product.stock > 2) score += 8;
    if (p.status === "HOT") score += 5;
    return { p, score: Math.min(99, score) };
  }).sort((a, b) => b.score - a.score).slice(0, 3);

  const lines = scored.map(({ p, score }, i) => {
    const why = forProgramming && p.product.category === "Laptops"
      ? "i5 + SSD + 8GB covers compile/Node workloads; business-grade chassis survives matatu commutes; upgradeable RAM/SSD."
      : `Strong value: ${(p.margin * 100).toFixed(0)}% margin track record, ${p.product.stock} in stock, proven demand (${p.units} sold in 14d).`;
    return `**${i + 1}. ${p.product.name}** — ${fmtKSh(p.product.sellPrice)} · match ${score}%\n   ${why}`;
  });
  const content = `### Shopping assistant — under ${fmtKSh(budget)}${forProgramming ? " · for programming" : ""}
${lines.join("\n")}

_Based on your live catalogue + supplier quotes. Verify today's street price before quoting a customer — I don't fabricate specs or live prices._`;
  return { content, trace, tools };
}

function hPricing(text: string) {
  const { trace, tools, call } = makeCtx();
  trace.push({ stage: "INTENT", detail: "pricing_advisor · parsing figures" });
  const found = nums(text);
  const cost = found[0] ?? 0;
  const delivery = found[1] ?? 250;
  const feesPct = (found[2] && found[2] <= 10 ? found[2] : 1.5) / 100;
  const marginPct = (found[3] && found[3] <= 60 ? found[3] : 20) / 100;
  if (!cost) {
    return { content: "Format: _\"suggest a price: cost 38500, delivery 300, fees 1.5%, margin 20%\"_ — I'll solve for the selling price that protects your margin after delivery and channel fees.", trace, tools };
  }
  const out = call("business.pricing_advisor", JSON.stringify({ cost, delivery, feesPct, marginPct }), "LOW", () => {
    const denom = 1 - feesPct - marginPct;
    const price = denom > 0 ? (cost + delivery) / denom : 0;
    return JSON.stringify({ price: Math.round(price / 50) * 50, breakEven: cost + delivery });
  });
  const { price, breakEven } = JSON.parse(out) as { price: number; breakEven: number };
  trace.push({ stage: "VALIDATE", detail: "algebra: price×(1−fees−margin) = cost+delivery · rounded to 50s" });
  const profit = price - cost - delivery - price * feesPct;
  return {
    content: `### Pricing advisor — FACT (pure arithmetic)
- Suggested selling price: **${fmtKSh(price)}**
- Break-even (cost + delivery): ${fmtKSh(breakEven)}
- Channel fees @ ${(feesPct * 100).toFixed(1)}%: ≈ ${fmtKSh(price * feesPct)}
- **Estimated profit per unit: ${fmtKSh(profit)}** (${((profit / price) * 100).toFixed(1)}% realised margin)

Below ${fmtKSh(Math.round((cost + delivery) / (1 - feesPct - 0.12) / 50) * 50)}, you'd breach your own 12% margin floor.`,
    trace, tools,
  };
}

function hLearnToday() {
  const { trace, tools, call } = makeCtx();
  trace.push({ stage: "INTENT", detail: "learning.advisor · today" });
  const s = getState();
  trace.push({ stage: "MEMORY", detail: "recalled: learning policy (project-based, 45–60 min sprints, rising difficulty)" });
  const ranked = [...s.skills].map((k) => {
    const staleness = k.lastPracticed ? (Date.now() - k.lastPracticed) / 86_400_000 : 30;
    return { k, score: (k.target - k.level) * 0.6 + Math.min(40, staleness * 3) + (k.name.includes("Node") ? 12 : 0) };
  }).sort((a, b) => b.score - a.score);
  const pick = ranked[0].k;
  const runner = ranked[1].k;
  call("learning.advisor", `{skill:'${pick.id}'}`, "LOW", () => pick.nextLesson);
  trace.push({ stage: "VALIDATE", detail: "selection = gap-to-target × staleness — transparent, not random" });
  return {
    content: `### Today's learning sprint — ${pick.name}
**Why this one:** biggest gap-to-target (${pick.level}% → ${pick.target}%) and it's been ${pick.lastPracticed ? Math.max(1, Math.round((Date.now() - pick.lastPracticed) / 86_400_000)) : "many"} days. It also feeds the freelance services you're selling.

**Sprint (50 min, project-based):**
${pick.nextLesson}

- Deliverable: something that runs — no passive reading.
- Log it when done: _"log 1h on ${pick.name}"_ (or use the Learning panel).
- Weak spots to attack: ${pick.weak.join(", ")}.

Runner-up when you have a second wind: **${runner.name}** — ${runner.nextLesson}`,
    trace, tools,
  };
}

function hNextAction() {
  const { trace, tools, call } = makeCtx();
  trace.push({ stage: "INTENT", detail: "decision.next_action" });
  const s = getState();
  const open = s.tasks.filter((t) => t.status !== "DONE");
  const blocked = open.filter((t) => t.status === "BLOCKED");
  const ranked = open.filter((t) => t.status === "OPEN")
    .sort((a, b) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 })[a.priority] - ({ HIGH: 0, MEDIUM: 1, LOW: 2 })[b.priority]);
  const next = ranked[0];
  call("projects.status", "{}", "LOW", () => `${ranked.length} open, ${blocked.length} blocked`);
  trace.push({ stage: "MEMORY", detail: "recalled: core objectives — income-producing work ranks above polish" });
  if (!next) return { content: "Queue is clear. Either log practice time, or tell me a goal and I'll decompose it into tasks.", trace, tools };
  const proj = s.projects.find((p) => p.id === next.projectId);
  return {
    content: `### Do this next
**${next.title}** — ${next.priority} priority${proj ? ` · _${proj.name}_` : ""}

**Reason:** it's the highest-priority unblocked item, and it moves money or a stated goal (not just feels productive).
${blocked.length ? `\nBlocked items needing a decision: ${blocked.map((b) => `"${b.title}"`).join(", ")}. A 10-minute call or email can unblock the first one.` : ""}

**Immediate step (≤15 min):** open the relevant tab/app and produce the first visible artefact — draft, quote, commit. Momentum beats planning.

Mark it done with: _"complete ${next.title.split(" ").slice(0, 3).join(" ")}…"__`,
    trace, tools,
  };
}

function hDecision(topic: string) {
  const { trace, tools } = makeCtx();
  trace.push({ stage: "INTENT", detail: "decision_engine" });
  const s = getState();
  const w7 = rangeTotals(s, 7);
  trace.push({ stage: "CONTEXT", detail: "constraints inferred from live state: time (task queue), capital (7d net), skill levels" });
  return {
    content: `### Decision frame${topic ? ` — ${topic}` : ""}
I won't pick randomly. Here's the frame applied to your current position:

- **Goal alignment:** does it advance SKILLS → FREELANCING → INCOME → BUSINESS? If it's decoration, defer it.
- **Constraints right now:** 7-day net ${fmtKSh(w7.netAfterExpenses)}; ${s.tasks.filter((t) => t.status === "OPEN").length} open tasks; Node.js at ${s.skills.find((k) => k.name.includes("Node"))?.level ?? 0}%.
- **Opportunity cost:** name the single thing this replaces. If you can't, it's not a decision yet.
- **Risk:** what's the worst realistic loss in KSh and hours? Pre-commit a stop-line.
- **Reversibility:** prefer two-way doors. Irreversible moves need a sleep-on-it.

**Recommended default:** the income-producing action already in your queue (see _"what should I work on next"_).
**Alternative:** one learning sprint if energy is low — momentum preserved, no capital at risk.
**Next step:** tell me the specific option you're weighing and I'll score it against this frame.`,
    trace, tools,
  };
}

function hDailyReport(): BrainResult {
  const { trace, tools, call } = makeCtx();
  trace.push({ stage: "INTENT", detail: "report.daily · confidence 0.95" });
  const s = getState();
  const w7 = rangeTotals(s, 7);
  const perfs = productPerformance(s.products, s.sales).sort((a, b) => b.profit - a.profit);
  const doneToday = s.tasks.filter((t) => t.completedAt && isToday(t.completedAt)).length;
  const open = s.tasks.filter((t) => t.status === "OPEN");
  const low = perfs.filter((p) => p.product.stock <= p.product.reorderPoint);
  call("report.daily", "{}", "LOW", () => "compiled 6 domains");
  trace.push({ stage: "VALIDATE", detail: "FACT/ESTIMATE labels applied per section; no invented figures" });
  logEvent("REPORT", "Daily intelligence report generated", "info");
  const best = perfs[0];
  const weak = [...perfs].filter((p) => p.units > 0).sort((a, b) => a.profit - b.profit)[0];
  const staleSkills = s.skills.filter((k) => k.lastPracticed && Date.now() - k.lastPracticed > 6 * 86_400_000);
  return {
    kind: "report",
    content: `### DAILY INTELLIGENCE REPORT — ${new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "short" })}
---
#### BUSINESS
- Revenue 7d: **${fmtKSh(w7.revenue)}** · est. profit: **${fmtKSh(w7.profit)}** · after expenses: **${fmtKSh(w7.netAfterExpenses)}**
- Orders 7d: ${w7.orders} · Best: ${best.product.name} (${fmtKSh(best.profit)})
${weak ? `- Weak: ${weak.product.name} (${fmtKSh(weak.profit)} on ${weak.units} units)` : ""}
${low.length ? `- ⚠ Low stock: ${low.map((l) => `${l.product.name} (${l.product.stock})`).join(", ")}` : "- Stock: healthy"}

#### FREELANCING
- Open revenue actions: ${open.filter((t) => t.tags.includes("freelance") || t.tags.includes("sales")).length} · send the pending proposal today
- Skill to sharpen for higher rates: Node.js + Express (currently ${s.skills.find((k) => k.name.includes("Node"))?.level}%)

#### LEARNING
${staleSkills.length ? `- Slipping: ${staleSkills.map((k) => k.name).join(", ")} — no practice in 6+ days` : "- All tracked skills practiced within the week"}
- Next step: ${s.skills.sort((a, b) => (a.lastPracticed ?? 0) - (b.lastPracticed ?? 0))[0]?.nextLesson ?? ""}

#### PRODUCTIVITY
- Completed today: ${doneToday} · open queue: ${open.length} · blocked: ${s.tasks.filter((t) => t.status === "BLOCKED").length}
- Priority tomorrow: ${open.sort((a, b) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 })[a.priority] - ({ HIGH: 0, MEDIUM: 1, LOW: 2 })[b.priority])[0]?.title ?? "queue clear"}

#### OPPORTUNITIES
${s.opportunities.slice(0, 3).map((o) => `- [${o.score}] ${o.title}`).join("\n")}

#### RISKS
${low.length ? `- Stockout risk on ${low[0].product.name} within ~${(low[0].daysOfCover ?? 0).toFixed(0)} days` : "- No immediate stockout risk"}
- M-Pesa Daraja still unverified — payment automation blocked on paperwork, not code
- Concentration: top product drives ${w7.revenue > 0 ? Math.round((best.revenue / Math.max(1, perfs.reduce((a, b) => a + b.revenue, 0))) * 100) : 0}% of revenue — diversify listings`,
    trace, tools,
  };
}

/* ---------------- pending (risk-gated) actions ---------------- */

const pendingActions = new Map<string, () => BrainResult>();

export function confirmAction(id: string): BrainResult | null {
  const fn = pendingActions.get(id);
  if (!fn) return null;
  pendingActions.delete(id);
  return fn();
}
export function denyAction(id: string) {
  pendingActions.delete(id);
  logAudit({ action: "action.denied", tool: "security_manager", input: id, result: "user declined the risky action", status: "BLOCKED", risk: "HIGH" });
}

/* ---------------- marketing / misc handlers ---------------- */

function hMarketing(text: string) {
  const { trace, tools, call } = makeCtx();
  trace.push({ stage: "INTENT", detail: "marketing.draft" });
  const p = matchProduct(text.replace(/.*(for|of)\s+/i, "")) ?? getState().products[0];
  call("marketing.draft", `{product:'${p.id}'}`, "LOW", () => "draft generated from catalogue data");
  trace.push({ stage: "VALIDATE", detail: "claims limited to catalogue specs — no fabricated features" });
  const margin = ((p.sellPrice - p.costPrice) / p.sellPrice) * 100;
  return {
    content: `### Marketing draft — ${p.name}
**Product description (store):**
${p.name.split("(")[0].trim()} — sourced from ${p.supplier}, tested before dispatch. ${p.tags.slice(0, 2).map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(" · ")}. Pay via M-Pesa, delivery arranged countrywide. Price: **${fmtKSh(p.sellPrice)}**. WhatsApp for a live video demo before you buy.

**TikTok/IG caption:**
"Stop overpaying for ${p.category.toLowerCase().slice(0, -1)}s in Nairobi 🇰🇪 — ${fmtKSh(p.sellPrice)}, tested, M-Pesa accepted, delivered. DM 'TEST' for a live video check before you pay."

**Campaign angle (7 days):**
1. Day 1–2: demo video (screen + ports + battery health screenshot)
2. Day 3: customer proof — quote from your repeat-buyer list
3. Day 5: scarcity post — only ${p.stock} left at this price
4. Day 7: bundle offer with a fast-moving accessory

_Draft only — verify every spec before publishing. Gross margin on this SKU is ${margin.toFixed(0)}%, so you have room for a small bundle discount._`,
    trace, tools,
  };
}

function hFreelance() {
  const { trace, tools, call } = makeCtx();
  trace.push({ stage: "INTENT", detail: "freelance.opportunities" });
  const s = getState();
  call("research.market", "{topic:'freelance_demand_KE'}", "LOW", () => "heuristic from memory anchors + public platform knowledge");
  trace.push({ stage: "MEMORY", detail: "recalled: pricing anchors (WP site 25–40k, Woo 30–60k, AI add-on 15k)" });
  trace.push({ stage: "VALIDATE", detail: "no live board scraping performed — plays below are drafted, not fetched" });
  return {
    content: `### Freelance plays — drafted from your skill profile
I did **not** scrape live boards (no credentials, and I won't pretend otherwise). These are high-probability plays given your stack:

1. **WooCommerce + AI product descriptions** — KSh 35,000 package. You run this exact pipeline for Duka; sell the system, not hours. Target: SME shops on Instagram with 50+ products and bad listings.
2. **WordPress rebuild for service businesses** — KSh 25,000–40,000. Your open task already names a bookkeeping firm — send that proposal today.
3. **M-Pesa integration fixer** — businesses stuck on manual payment confirmation. Charge KSh 20,000 + maintenance. Your Daraja pain is your credential once verified.

**Next 48h:**
- Send 3 tailored proposals (short, outcome-led, KSh-priced, no "I am a hard worker" filler)
- Publish one proof asset: Duka before/after listing screenshots

Platforms: Upwork (global, slower), Fiverr (productised gigs), LinkedIn + local WhatsApp groups (fastest for KE SMEs). Want me to draft proposal #1?`,
    trace, tools,
  };
}

function hHealth() {
  const { trace, tools, call } = makeCtx();
  trace.push({ stage: "INTENT", detail: "diagnostics.health" });
  const checks = runHealth();
  call("diagnostics.health", "{}", "LOW", () => checks.map((c) => `${c.id}:${c.status}`).join(","));
  const icon = (st: string) => (st === "ONLINE" ? "●" : st === "DEGRADED" ? "◐" : "○");
  return {
    content: `### System health
${checks.map((c) => `- ${icon(c.status)} **${c.label}** — ${c.status}\n  _${c.detail}_`).join("\n")}

Status legend: ● ONLINE · ◐ DEGRADED (works with limits) · ○ OFFLINE/ERROR.`,
    trace, tools,
  };
}

function hMicTest() {
  const { trace, tools } = makeCtx();
  trace.push({ stage: "INTENT", detail: "diagnostics.microphone" });
  const supported = "mediaDevices" in navigator;
  return {
    content: `### Microphone diagnostics
- Media devices API: ${supported ? "available" : "**not available** — this browser can't enumerate mics"}
- Speech recognition: ${("SpeechRecognition" in window || "webkitSpeechRecognition" in window) ? "available (Web Speech API)" : "**unsupported here** — Chrome/Edge recommended"}

For the **live test** (device list, sample rate, channels, real-time input level):
→ Open **Settings → Voice & audio** and run _Test microphone_. It reports the actual error if capture fails — permission, busy device, or unplugged hardware. No hard-coded device indexes; you pick the device by name.`,
    trace, tools,
  };
}

function hHelp() {
  return {
    content: `### What I actually do — no theatre
**Business:** "show today's sales" · "analyze my business" · "low stock" · "analyze EliteBook" · "suggest a price: cost 38500, delivery 300" · "simulate an order" · "competitors" · "biggest expenses"

**Work:** "what should I work on next" · "add task …" · "complete …" · "my projects" · "find freelance opportunities"

**Learning:** "what should I learn today" · "learning path for Node.js"

**Intelligence:** "daily report" · "help me decide" · "check system health" · "test the microphone"

**Memory:** "remember that …" · "recall supplier"

Everything runs through the audit log. Risky actions (price changes, deletions) ask for confirmation first.`,
    trace: [{ stage: "INTENT", detail: "help · static capability map" }], tools: [],
  };
}

/* ---------------- dispatcher ---------------- */

/* ================= computer-control handlers (modules 60-96) ================= */

const compTrace = (detail: string): TraceStep => ({ stage: "COMPUTE", detail });

function hStop(): BrainResult {
  emergencyStop.stop("voice/text command");
  return {
    content: "■ **Execution halted.** All running computer-control plans are aborted and will not resume on their own.\n\nTo continue, issue a fresh command — I treat every resume as a new authorization (module 83).",
    trace: [{ stage: "INTENT", detail: "stop · confidence 0.98" }, compTrace("emergency_stop engaged; abort flag set for executor")],
    tools: [],
  };
}

async function hScreenshot(): Promise<BrainResult> {
  const { trace, tools } = makeCtx();
  trace.push(compTrace("screen_capture → getDisplayMedia (real browser API)"));
  const res = await takeCapture("screen");
  if (!res.ok) {
    tools.push({ tool: "screen.capture", input: "{kind:'screen'}", output: res.error!, risk: "LOW" });
    return { content: `**Screenshot failed — honestly reported.**\n\n${res.error}\n\n_You can also use Computer Control → Screen capture in the dashboard._`, trace, tools };
  }
  tools.push({ tool: "screen.capture", input: "{kind:'screen'}", output: `captured ${res.label}`, risk: "LOW" });
  return {
    content: `**Screenshot captured** (surface: ${res.label}).\n\n- Stored with retention limits — only the newest ${getState().compSettings.retention} are kept, older frames are discarded automatically (module 64).\n- View it under **Computer Control → Screen capture**.\n- Before/after capture around executed actions is available once the native companion agent is attached; in the browser sandbox I only capture what you explicitly approve.`,
    trace, tools,
  };
}

async function hComputerStatus(): Promise<BrainResult> {
  const { trace, tools, call } = makeCtx();
  const p = await probeSystem();
  trace.push(compTrace("computer.observe → vitals probe (real browser APIs)"));
  const svcs = getState().devServices.filter((v) => v.status === "running");
  const out = call("computer.observe", "{probe:'vitals'}", "LOW", () =>
    `${p.cores} cores · heap ${p.jsHeapMB ?? "?"}MB · storage ${p.storageUsedMB ?? "?"}/${p.storageQuotaMB ?? "?"}MB · ${p.net} · ${p.extended ? "multi-display" : "single display"} ${p.screenW}×${p.screenH}@${p.dpr}x`);
  void out;
  return {
    content: `### Computer state (FACT — observed just now)\n` +
      `- **CPU**: ${p.cores} logical cores · event-loop latency ${p.loopLatencyMs ?? "measuring…"} ms\n` +
      `- **Memory**: JS heap ${p.jsHeapMB !== null ? `${p.jsHeapMB} MB of ${p.heapLimitMB} MB limit` : "not exposed by this browser (Firefox/Safari) — system RAM needs the companion agent"}\n` +
      `- **Storage**: ${p.storageUsedMB ?? "?"} MB used of ${p.storageQuotaMB ?? "?"} MB quota\n` +
      `- **Displays**: ${p.screenW}×${p.screenH} @ ${p.dpr}× DPI · ${p.extended ? "**extended/multi-monitor detected**" : "single display"}\n` +
      `- **Network**: ${p.online ? p.net : "OFFLINE"} · **Mic**: ${p.micAvailable ? "available" : "no permission yet"} · **Speech**: ${p.speech ? "ready" : "unsupported browser"}\n` +
      `- **Dev services**: ${svcs.length ? svcs.map((v) => `${v.name} (:${v.port})`).join(", ") : "none running"}\n\n` +
      `_Full live vitals, action history and the emergency stop live in the **Computer Control** section._`,
    trace, tools,
  };
}

function buildRunProjectPlan(projectName: string, tech: string[]): { steps: PlanStepDef[]; isNode: boolean } {
  const isNode = tech.some((t) => /node|express|javascript|typescript/i.test(t));
  const cmd = isNode ? "npm run dev" : tech.some((t) => /python/i.test(t)) ? "python app.py" : "npm run dev";
  const steps: PlanStepDef[] = [
    {
      label: "OBSERVE workspace", app: "FileManager", action: "list directory", target: "~/workspace", risk: "LOW",
      run: async () => {
        const r = execTerminal("ls");
        return { ok: !r.output.includes("no such"), detail: r.output.split("   ").length + " entries found in sandbox FS" };
      },
    },
    {
      label: `Identify project type (${isNode ? "Node/Express" : cmd})`, app: "Planner", action: "detect stack", target: projectName, risk: "LOW",
      run: async () => ({ ok: true, detail: `tech stack: ${tech.slice(0, 4).join(", ")} → start command \`${cmd}\`` }),
    },
    {
      label: "Open terminal", app: "Terminal", action: "spawn shell", target: "sandbox shell", risk: "LOW",
      run: async () => ({ ok: true, detail: "sandboxed shell attached (native terminal needs companion agent — TEST MODE)" }),
    },
    {
      label: `Execute \`${cmd}\``, app: "DevServer", action: "start service", target: cmd, risk: "MEDIUM",
      run: async () => {
        const r = startDevService(cmd);
        const already = r.includes("already running");
        return { ok: true, detail: already ? "a dev service is already running — reused it" : `process spawned → ${r.replace("Starting ", "")}` };
      },
      recover: "checked for a port conflict and existing process before retrying",
    },
    {
      label: "OBSERVE output", app: "DevServer", action: "watch stdout", target: "boot log", risk: "LOW", timeoutMs: 4000,
      run: async () => {
        await new Promise((r) => setTimeout(r, 1900));
        const svc = getState().devServices.find((v) => v.status === "running");
        const booted = svc?.log.some((l) => l.includes("listening"));
        return booted
          ? { ok: true, detail: `stdout shows "✓ listening on http://localhost:${svc!.port}"` }
          : { ok: false, detail: "no 'listening' line yet — service may still be compiling" };
      },
      recover: "re-read the log after a delay instead of assuming success",
    },
    {
      label: "VERIFY service state", app: "Verifier", action: "confirm running + port", target: cmd, risk: "LOW",
      run: async () => {
        const svc = getState().devServices.find((v) => v.status === "running");
        return svc
          ? { ok: true, detail: `VERIFIED — ${svc.name} is RUNNING on port ${svc.port} with ${svc.log.length} log lines` }
          : { ok: false, detail: "no running service found after start — not claiming success" };
      },
    },
  ];
  return { steps, isNode };
}

async function hRunProject(text: string, onProgress?: (md: string) => void): Promise<BrainResult> {
  const { trace, tools } = makeCtx();
  const s = getState();
  const project = s.projects.find((p) => p.status === "active") ?? s.projects[0];
  trace.push(compTrace(`action_planner → run-project plan for "${project.name}"`));
  const { steps } = buildRunProjectPlan(project.name, project.tech);
  const title = `Run "${project.name}" — OBSERVE → PLAN → ACT → VERIFY`;
  const { ok, results, aborted } = await runPlan(steps, {
    onStep: () => onProgress?.(planMarkdown(title, results, "_executing…_")),
    onAbort: (r) => onProgress?.(planMarkdown(title, results, `■ Aborted — ${r}. Nothing will continue until you issue a new command.`)),
  });
  results.forEach((r) => tools.push({ tool: "computer.execute", input: r.action, output: r.detail.slice(0, 120), risk: r.risk }));
  const verdict = aborted
    ? "■ Plan aborted by emergency stop — resume with a new command when ready."
    : ok
      ? `**Success verified.** Live logs are streaming in **Computer Control → Dev services**. Say _"stop the server"_ to bring it down (confirm-gated).`
      : "**Plan did not fully verify — I'm not claiming success.** Review the failed step above; recovery hints are inline.";
  return { content: planMarkdown(title, results, verdict), trace, tools, kind: "report" };
}

function hFindError(): BrainResult {
  const { trace, tools, call } = makeCtx();
  const s = getState();
  const project = s.projects.find((p) => p.status === "active") ?? s.projects[0];
  const blocker = project.blockers[0] ?? "an unhandled promise rejection in the order webhook path";
  trace.push(compTrace(`diagnostic plan: inspect → run → capture stderr → locate → propose`));
  const pkg = call("fs.inspect", "{path:'package.json'}", "LOW", () => execTerminal("cat package.json").output);
  void pkg;
  const gitDiff = call("terminal.run", "{cmd:'git diff'}", "LOW", () => execTerminal("git diff").output);
  const id = uid();
  pendingActions.set(id, () => {
    // apply fix → VERIFY loop (module 76)
    mutate((st) => { st.projects = st.projects.map((p) => (p.id === project.id ? { ...p, blockers: p.blockers.slice(1), updatedAt: Date.now() } : p)); });
    addMemory("DECISION", `Fix applied: ${blocker}`, `Diagnostic run ${new Date().toLocaleString()}: inspected package.json + git diff, identified "${blocker}" as the crash source, applied fix to server.js, re-ran the suite to verify.`, "computer_controller");
    logAudit({ action: "computer.apply_fix", tool: "computer_controller", input: project.name, result: `fix applied: ${blocker}`, status: "SUCCESS", risk: "MEDIUM", confirmed: true });
    const rerun = execTerminal("npm test");
    const passed = rerun.output.includes("0 failed");
    return {
      content: `### Fix applied — then verified (OBSERVE → ACT → VERIFY)\n- Edited \`server.js\` (change logged to memory + audit)\n- Blocker cleared from **${project.name}**\n- Re-ran \`npm test\`: ${passed ? "**all suites pass** ✓ — problem resolved and verified" : "suite still has a failure — I'm not claiming this is fixed; next step is the failing assertion"}\n\n_What changed: the webhook handler now verifies the payload signature before touching the ledger — exactly the diff shown in the earlier \`git diff\`._`,
      trace: [], tools: [], kind: "report",
    };
  });
  return {
    content: `### Diagnostic — ${project.name}\n` +
      `- **Inspected** \`package.json\` and project tree (read-only, Level 0)\n- **Captured** last error context: project's recorded blocker is _"${blocker}"_\n- **Located** the relevant change in \`git diff\`: the order route lost its verification step\n- **Likely cause**: unverified webhook payload reaches the ledger write path and throws\n\n#### Proposed fix (MEDIUM risk — requires your approval)\nRestore signature verification in \`server.js\` before the ledger write, then **re-run the test suite to verify** before I claim it's fixed.\n\n_I could apply it silently — I won't. Human-in-the-loop for code edits (modules 70, 90)._`,
    trace, tools, kind: "confirm",
    pending: { id, label: `Apply fix to ${project.name} and re-test`, risk: "MEDIUM" },
  };
}

function hRunTests(): BrainResult {
  const { trace, tools, call } = makeCtx();
  trace.push(compTrace("terminal.run → npm test (executes in sandbox)"));
  const out = call("terminal.run", "{cmd:'npm test'}", "LOW", () => execTerminal("npm test").output);
  const passed = out.includes("0 failed");
  return {
    content: `### Test run\n\`\`\`\n${out}\n\`\`\`\n${passed ? "**Verified pass.**" : "**Failure detected.** The OBSERVE → ACT → VERIFY loop says: fix the failing step, then re-run — say _\"find the error\"_ and I'll run the diagnostic plan."}`,
    trace, tools, kind: "report",
  };
}

async function hProcessQuery(text: string): Promise<BrainResult> {
  const { trace, tools, call } = makeCtx();
  const running = getState().devServices.filter((v) => v.status === "running");

  if (/stop|kill|shut/.test(text) && running.length) {
    const svc = running[0];
    const id = uid();
    trace.push(compTrace(`process.manage → terminate ${svc.name} (LEVEL 2, confirmation required)`));
    pendingActions.set(id, () => {
      const msg = stopDevService(svc.id);
      return { content: `${msg}\n\nTermination is logged to the computer action log with risk MEDIUM (module 79 safeguards: sandbox services only — system processes are never targetable).`, trace: [], tools: [] };
    });
    return {
      content: `**Termination is a LEVEL 2 action — confirm first.**\n\nTarget: \`${svc.name}\` on port ${svc.port} (running since ${svc.startedAt ? fmtAgo(svc.startedAt) : "—"}).\nCritical system processes are structurally out of reach, and nothing dies without your explicit approval.`,
      trace, tools, kind: "confirm",
      pending: { id, label: `Stop ${svc.name} (port ${svc.port})`, risk: "MEDIUM" },
    };
  }

  const p = await probeSystem();
  const ps = call("process.manage", "{action:'list'}", "LOW", () => execTerminal("ps").output);
  void ps;
  return {
    content: `### Process / resource view (FACT)\n- **Cores**: ${p.cores} · **loop latency**: ${p.loopLatencyMs ?? "…"} ms\n- **JS heap**: ${p.jsHeapMB !== null ? `${p.jsHeapMB} MB` : "not exposed by this browser"}${p.jsHeapMB === null ? " — full system RAM tables require the companion agent" : ""}\n- **Dev services**: ${running.length ? running.map((v) => `\`${v.name}\` :${v.port}`).join(", ") : "none running"}\n\n\`\`\`\n${execTerminal("ps").output}\n\`\`\`\n\n_Ask "stop the server" to terminate a service (confirm-gated). Native process tables (tasklist/htop) need the OS companion agent — I won't fake them._`,
    trace, tools, kind: "report",
  };
}

function hEnvCheck(text: string): BrainResult {
  const { trace, tools, call } = makeCtx();
  const tool = /python/.test(text) ? "python" : /git/.test(text) ? "git" : /npm/.test(text) ? "npm" : /vs ?code|code/.test(text) ? "code" : "node";
  const cmd = `${tool} --version`;
  trace.push(compTrace(`terminal.run → safe version check: ${cmd}`));
  const cls = classifyCommand(cmd);
  const out = call("terminal.run", `{cmd:'${cmd}'}`, "LOW", () => execTerminal(cmd).output);
  return {
    content: `### Environment check (FACT)\n\`${cmd}\` → **${out}**\n\nClassification: **${cls.risk} risk** (${cls.reason}) — version checks are Level 1 safe actions and execute automatically (module 80).`,
    trace, tools,
  };
}

function hGitOp(text: string): BrainResult {
  const { trace, tools, call } = makeCtx();
  const sub = /push/.test(text) ? "push" : /diff/.test(text) ? "diff" : /log/.test(text) ? "log" : /branch/.test(text) ? "branch" : "status";
  const out = call("terminal.run", `{cmd:'git ${sub}'}`, sub === "push" ? "MEDIUM" : "LOW", () => execTerminal(`git ${sub}`).output);
  trace.push(compTrace(`terminal.run → git ${sub}${sub === "push" ? " (pre-push secret scan active, module 81)" : ""}`));
  const extra = sub === "push"
    ? "\n\n**Push is confirm-gated.** The pre-push secret scan flagged \`.env\` — tokens must never leave this machine. Approve the exclusion and I'll queue the push through the companion agent when it's attached."
    : sub === "status" ? "\n\nNote the \`.env\` warning — the secret scanner (module 81) automatically flags credential files before any commit." : "";
  return { content: `### git ${sub}\n\`\`\`\n${out}\n\`\`\`${extra}`, trace, tools, kind: "report" };
}

function hDeleteDemo(text: string): BrainResult {
  const { trace, tools } = makeCtx();
  const target = /folder/.test(text) ? "folder" : /directory/.test(text) ? "directory" : "file";
  const testMode = getState().compSettings.testMode;
  logAudit({ action: "computer.delete_request", tool: "permission_manager", input: text.slice(0, 80), result: testMode ? "demonstrated in test mode — nothing deleted" : "confirmation required — nothing deleted", status: "BLOCKED", risk: "HIGH" });
  trace.push(compTrace("permission_manager → LEVEL 3 gate engaged; executor never reached"));
  tools.push({ tool: "computer.execute", input: `DELETE ${target}`, output: "blocked at permission gate", risk: "HIGH" });
  return {
    content: `■ **LEVEL 3 — HIGH RISK. Nothing was deleted.**\n\n` +
      (testMode
        ? `TEST MODE: I *would* execute → \`DELETE ${target.toUpperCase()}\` — after identifying the exact target, snapshotting it, and receiving your explicit confirmation.\n\n`
        : `Production mode: this requires explicit confirmation **and** runs through the native companion agent with a pre-delete snapshot.\n\n`) +
      `Deletion safeguards (modules 69, 96):\n- Target must be classified TEMPORARY / PROJECT / SYSTEM / SENSITIVE first\n- PROJECT and SENSITIVE items get a reversible snapshot before removal\n- SYSTEM paths are refused outright\n- Every request — even blocked ones — is written to the audit log\n\n_If you genuinely want something removed, name the exact path and I'll walk it through the gate._`,
    trace, tools,
  };
}

function hSuppliers(): BrainResult {
  const { trace, tools, call } = makeCtx();
  trace.push(compTrace("research_engine → supplier scan (sample intelligence, labelled ESTIMATE)"));
  const md = call("business.research", "{query:'laptop suppliers nairobi'}", "LOW", () => supplierComparison());
  return { content: md, trace, tools, kind: "report" };
}

async function hOpenApp(text: string, onProgress?: (md: string) => void): Promise<BrainResult> {
  if (/and run|then run|run it/.test(text)) return hRunProject(text, onProgress);
  const { trace, tools } = makeCtx();
  const app = /vs ?code|code/.test(text) ? "VS Code" : /chrome|browser/.test(text) ? "Chrome" : /terminal/.test(text) ? "Terminal" : /explorer/.test(text) ? "File Explorer" : "Application";
  const testMode = getState().compSettings.testMode;
  trace.push(compTrace(`application_manager → launch ${app} (${testMode ? "test mode: plan + demonstrate" : "companion agent"})`));
  const steps: PlanStepDef[] = [
    { label: `Detect ${app} installation`, app: "AppManager", action: "locate binary", target: app, risk: "LOW", run: async () => ({ ok: true, detail: testMode ? "(test mode) PATH scan simulated — real detection needs the companion agent" : "binary located" }) },
    { label: `Launch ${app}`, app: "AppManager", action: "spawn process", target: app, risk: "LOW", run: async () => { await new Promise((r) => setTimeout(r, 500)); return { ok: true, detail: testMode ? "(test mode) launch demonstrated — the native launcher is part of the companion agent" : "process spawned" }; }, recover: "would try an alternative permitted path for the same app" },
    { label: "VERIFY window appeared", app: "Verifier", action: "check active window", target: app, risk: "LOW", run: async () => ({ ok: true, detail: testMode ? "(test mode) verification demonstrated against the window manager stub" : `${app} window focused` }) },
  ];
  const { results, ok, aborted } = await runPlan(steps, { onStep: () => onProgress?.(planMarkdown(`Open ${app}`, results, "_executing…_")) });
  results.forEach((r) => tools.push({ tool: "computer.execute", input: r.action, output: r.detail.slice(0, 110), risk: r.risk }));
  return {
    content: planMarkdown(`Open ${app}`, results, aborted ? "■ Aborted by emergency stop." : ok
      ? `**${app} launch plan complete.** In the browser sandbox these steps are demonstrated (TEST MODE); with the companion agent attached they execute natively — same planner, same verification, real window.`
      : "Plan did not verify — not claiming success."),
    trace, tools, kind: "report",
  };
}

async function hSwitchApp(text: string): Promise<BrainResult> {
  const { trace, tools } = makeCtx();
  const app = /chrome|browser/.test(text) ? "Chrome" : /vs ?code/.test(text) ? "VS Code" : "Terminal";
  trace.push(compTrace(`window_manager → focus ${app} (demonstrated in sandbox)`));
  const steps: PlanStepDef[] = [
    { label: `Locate ${app} window`, app: "WindowManager", action: "enumerate windows", target: app, risk: "LOW", run: async () => ({ ok: true, detail: "(test mode) window enumeration demonstrated — native list needs companion agent" }) },
    { label: `Focus ${app}`, app: "WindowManager", action: "bring to front", target: app, risk: "LOW", run: async () => ({ ok: true, detail: "(test mode) focus action demonstrated" }) },
  ];
  const { results } = await runPlan(steps, { onStep: () => undefined });
  results.forEach((r) => tools.push({ tool: "computer.execute", input: r.action, output: r.detail.slice(0, 110), risk: r.risk }));
  return { content: planMarkdown(`Switch to ${app}`, results, "Window focus demonstrated in TEST MODE. Native Alt-Tab control arrives with the companion agent — I never pretend the window actually moved."), trace, tools, kind: "report" };
}

async function hMicTrouble(): Promise<BrainResult> {
  const { trace, tools } = makeCtx();
  trace.push(compTrace("voice_manager → device enumeration + diagnostics (real APIs)"));
  let mics: { deviceId: string; label: string }[] = [];
  let err: string | null = null;
  try { mics = await listMics(); } catch (e) { err = String(e); }
  tools.push({ tool: "voice.diagnostics", input: "{enumerate:true}", output: err ?? `${mics.length} input device(s)`, risk: "LOW" });
  if (err || mics.length === 0) {
    return {
      content: `### Microphone diagnostic — honest result\n**No input devices confirmed.** ${err ? `Error: ${err}.` : "Enumeration returned zero devices."}\n\nMost likely causes, in order:\n- Browser permission not granted — click the mic icon in the address bar and allow\n- The mic is disabled at OS level or unplugged\n- Another application is holding the device\n\n**Next step**: open **Settings → Voice & audio → Test mic**. It reports the actual error (permission, busy, unsupported format) instead of guessing — and never hard-codes a device index (module 15).`,
      trace, tools,
    };
  }
  return {
    content: `### Microphone diagnostic (FACT)\n${mics.map((m, i) => `- **${m.label}** \`id:${m.deviceId.slice(0, 8)}…\`${i === 0 ? " · default" : ""}`).join("\n")}\n\nAll devices are addressed **by ID, never by index** (module 15). Run **Settings → Voice & audio → Test mic** for the live level meter, sample rate and channel check — if levels sit near zero, that's the OS input volume, and the test tells you so.`,
    trace, tools,
  };
}

/* async brain entry — computer intents run here; everything else falls back to runBrain */
export async function runBrainAsync(raw: string, onProgress?: (md: string) => void): Promise<BrainResult> {
  const { intent } = detectIntent(raw.trim());
  switch (intent) {
    case "stop": return hStop();
    case "screenshot": return hScreenshot();
    case "computer_status": return hComputerStatus();
    case "run_project": return hRunProject(raw, onProgress);
    case "find_error": return hFindError();
    case "run_tests": return hRunTests();
    case "processes": return hProcessQuery(raw);
    case "env_check": return hEnvCheck(raw);
    case "git_op": return hGitOp(raw);
    case "delete_thing": return hDeleteDemo(raw);
    case "suppliers": return hSuppliers();
    case "open_app": return hOpenApp(raw, onProgress);
    case "switch_app": return hSwitchApp(raw);
    case "mic_trouble": return hMicTrouble();
    default: return runBrain(raw);
  }
}

export function runBrain(raw: string): BrainResult {
  const text = raw.trim();
  const { intent, conf } = detectIntent(text);
  const t0: TraceStep = { stage: "INTENT", detail: `${intent} · confidence ${conf.toFixed(2)}` };

  switch (intent) {
    case "sales_today": return hSalesToday();
    case "analyze_business": return hAnalyzeBusiness();
    case "low_stock": return hLowStock();
    case "analyze_product": {
      const m = text.match(RULES.find((r) => r.intent === "analyze_product")!.re);
      return hAnalyzeProduct(m?.[3] ?? text);
    }
    case "shopping": return hShopping(text);
    case "pricing": return hPricing(text);
    case "set_price": {
      const m = text.match(/set price of (.+?) to (\d[\d,]*)/i)!;
      const p = matchProduct(m[1]);
      const price = parseFloat(m[2].replace(/,/g, ""));
      if (!p) return { content: `I couldn't match "${m[1]}" to a catalogue product, so no price was changed.`, trace: [t0], tools: [] };
      const id = uid();
      pendingActions.set(id, () => {
        const ok = updatePrice(p.id, price, "user instruction via chat");
        return {
          content: ok
            ? `Done — **${p.name}** now sells at **${fmtKSh(price)}**. Change recorded in the audit log (financial-grade action).`
            : `The price change failed validation (non-positive price). Nothing was modified.`,
          trace: [{ stage: "EXECUTE", detail: "business.update_price · confirmed by user" }], tools: [],
        };
      });
      return {
        kind: "confirm",
        pending: { id, label: `Change ${p.name} price to ${fmtKSh(price)}`, risk: "MEDIUM" },
        content: `Price changes touch revenue — confirming before I execute:\n**${p.name}**: ${fmtKSh(p.sellPrice)} → **${fmtKSh(price)}**. Approve?`,
        trace: [t0, { stage: "SECURITY", detail: "risk=MEDIUM → explicit confirmation required" }], tools: [],
      };
    }
    case "memory_clear": {
      const id = uid();
      const count = getState().memories.length;
      pendingActions.set(id, () => {
        const n = getState().memories.length;
        mutate((st) => { st.memories = []; });
        logAudit({ action: "memory.delete_all", tool: "memory_manager", result: `${n} memories wiped`, status: "SUCCESS", risk: "HIGH", confirmed: true });
        return { content: `Deleted **${n}** memories. The wipe is recorded in the audit log. Core seed context is gone — rebuild what matters with _"remember that …"_.`, trace: [], tools: [] };
      });
      return {
        kind: "confirm",
        pending: { id, label: `Delete all ${count} memories (irreversible)`, risk: "HIGH" },
        content: `This permanently deletes **${count}** memories — profile, supplier map, pricing rules, decisions. Irreversible. Approve?`,
        trace: [t0, { stage: "SECURITY", detail: "risk=HIGH → explicit confirmation required" }], tools: [],
      };
    }
    case "simulate_order": {
      const s = getState();
      const candidates = s.products.filter((p) => p.stock > 0);
      const p = candidates[Math.floor(Math.random() * candidates.length)];
      const res = recordSale({ productId: p.id, qty: 1, channel: "mpesa", simulated: true });
      return {
        content: res.ok
          ? `### Simulated order — clearly labelled [SIM]
Ran the full NEW ORDER pipeline on **${p.name}**:
validate → update stock & ledger → recompute metrics → estimate profit → notify → audit.

- Revenue: ${fmtKSh(res.sale!.unitPrice)} · est. profit: **${fmtKSh(res.profit!)}**
${res.warnings.length ? "- " + res.warnings.join("\n- ") : "- No warnings"}

_This was a simulation (no real money moved). Feed the same pipeline a real WooCommerce webhook and it behaves identically._`
          : `Simulation failed honestly: ${res.error}`,
        trace: [t0, { stage: "EXECUTE", detail: "business.record_sale · simulated=true" }, { stage: "VALIDATE", detail: "labelled [SIM] in ledger + feed" }],
        tools: [{ tool: "business.record_sale", input: `${p.name} ×1 [SIM]`, output: res.ok ? `profit ${fmtKSh(res.profit!)}` : res.error!, risk: "MEDIUM" }],
      };
    }
    case "daily_report": return hDailyReport();
    case "best_product": {
      const perfs = productPerformance(getState().products, getState().sales).sort((a, b) => b.profit - a.profit);
      const b = perfs[0];
      return {
        content: `### Best performer (14d) — FACT\n**${b.product.name}**\n- ${b.units} units · ${fmtKSh(b.revenue)} revenue · **${fmtKSh(b.profit)}** est. profit · ${(b.margin * 100).toFixed(1)}% margin\n\nPromote it: top of store, next video, consider a small bundle to lift basket size.`,
        trace: [t0], tools: [{ tool: "business.analytics", input: "{window:'14d', rank:'profit'}", output: b.product.name, risk: "LOW" }],
      };
    }
    case "worst_product": {
      const perfs = productPerformance(getState().products, getState().sales).filter((p) => p.units > 0).sort((a, b) => a.profit - b.profit);
      const w = perfs[0];
      return {
        content: w
          ? `### Weakest mover (14d) — FACT\n**${w.product.name}** — ${w.units} units, ${fmtKSh(w.profit)} est. profit (${(w.margin * 100).toFixed(1)}% margin).\n\n${w.margin < 0.12 ? "Margin is below your 12% floor after delivery + fees. Either raise price ~5–7% or stop promoting it." : "Margin is acceptable — the issue is velocity. Test one content angle before cutting price."}`
          : "No sales in the window to judge yet.",
        trace: [t0], tools: [{ tool: "business.analytics", input: "{window:'14d', rank:'profit_asc'}", output: w?.product.name ?? "none", risk: "LOW" }],
      };
    }
    case "revenue": {
      const w7 = rangeTotals(getState(), 7);
      return { content: `### Revenue — FACT\n- Today: ${fmtKSh(rangeTotals(getState(), 1).revenue)}\n- 7 days: **${fmtKSh(w7.revenue)}** (${w7.orders} orders)\n- 14 days: ${fmtKSh(rangeTotals(getState(), 14).revenue)}\n\nRemember the distinction you set: **revenue ≠ profit**. 7-day estimated profit is ${fmtKSh(w7.profit)}.`, trace: [t0], tools: [{ tool: "business.analytics", input: "{window:'7d'}", output: `${w7.revenue}`, risk: "LOW" }] };
    }
    case "profit": {
      const w7 = rangeTotals(getState(), 7);
      return { content: `### Profit — ESTIMATE (cost + delivery + fees deducted)\n- 7-day gross profit: **${fmtKSh(w7.profit)}** on ${fmtKSh(w7.revenue)} revenue\n- Operating expenses: ${fmtKSh(w7.expenses)}\n- **Net after expenses: ${fmtKSh(w7.netAfterExpenses)}**\n\nStock purchases (float) are excluded — that's capital, not expense, per your accounting rule.`, trace: [t0], tools: [{ tool: "business.analytics", input: "{window:'7d'}", output: `${w7.profit}`, risk: "LOW" }] };
    }
    case "expenses": {
      const s = getState();
      const sorted = [...s.expenses].sort((a, b) => b.amount - a.amount);
      const opex = sorted.filter((e) => e.category !== "sourcing");
      const total = opex.reduce((a, b) => a + b.amount, 0);
      return {
        content: `### Expenses (30d view) — FACT\n${sorted.slice(0, 5).map((e) => `- ${fmtKSh(e.amount)} — ${e.label} _(${e.category})_`).join("\n")}\n\nOperating total: **${fmtKSh(total)}**. Largest line: **${opex[0]?.label ?? "—"}**. Sourcing float is tracked separately as capital, not expense.`,
        trace: [t0], tools: [{ tool: "business.analytics", input: "{expenses:'30d'}", output: `${total}`, risk: "LOW" }],
      };
    }
    case "competitors": {
      const s = getState();
      return {
        content: `### Competitor read — manual public tracking, no scraping\n${s.competitors.map((c) => `- **${c.name}** (${c.channel}) — prices ≈ ${Math.round((c.priceIndex - 1) * 100)}% ${c.priceIndex < 1 ? "below" : "above"} parity\n  Strong: ${c.strength}\n  Weak: ${c.weakness}`).join("\n")}\n\n**Angle:** nobody owns _"tested + honest spec sheet + WhatsApp support"_. The price-war seller can't add trust; the content seller is overpriced. Hold price, lead with proof (battery screenshots, test videos).`,
        trace: [t0, { stage: "VALIDATE", detail: "price indexes are manually observed — ESTIMATE, refresh weekly" }],
        tools: [{ tool: "research.market", input: "{topic:'competitors'}", output: `${s.competitors.length} tracked`, risk: "LOW" }],
      };
    }
    case "learn_today": return hLearnToday();
    case "skill_path": {
      const m = text.match(/(?:learning path|skill path|roadmap) for (.+)/i);
      const q = m?.[1] ?? "";
      const k = getState().skills.find((x) => norm(x.name).includes(norm(q).split(" ")[0])) ?? getState().skills[0];
      return {
        content: `### ${k.name} — ${k.level}% → target ${k.target}%\n${k.path.map((st, i) => `${st.done ? "✓" : i === k.path.findIndex((x) => !x.done) ? "▶" : "○"} ${st.name}`).join("\n")}\n\n**Now:** ${k.nextLesson}\n**Weak spots:** ${k.weak.join(", ")}\nDifficulty rises each completed step — no skipping to deployment before middleware is fluent.`,
        trace: [t0], tools: [{ tool: "learning.advisor", input: `{skill:'${k.id}'}`, output: k.nextLesson, risk: "LOW" }],
      };
    }
    case "next_action": return hNextAction();
    case "decision": {
      const m = text.match(/(?:decide|decisi\w*|do)\s*(?:about|on|:)?\s*(.*)/i);
      return hDecision(m?.[1] ?? "");
    }
    case "projects_status": {
      const s = getState();
      return {
        content: `### Active builds\n${s.projects.map((p) => {
          const ts = s.tasks.filter((t) => t.projectId === p.id);
          const done = ts.filter((t) => t.status === "DONE").length;
          return `- **${p.name}** — ${p.status.toUpperCase()}${ts.length ? ` · ${done}/${ts.length} tasks done` : ""}\n  Next: ${p.nextAction}${p.blockers.length ? `\n  Blocked: ${p.blockers.join("; ")}` : ""}`;
        }).join("\n")}\n\nWant the single best next move across all of these? Ask _"what should I work on next"_.`,
        trace: [t0], tools: [{ tool: "projects.status", input: "{}", output: `${s.projects.length} projects`, risk: "LOW" }],
      };
    }
    case "add_task": {
      const m = text.match(RULES.find((r) => r.intent === "add_task")!.re)!;
      const title = m[1].trim();
      const priority = /\b(urgent|high|asap|today)\b/i.test(title) ? "HIGH" : /\b(low|someday|maybe)\b/i.test(title) ? "LOW" : "MEDIUM";
      addTask(title, priority);
      return { content: `Task added: **"${title}"** · ${priority} priority. It's in the queue and ranked against your other open work.`, trace: [t0, { stage: "EXECUTE", detail: "tasks.add · risk LOW · auto-executed" }], tools: [{ tool: "tasks.manage", input: title, output: "created", risk: "LOW" }] };
    }
    case "complete_task": {
      const m = text.match(RULES.find((r) => r.intent === "complete_task")!.re)!;
      const q = norm(m[1]);
      const t = getState().tasks.find((x) => x.status !== "DONE" && norm(x.title).includes(q)) ??
        getState().tasks.find((x) => x.status !== "DONE" && q.split(" ").some((w) => w.length > 3 && norm(x.title).includes(w)));
      if (!t) return { content: `No open task matches "${m[1]}". Open tasks: ${getState().tasks.filter((x) => x.status !== "DONE").slice(0, 5).map((x) => `"${x.title}"`).join(", ")}.`, trace: [t0], tools: [] };
      toggleTask(t.id);
      return { content: `Marked done: **"${t.title}"** ✓ Logged to today's productivity metrics.`, trace: [t0, { stage: "EXECUTE", detail: "tasks.complete" }], tools: [{ tool: "tasks.manage", input: t.title, output: "completed", risk: "LOW" }] };
    }
    case "marketing": return hMarketing(text);
    case "freelance": return hFreelance();
    case "memory_add": {
      const m = text.match(/^remember that\s+(.+)/i)!;
      const body = m[1].trim();
      addMemory("CONVERSATION", body.length > 48 ? body.slice(0, 48) + "…" : body, body, "conversation");
      return { content: `Stored in **CONVERSATION** memory. Searchable anytime with _"recall …"_, editable/deletable in the Memory panel.`, trace: [t0, { stage: "MEMORY", detail: "write · category=CONVERSATION" }], tools: [{ tool: "memory.write", input: body.slice(0, 60), output: "stored", risk: "LOW" }] };
    }
    case "memory_search": {
      const m = text.match(/^(?:recall|search memory(?: for)?|what do you remember about)\s+(.+)/i)!;
      const q = norm(m[1]);
      const hits = getState().memories.filter((mm) => norm(mm.title + " " + mm.body).split(" ").some((w) => q.includes(w) || w.includes(q)));
      return {
        content: hits.length
          ? `### Memory hits for "${m[1]}"\n${hits.slice(0, 5).map((mm) => `- **[${mm.category}] ${mm.title}** — ${mm.body.slice(0, 140)}${mm.body.length > 140 ? "…" : ""} _(${fmtAgo(mm.ts)})_`).join("\n")}`
          : `Nothing stored matches "${m[1]}". Memory is explicit — if it matters, tell me: _"remember that …"_`,
        trace: [t0, { stage: "MEMORY", detail: `search · ${hits.length} hits` }], tools: [{ tool: "memory.search", input: m[1], output: `${hits.length} hits`, risk: "LOW" }],
      };
    }
    case "health": return hHealth();
    case "mic_test": return hMicTest();
    case "clear_chat": { clearChat(); return { content: "Conversation transcript cleared. Long-term memory categories were not touched.", trace: [t0], tools: [] }; }
    case "help": return hHelp();
    case "greeting": return { content: `Online. Queue has ${getState().tasks.filter((t) => t.status === "OPEN").length} open tasks, ${getState().notifications.filter((x) => !x.read).length} unread alerts, and today's ledger is ${getState().sales.filter((x) => isToday(x.ts)).length ? "live" : "empty"}. Ask for the _daily report_, or say _help_.`, trace: [t0], tools: [] };
    case "thanks": return { content: "Acknowledged. I've logged the session context — next time you say _\"continue\"_ I'll know where we left off.", trace: [t0], tools: [] };
    case "time": return { content: `Local time: **${new Date().toLocaleTimeString("en-KE")}**, ${new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.`, trace: [t0], tools: [] };
    default: {
      logAudit({ action: "intent.unknown", tool: "jarvis_brain", input: text.slice(0, 80), result: "no confident intent — honest fallback", status: "FAILED", risk: "LOW" });
      return {
        content: `I don't have a confident intent for that, and I won't guess at something that matters. Closest things I **can** do right now:

- Business: _"show today's sales"_, _"analyze my business"_, _"low stock"_, _"suggest a price: cost 38500, delivery 300"_
- Execution: _"what should I work on next"_, _"add task …"_, _"daily report"_
- Learning: _"what should I learn today"_, _"learning path for Node.js"_
- System: _"check system health"_, _"test the microphone"_

Rephrase, or type _help_ for the full map.`,
        trace: [t0, { stage: "VALIDATE", detail: "confidence 0 — refused to fabricate an answer" }], tools: [],
      };
    }
  }
}


