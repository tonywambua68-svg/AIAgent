/* J.A.R.V.I.S OS — shared UI kit: icons, panels, badges, charts, markdown-lite */
import type { ReactNode, CSSProperties } from "react";
import type { DayPoint } from "../lib/store";

/* ---------------- icons (inline SVG, stroke = currentColor) ---------------- */

type IconProps = { size?: number; className?: string };
const I = ({ d, size = 16, className = "", fill = false }: IconProps & { d: string; fill?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className}
    fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"}
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

export const IcTerminal = (p: IconProps) => <I {...p} d="M4 5h16v14H4zM7 9l3 3-3 3M12 15h5" />;
export const IcStore = (p: IconProps) => <I {...p} d="M4 7l1.5-3h13L20 7M4 7v13h16V7M4 7h16M9 20v-6h6v6" />;
export const IcFolder = (p: IconProps) => <I {...p} d="M3 6h6l2 2h10v11H3zM3 6v13" />;
export const IcCheck = (p: IconProps) => <I {...p} d="M4 4h16v16H4zM8 12l3 3 5-6" />;
export const IcBook = (p: IconProps) => <I {...p} d="M4 4h9a3 3 0 013 3v13H7a3 3 0 00-3 3zM4 4v16M16 8h4v12h-4" />;
export const IcChart = (p: IconProps) => <I {...p} d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3M20 16V6" />;
export const IcDb = (p: IconProps) => <I {...p} d="M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />;
export const IcPlug = (p: IconProps) => <I {...p} d="M9 3v5M15 3v5M6 8h12v3a6 6 0 01-12 0zM12 17v4" />;
export const IcShield = (p: IconProps) => <I {...p} d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4" />;
export const IcGear = (p: IconProps) => <I {...p} d="M12 9a3 3 0 100 6 3 3 0 000-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />;
export const IcMic = (p: IconProps) => <I {...p} d="M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM6 11a6 6 0 0012 0M12 17v4M8 21h8" />;
export const IcVol = (p: IconProps) => <I {...p} d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" />;
export const IcVolX = (p: IconProps) => <I {...p} d="M4 9v6h4l5 4V5L8 9zM16 9l5 6M21 9l-5 6" />;
export const IcBell = (p: IconProps) => <I {...p} d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6M10 19a2 2 0 004 0" />;
export const IcSend = (p: IconProps) => <I {...p} d="M21 3L10 14M21 3l-7 18-4-7-7-4z" />;
export const IcPlay = (p: IconProps) => <I {...p} d="M7 4l13 8-13 8z" />;
export const IcWarn = (p: IconProps) => <I {...p} d="M12 3L2 20h20zM12 9v5M12 17.5v.5" />;
export const IcX = (p: IconProps) => <I {...p} d="M5 5l14 14M19 5L5 19" />;
export const IcPlus = (p: IconProps) => <I {...p} d="M12 5v14M5 12h14" />;
export const IcTrash = (p: IconProps) => <I {...p} d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />;
export const IcEdit = (p: IconProps) => <I {...p} d="M4 20h4L20 8l-4-4L4 16zM14 6l4 4" />;
export const IcSearch = (p: IconProps) => <I {...p} d="M10 4a6 6 0 100 12 6 6 0 000-12zM15 15l5 5" />;
export const IcZap = (p: IconProps) => <I {...p} d="M13 2L4 14h6l-1 8 9-12h-6z" />;
export const IcChevD = (p: IconProps) => <I {...p} d="M6 9l6 6 6-6" />;
export const IcClock = (p: IconProps) => <I {...p} d="M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 3" />;
export const IcMenu = (p: IconProps) => <I {...p} d="M4 6h16M4 12h16M4 18h16" />;
export const IcArrow = (p: IconProps) => <I {...p} d="M5 12h14M13 6l6 6-6 6" />;
export const IcChip = (p: IconProps) => <I {...p} d="M9 9h6v6H9zM5 5h14v14H5zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />;
export const IcMonitor = (p: IconProps) => <I {...p} d="M3 5h18v11H3zM8 20h8M12 16v4" />;
export const IcStopSq = (p: IconProps) => <I {...p} d="M7 7h10v10H7z" fill />;
export const IcCam = (p: IconProps) => <I {...p} d="M4 8h4l2-3h4l2 3h4v11H4zM12 11a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" />;

export const Logo = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <circle cx="16" cy="16" r="13" fill="none" stroke="#00ff88" strokeWidth="1.6" opacity="0.7" />
    <circle cx="16" cy="16" r="9" fill="none" stroke="#00ff88" strokeWidth="1" opacity="0.35" strokeDasharray="4 3" className="spin-slow" style={{ transformOrigin: "16px 16px" }} />
    <circle cx="16" cy="16" r="5.2" fill="#00ff88" />
    <circle cx="16" cy="16" r="2" fill="#0d1210" />
  </svg>
);

/* ---------------- primitives ---------------- */

export function Panel({ title, right, children, className = "", corner = false, style }: {
  title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; corner?: boolean; style?: CSSProperties;
}) {
  return (
    <section className={`panel ${corner ? "corner" : ""} ${className}`} style={style}>
      {title !== undefined && (
        <header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5 border-b border-line/70">
          <h3 className="font-display font-semibold text-[13px] tracking-wide text-txt uppercase">{title}</h3>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

const tones: Record<string, string> = {
  acc: "text-acc border-acc/40 bg-acc/10",
  info: "text-info border-info/40 bg-info/10",
  warn: "text-warn border-warn/40 bg-warn/10",
  danger: "text-danger border-danger/40 bg-danger/10",
  mut: "text-mut border-line bg-white/2",
};
export function Badge({ tone = "mut", children, className = "" }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return <span className={`chip ${tones[tone]} ${className}`}>{children}</span>;
}

export function StatusDot({ tone = "acc", pulse = false }: { tone?: "acc" | "warn" | "danger" | "info" | "mut"; pulse?: boolean }) {
  const c = { acc: "bg-acc", warn: "bg-warn", danger: "bg-danger", info: "bg-info", mut: "bg-mut" }[tone];
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${c} ${pulse ? "pulse-dot" : ""}`} />;
}

export function Bar({ value, color = "var(--color-acc)", h = 4 }: { value: number; color?: string; h?: number }) {
  return (
    <div className="w-full bg-ink rounded-sm overflow-hidden" style={{ height: h }}>
      <div className="hbar-grow h-full rounded-sm" style={{ width: `${Math.min(100, Math.max(2, value))}%`, background: color }} />
    </div>
  );
}

/* ---------------- charts (hand-rolled SVG) ---------------- */

export function Sparkline({ data, color = "#00ff88", w = 96, h = 28 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 2 - ((v - min) / range) * (h - 4)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" opacity="0.9" />
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={color} opacity="0.08" />
    </svg>
  );
}

export function DualBars({ data, h = 170 }: { data: DayPoint[]; h?: number }) {
  const w = 560;
  const pad = 6;
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const bw = (w - pad * 2) / data.length;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad} x2={w - pad} y1={h - 18 - f * (h - 30)} y2={h - 18 - f * (h - 30)} stroke="#263029" strokeDasharray="3 4" strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const x = pad + i * bw;
          const rh = (d.revenue / max) * (h - 34);
          const ph = (Math.max(0, d.profit) / max) * (h - 34);
          return (
            <g key={i}>
              <title>{`${d.label}: revenue KSh ${d.revenue.toLocaleString()} · profit KSh ${Math.round(d.profit).toLocaleString()} · ${d.orders} orders`}</title>
              <rect x={x + bw * 0.14} y={h - 18 - rh} width={bw * 0.32} height={rh} rx="1.5" fill="#3d4d44" className="bar-grow" style={{ animationDelay: `${i * 30}ms` }} />
              <rect x={x + bw * 0.52} y={h - 18 - ph} width={bw * 0.32} height={ph} rx="1.5" fill="#00ff88" className="bar-grow" style={{ animationDelay: `${i * 30 + 60}ms` }} />
              <text x={x + bw / 2} y={h - 5} textAnchor="middle" fontSize="9" fill="#8ba396" fontFamily="JetBrains Mono">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 mt-1 text-[10.5px] font-mono text-mut">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px] bg-[#3d4d44]" /> revenue</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px] bg-acc" /> est. profit</span>
      </div>
    </div>
  );
}

export function HBars({ items, unit = "" }: { items: { label: string; value: number; display?: string; color?: string }[]; unit?: string }) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return (
    <div className="space-y-2.5">
      {items.map((it, idx) => (
        <div key={idx}>
          <div className="flex justify-between text-[11.5px] mb-1">
            <span className="text-txt/90 truncate mr-2">{it.label}</span>
            <span className="font-mono text-mut whitespace-nowrap">{it.display ?? `${Math.round(it.value).toLocaleString()}${unit}`}</span>
          </div>
          <div className="h-[5px] bg-ink rounded-sm overflow-hidden">
            <div className="hbar-grow h-full rounded-sm" style={{ width: `${(Math.abs(it.value) / max) * 100}%`, background: it.color ?? (it.value < 0 ? "var(--color-danger)" : "var(--color-acc)"), animationDelay: `${idx * 60}ms` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Donut({ parts, size = 130 }: { parts: { label: string; value: number; color: string }[]; size?: number }) {
  const total = Math.max(1, parts.reduce((a, b) => a + b.value, 0));
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1c231f" strokeWidth="14" />
        {parts.map((p, i) => {
          const frac = p.value / total;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth="14"
              strokeDasharray={`${frac * c} ${c}`} strokeDashoffset={-acc * c} strokeLinecap="butt">
              <title>{`${p.label}: ${Math.round(frac * 100)}%`}</title>
            </circle>
          );
          acc += frac;
          return el;
        })}
      </svg>
      <div className="space-y-1.5 min-w-0">
        {parts.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-[11.5px]">
            <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: p.color }} />
            <span className="text-mut truncate">{p.label}</span>
            <span className="font-mono text-txt ml-auto">{total > 0 ? Math.round((p.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- markdown-lite renderer ---------------- */

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k++}>{tok.slice(1, -1)}</code>);
    else out.push(<em key={k++} className="text-mut not-italic">{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Md({ text }: { text: string }) {
  const lines = text.split("\n");
  const els: ReactNode[] = [];
  let list: string[] = [];
  const flush = (key: string) => {
    if (list.length) {
      els.push(<ul key={key}>{list.map((li, i) => <li key={i}>{inline(li)}</li>)}</ul>);
      list = [];
    }
  };
  lines.forEach((ln, i) => {
    if (ln.startsWith("- ")) { list.push(ln.slice(2)); return; }
    flush(`ul${i}`);
    if (ln.startsWith("### ")) els.push(<h3 key={i}>{inline(ln.slice(4))}</h3>);
    else if (ln.startsWith("#### ")) els.push(<h4 key={i}>{inline(ln.slice(5))}</h4>);
    else if (ln.trim() === "---") els.push(<hr key={i} />);
    else if (ln.trim()) els.push(<p key={i}>{inline(ln)}</p>);
  });
  flush("ulend");
  return <div className="md">{els}</div>;
}
