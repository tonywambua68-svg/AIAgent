/* J.A.R.V.I.S OS — Business section: sales, ledger, pricing, opportunities, expenses */
import { useMemo, useState } from "react";
import type { Product, Sale } from "../lib/types";
import {
  useStore, productPerformance, rangeTotals, dailySeries, recordSale, updatePrice,
  addExpense, fmtKSh, fmtAgo, type SaleInput,
} from "../lib/store";
import { Panel, Badge, DualBars, Sparkline, IcPlus, IcEdit, IcStore, Bar } from "./ui";

const STATUS_TONE: Record<string, "acc" | "info" | "warn" | "danger" | "mut"> = {
  HOT: "acc", OK: "info", LOW: "warn", SLOW: "mut", LOSS: "danger",
};

function KpiRail() {
  const s = useStore();
  const series = useMemo(() => dailySeries(s, 14), [s]);
  const t1 = rangeTotals(s, 1);
  const w7 = rangeTotals(s, 7);
  const w14 = rangeTotals(s, 14);
  const perf = productPerformance(s.products, s.sales);
  const avgMargin = perf.reduce((a, b) => a + b.margin, 0) / Math.max(1, perf.length);
  const lowCount = perf.filter((p) => p.product.stock <= p.product.reorderPoint).length;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      <Stat label="Revenue · today" value={fmtKSh(t1.revenue)} sub={`${t1.orders} orders`} spark={series.map((d) => d.revenue)} tone="acc" />
      <Stat label="Est. profit · 7d" value={fmtKSh(w7.profit)} sub={`after cost+fees+delivery`} spark={series.slice(7).map((d) => d.profit)} tone="acc" />
      <Stat label="Net after expenses · 7d" value={fmtKSh(w7.netAfterExpenses)} sub={`opex ${fmtKSh(w7.expenses)}`} tone={w7.netAfterExpenses >= 0 ? "acc" : "danger"} />
      <Stat label="Avg gross margin" value={`${(avgMargin * 100).toFixed(1)}%`} sub="catalogue-wide" tone="info" />
      <Stat label="Low-stock SKUs" value={String(lowCount)} sub={lowCount ? "action needed" : "all healthy"} tone={lowCount ? "warn" : "mut"} />
      <span className="hidden">{w14.orders}</span>
    </div>
  );
}

function Stat({ label, value, sub, spark, tone }: { label: string; value: string; sub?: string; spark?: number[]; tone?: "acc" | "info" | "warn" | "danger" | "mut" }) {
  const color = tone === "warn" ? "#ffc24b" : tone === "danger" ? "#ff6b5e" : tone === "info" ? "#5ad7ff" : "#00ff88";
  return (
    <div className="panel panel-hover px-4 py-3 fade-up">
      <div className="text-[10.5px] font-mono uppercase tracking-widest text-mut">{label}</div>
      <div className="flex items-end justify-between gap-2 mt-1.5">
        <div>
          <div className="font-display text-[19px] font-bold leading-none" style={{ color: tone === "mut" ? "var(--color-txt)" : color }}>{value}</div>
          {sub && <div className="text-[10.5px] text-mut mt-1.5">{sub}</div>}
        </div>
        {spark && <Sparkline data={spark} color={color} w={72} h={26} />}
      </div>
    </div>
  );
}

function SaleForm() {
  const s = useStore();
  const [productId, setProductId] = useState(s.products[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [channel, setChannel] = useState<Sale["channel"]>("mpesa");
  const [customer, setCustomer] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function submit() {
    const input: SaleInput = { productId, qty, channel, customer: customer.trim() || undefined };
    const res = recordSale(input);
    if (res.ok) {
      setResult({ ok: true, text: `Recorded. Revenue ${fmtKSh(res.sale!.unitPrice * res.sale!.qty)} · est. profit ${fmtKSh(res.profit!)}.${res.warnings.length ? " ⚠ " + res.warnings.join(" ⚠ ") : ""}` });
      setCustomer(""); setQty(1);
    } else {
      setResult({ ok: false, text: res.error ?? "Rejected." });
    }
  }

  return (
    <Panel title="Record sale" right={<Badge tone="acc">NEW ORDER pipeline</Badge>}>
      <div className="p-4 space-y-2.5">
        <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
          {s.products.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmtKSh(p.sellPrice)} ({p.stock} in stock)</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2.5">
          <input className="input" type="number" min={1} max={20} value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} />
          <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as Sale["channel"])}>
            <option value="mpesa">M-Pesa (1.5% fee)</option>
            <option value="card">Card (3% fee)</option>
            <option value="cash">Cash</option>
            <option value="online">Store pickup</option>
          </select>
        </div>
        <input className="input" placeholder="Customer (optional)" value={customer} onChange={(e) => setCustomer(e.target.value)} />
        <button className="btn-acc w-full" onClick={submit}><span className="flex items-center justify-center gap-1.5"><IcPlus size={13} /> Run pipeline</span></button>
        <p className="text-[10.5px] text-mut leading-relaxed">validate → stock update → metrics → profit estimate → notify → audit. Low stock auto-triggers a reorder alert.</p>
        {result && (
          <div className={`fade-up text-[11.5px] px-3 py-2 rounded border ${result.ok ? "border-acc/30 bg-acc/8 text-acc" : "border-danger/40 bg-danger/8 text-danger"}`}>
            {result.text}
          </div>
        )}
      </div>
    </Panel>
  );
}

function PricingAdvisor() {
  const [cost, setCost] = useState(38500);
  const [delivery, setDelivery] = useState(300);
  const [fees, setFees] = useState(1.5);
  const [margin, setMargin] = useState(20);
  const denom = 1 - fees / 100 - margin / 100;
  const price = denom > 0 ? Math.round((cost + delivery) / denom / 50) * 50 : 0;
  const profit = price - cost - delivery - price * (fees / 100);
  return (
    <Panel title="Pricing advisor" right={<Badge tone="info">KSh</Badge>}>
      <div className="p-4 grid grid-cols-2 gap-2.5">
        {[
          { l: "Cost", v: cost, set: setCost },
          { l: "Delivery", v: delivery, set: setDelivery },
          { l: "Fees %", v: fees, set: setFees },
          { l: "Target margin %", v: margin, set: setMargin },
        ].map((f) => (
          <label key={f.l} className="block">
            <span className="text-[10px] font-mono uppercase tracking-wider text-mut">{f.l}</span>
            <input className="input mt-1" type="number" value={f.v} onChange={(e) => f.set(parseFloat(e.target.value) || 0)} />
          </label>
        ))}
        <div className="col-span-2 mt-1 panel bg-ink px-3 py-2.5 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-mut">suggested price</div>
            <div className="font-display text-lg font-bold text-acc">{price > 0 ? fmtKSh(price) : "—"}</div>
          </div>
          <div className="text-right text-[11px] text-mut">
            <div>profit/unit: <span className={profit >= 0 ? "text-acc font-mono" : "text-danger font-mono"}>{fmtKSh(profit)}</span></div>
            <div>break-even: <span className="font-mono text-txt">{fmtKSh(cost + delivery)}</span></div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function ProductTable() {
  const s = useStore();
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: "profit", dir: -1 });
  const [editing, setEditing] = useState<Product | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const perfs = useMemo(() => productPerformance(s.products, s.sales), [s.products, s.sales]);
  const rows = useMemo(() => {
    const arr = [...perfs];
    arr.sort((a, b) => {
      const va = (sort.k === "name" ? a.product.name : sort.k === "margin" ? a.margin : sort.k === "stock" ? a.product.stock : sort.k === "price" ? a.product.sellPrice : a.profit) as number | string;
      const vb = (sort.k === "name" ? b.product.name : sort.k === "margin" ? b.margin : sort.k === "stock" ? b.product.stock : sort.k === "price" ? b.product.sellPrice : b.profit) as number | string;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
    return arr;
  }, [perfs, sort]);

  const th = (k: string, label: string) => (
    <th className="cursor-pointer select-none hover:text-acc transition-colors" onClick={() => setSort((p) => ({ k, dir: p.k === k ? (p.dir === 1 ? -1 : 1) : -1 }))}>
      {label} {sort.k === k ? (sort.dir === -1 ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <Panel title={`Product ledger — ${perfs.length} SKUs`} right={<Badge tone="mut">margins after delivery + fees</Badge>} className="col-span-full">
      <div className="overflow-x-auto">
        <table className="tbl min-w-[760px]">
          <thead>
            <tr>
              {th("name", "Product")}{th("price", "Price")}{th("margin", "Margin")}
              <th>14d units</th>{th("stock", "Stock")}{th("profit", "Est. profit 14d")}<th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.product.id}>
                <td>
                  <div className="font-medium text-txt">{r.product.name}</div>
                  <div className="text-[10.5px] text-mut">{r.product.supplier} · cost {fmtKSh(r.product.costPrice)}</div>
                </td>
                <td className="font-mono">{fmtKSh(r.product.sellPrice)}</td>
                <td className="font-mono">
                  <span className={r.margin >= 0.18 ? "text-acc" : r.margin >= 0.12 ? "text-warn" : "text-danger"}>{(r.margin * 100).toFixed(1)}%</span>
                </td>
                <td className="font-mono">{r.units}</td>
                <td>
                  <span className={`font-mono ${r.product.stock <= r.product.reorderPoint ? "text-warn font-bold" : ""}`}>{r.product.stock}</span>
                  <span className="text-[10px] text-mut ml-1.5">{r.daysOfCover !== null ? `≈${r.daysOfCover.toFixed(0)}d` : ""}</span>
                </td>
                <td className={`font-mono ${r.profit >= 0 ? "text-acc" : "text-danger"}`}>{fmtKSh(r.profit)}</td>
                <td><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge></td>
                <td>
                  <div className="flex gap-1 justify-end">
                    <button className="btn-ghost !px-2 !py-1" title="Record a 1-unit M-Pesa sale"
                      onClick={() => recordSale({ productId: r.product.id, qty: 1, channel: "mpesa" })}>+1 sale</button>
                    <button className="btn-ghost !px-2 !py-1" title="Edit price (audited)"
                      onClick={() => { setEditing(r.product); setNewPrice(String(r.product.sellPrice)); }}>
                      <IcEdit size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="panel corner p-5 w-full max-w-sm fade-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold text-sm mb-1">Change price — {editing.name}</h3>
            <p className="text-[11px] text-mut mb-3">Financial-grade action: recorded in the audit log with the old price. Current: <span className="font-mono text-acc">{fmtKSh(editing.sellPrice)}</span></p>
            <input className="input font-mono" type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} autoFocus />
            <div className="flex gap-2 mt-4">
              <button className="btn-acc flex-1" onClick={() => {
                const v = parseFloat(newPrice);
                if (v > 0) { updatePrice(editing.id, v, "manual edit from ledger"); setEditing(null); }
              }}>Confirm change</button>
              <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Opportunities() {
  const s = useStore();
  const KIND_TONE: Record<string, "acc" | "info" | "warn"> = { restock: "warn", pricing: "info", bundle: "acc", market: "acc", freelance: "info" };
  return (
    <Panel title="Opportunity radar" right={<Badge tone="acc">{s.opportunities.length} scored</Badge>}>
      <div className="p-4 space-y-3">
        {[...s.opportunities].sort((a, b) => b.score - a.score).map((o) => (
          <div key={o.id} className="panel panel-hover bg-ink/60 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Badge tone={KIND_TONE[o.kind] ?? "mut"}>{o.kind}</Badge>
              <span className="ml-auto font-mono text-[11px] text-acc">{o.score}/100</span>
            </div>
            <div className="font-display font-semibold text-[13px]">{o.title}</div>
            <Bar value={o.score} h={3} />
            <p className="text-[11.5px] text-mut leading-relaxed mt-1.5">{o.rationale}</p>
            <div className="text-[10px] font-mono text-mut/70 mt-1">{fmtAgo(o.ts)}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Expenses() {
  const s = useStore();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const opex = s.expenses.filter((e) => e.category !== "sourcing").reduce((a, b) => a + b.amount, 0);
  return (
    <Panel title="Expenses" right={<Badge tone="mut">opex {fmtKSh(opex)}</Badge>}>
      <div className="p-4">
        <div className="space-y-1.5 mb-3">
          {s.expenses.slice(0, 5).map((e) => (
            <div key={e.id} className="flex justify-between text-[11.5px] gap-2">
              <span className="text-txt/90 truncate">{e.label}</span>
              <span className="font-mono text-mut whitespace-nowrap">{fmtKSh(e.amount)}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input className="input w-24" placeholder="KSh" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn-ghost shrink-0" onClick={() => {
            const v = parseFloat(amount);
            if (label.trim() && v > 0) { addExpense(label.trim(), v, "ops"); setLabel(""); setAmount(""); }
          }}><IcPlus size={13} /></button>
        </div>
        <p className="text-[10px] text-mut mt-2">Stock purchases are capital (float), not opex — per your accounting rule.</p>
      </div>
    </Panel>
  );
}

export default function Business() {
  const s = useStore();
  const series = useMemo(() => dailySeries(s, 14), [s]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold flex items-center gap-2"><IcStore size={18} className="text-acc" /> BUSINESS — DUKA ELECTRONICS</h2>
          <p className="text-[11.5px] text-mut mt-0.5">Resale model: source on demand · revenue ≠ profit, everywhere</p>
        </div>
        <Badge tone="info">{s.products.length} SKUs · {s.customers.length} customers tracked</Badge>
      </div>
      <KpiRail />
      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="Revenue vs est. profit — 14 days" className="lg:col-span-2" corner>
          <div className="p-4"><DualBars data={series} /></div>
        </Panel>
        <div className="space-y-4">
          <SaleForm />
          <PricingAdvisor />
        </div>
        <ProductTable />
        <Opportunities />
        <Expenses />
        <Panel title="Customers">
          <div className="p-4 space-y-2.5">
            {s.customers.map((c) => (
              <div key={c.id} className="flex items-center gap-3 text-[12px]">
                <div className="min-w-0 flex-1">
                  <div className="text-txt">{c.name} <Badge tone="info" className="ml-1">{c.segment}</Badge></div>
                  <div className="text-[10.5px] text-mut truncate">{c.notes}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-acc">{fmtKSh(c.lifetimeValue)}</div>
                  <div className="text-[10px] text-mut">{c.orders} orders · {fmtAgo(c.lastOrder)}</div>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-mut border-t border-line pt-2">Privacy: minimal fields only — no IDs, no addresses stored without consent.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
