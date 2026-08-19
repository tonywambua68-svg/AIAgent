/* J.A.R.V.I.S OS — Analytics: trends, rankings, channel mix, learning investment */
import { useMemo } from "react";
import type { Sale } from "../lib/types";
import { useStore, productPerformance, rangeTotals, dailySeries, fmtKSh, saleProfit } from "../lib/store";
import { Panel, Badge, DualBars, HBars, Donut, Sparkline, IcChart } from "./ui";

const CAT_COLORS = ["#00ff88", "#5ad7ff", "#ffc24b", "#ff6b5e", "#8ba396", "#c792ea"];

export default function Analytics() {
  const s = useStore();
  const series = useMemo(() => dailySeries(s, 14), [s]);
  const w14 = rangeTotals(s, 14);
  const perfs = useMemo(() => productPerformance(s.products, s.sales), [s.products, s.sales]);

  const catShare = useMemo(() => {
    const map = new Map<string, number>();
    const pmap = new Map(s.products.map((p) => [p.id, p]));
    s.sales.forEach((x) => {
      const cat = pmap.get(x.productId)?.category ?? "Other";
      map.set(cat, (map.get(cat) ?? 0) + x.unitPrice * x.qty);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, color: CAT_COLORS[i % CAT_COLORS.length] }));
  }, [s.sales, s.products]);

  const channelMix = useMemo(() => {
    const map = new Map<Sale["channel"], number>();
    s.sales.forEach((x) => map.set(x.channel, (map.get(x.channel) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label: label.toUpperCase(), value, display: `${value} orders` }));
  }, [s.sales]);

  const skillHours = useMemo(() =>
    [...s.skills].sort((a, b) => b.practiceHours - a.practiceHours)
      .map((k) => ({ label: k.name, value: k.practiceHours, display: `${k.practiceHours}h · ${k.level}%` })),
  [s.skills]);

  const doneThisWeek = s.tasks.filter((t) => t.completedAt && Date.now() - t.completedAt < 7 * 86400000).length;
  const practicedThisWeek = s.skills.filter((k) => k.lastPracticed && Date.now() - k.lastPracticed < 7 * 86400000).length;
  const totalProfit14 = s.sales.reduce((a, b) => {
    const p = s.products.find((x) => x.id === b.productId);
    return p ? a + saleProfit(b, p) : a;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold flex items-center gap-2"><IcChart size={18} className="text-acc" /> ANALYTICS</h2>
          <p className="text-[11.5px] text-mut mt-0.5">14-day window · facts from the ledger, estimates labelled</p>
        </div>
        <div className="flex gap-2">
          <Badge tone="acc">revenue {fmtKSh(w14.revenue)}</Badge>
          <Badge tone="info">est. profit {fmtKSh(totalProfit14)}</Badge>
          <Badge tone="mut">{w14.orders} orders</Badge>
        </div>
      </div>

      <Panel title="Revenue vs est. profit trend" corner>
        <div className="p-4"><DualBars data={series} h={190} /></div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Product profit ranking — 14d">
          <div className="p-4">
            <HBars items={[...perfs].filter((p) => p.units > 0).sort((a, b) => b.profit - a.profit).slice(0, 7)
              .map((p) => ({ label: p.product.name.split("(")[0].trim(), value: p.profit, display: fmtKSh(p.profit) }))} />
          </div>
        </Panel>
        <Panel title="Revenue by category">
          <div className="p-4"><Donut parts={catShare} /></div>
        </Panel>
        <Panel title="Sales channels">
          <div className="p-4">
            <HBars items={channelMix.map((c) => ({ ...c, color: c.label === "MPESA" ? "#00ff88" : "#5ad7ff" }))} />
            <p className="text-[10.5px] text-mut mt-3">M-Pesa dominates — the 1.5% fee is your cost of doing business; card's 3% makes it the last resort for big tickets.</p>
          </div>
        </Panel>
        <Panel title="Learning investment — hours logged">
          <div className="p-4"><HBars items={skillHours} /></div>
        </Panel>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="panel panel-hover p-4 fade-up">
          <div className="text-[10.5px] font-mono uppercase tracking-widest text-mut">productivity · 7d</div>
          <div className="font-display text-2xl font-bold text-acc mt-1">{doneThisWeek}<span className="text-sm text-mut font-body font-normal"> tasks closed</span></div>
          <div className="mt-2"><Sparkline data={series.slice(7).map((d) => d.orders)} color="#5ad7ff" w={180} h={34} /></div>
          <div className="text-[10.5px] text-mut mt-1">order volume, last 7 days</div>
        </div>
        <div className="panel panel-hover p-4 fade-up" style={{ animationDelay: "70ms" }}>
          <div className="text-[10.5px] font-mono uppercase tracking-widest text-mut">skills active · 7d</div>
          <div className="font-display text-2xl font-bold text-info mt-1">{practicedThisWeek}<span className="text-sm text-mut font-body font-normal"> / {s.skills.length} practiced</span></div>
          <div className="mt-2"><Sparkline data={s.skills.map((k) => k.level)} color="#5ad7ff" w={180} h={34} /></div>
          <div className="text-[10.5px] text-mut mt-1">current level across tracked skills</div>
        </div>
        <div className="panel panel-hover p-4 fade-up" style={{ animationDelay: "140ms" }}>
          <div className="text-[10.5px] font-mono uppercase tracking-widest text-mut">profit discipline</div>
          <div className="font-display text-2xl font-bold mt-1" style={{ color: w14.netAfterExpenses >= 0 ? "#00ff88" : "#ff6b5e" }}>
            {fmtKSh(w14.netAfterExpenses)}
          </div>
          <div className="text-[10.5px] text-mut mt-1">14-day est. profit minus opex</div>
          <div className="mt-2"><Sparkline data={series.map((d) => d.profit)} w={180} h={34} /></div>
        </div>
      </div>
    </div>
  );
}
