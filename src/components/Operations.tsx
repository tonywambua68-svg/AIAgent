/* J.A.R.V.I.S OS — Projects, Tasks, Learning sections */
import { useState } from "react";
import type { Task } from "../lib/types";
import {
  useStore, addTask, toggleTask, deleteTask, logPractice,
  fmtAgo, bus,
} from "../lib/store";
import { Panel, Badge, Bar, IcPlus, IcTrash, IcFolder, IcCheck, IcBook, IcZap, IcWarn } from "./ui";

const ask = (text: string) => bus.emit("prefill", text);

const PRIO_TONE: Record<Task["priority"], "danger" | "warn" | "mut"> = { HIGH: "danger", MEDIUM: "warn", LOW: "mut" };

/* ---------------- PROJECTS ---------------- */

export function ProjectsSection() {
  const s = useStore();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold flex items-center gap-2"><IcFolder size={18} className="text-acc" /> PROJECTS</h2>
          <p className="text-[11.5px] text-mut mt-0.5">What you're building, what's blocked, what's next</p>
        </div>
        <button className="btn-ghost" onClick={() => ask("what am I building?")}>Ask JARVIS</button>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {s.projects.map((p, idx) => {
          const ts = s.tasks.filter((t) => t.projectId === p.id);
          const done = ts.filter((t) => t.status === "DONE").length;
          const pct = ts.length ? (done / ts.length) * 100 : p.status === "done" ? 100 : 15;
          return (
            <div key={p.id} className="panel panel-hover corner p-4 fade-up" style={{ animationDelay: `${idx * 70}ms` }}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display font-bold text-[14.5px]">{p.name}</h3>
                <Badge tone={p.status === "active" ? "acc" : p.status === "blocked" ? "danger" : "info"}>{p.status}</Badge>
              </div>
              <p className="text-[11.5px] text-mut leading-relaxed mt-1.5">{p.goal}</p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {p.tech.map((t) => <span key={t} className="chip">{t}</span>)}
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-[10.5px] font-mono text-mut mb-1">
                  <span>progress</span><span>{done}/{ts.length || "—"} tasks · {Math.round(pct)}%</span>
                </div>
                <Bar value={pct} h={5} />
              </div>
              {p.blockers.length > 0 && (
                <div className="mt-3 text-[11.5px] text-warn flex gap-1.5 items-start">
                  <IcWarn size={13} className="shrink-0 mt-0.5" /> {p.blockers.join("; ")}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-line/70">
                <div className="text-[10px] font-mono uppercase tracking-wider text-mut">next action</div>
                <p className="text-[12px] text-txt mt-1">{p.nextAction}</p>
              </div>
              <div className="flex gap-2 mt-3">
                <button className="btn-ghost flex-1 !text-[11px]" onClick={() => ask(`check my project ${p.name}`)}>Analyze</button>
                {p.repo && <span className="chip self-center">{p.repo}</span>}
              </div>
              <div className="text-[10px] font-mono text-mut/60 mt-2">updated {fmtAgo(p.updatedAt)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- TASKS ---------------- */

export function TasksSection() {
  const s = useStore();
  const [title, setTitle] = useState("");
  const [prio, setPrio] = useState<Task["priority"]>("MEDIUM");
  const [showDone, setShowDone] = useState(false);
  const open = s.tasks.filter((t) => t.status !== "DONE");
  const done = s.tasks.filter((t) => t.status === "DONE");
  const byPrio = (p: Task["priority"]) => open.filter((t) => t.priority === p);

  const TaskRow = ({ t }: { t: Task }) => (
    <div className={`group flex items-center gap-3 px-4 py-2.5 border-b border-line/50 last:border-0 hover:bg-white/[0.015] transition-colors ${t.status === "BLOCKED" ? "opacity-80" : ""}`}>
      <button
        onClick={() => toggleTask(t.id)}
        className={`shrink-0 w-[17px] h-[17px] rounded-[3px] border flex items-center justify-center transition-all cursor-pointer ${t.status === "DONE" ? "bg-acc border-acc text-ink" : "border-line2 hover:border-acc"}`}
        title="Toggle done">
        {t.status === "DONE" && <IcCheck size={11} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-[12.5px] ${t.status === "DONE" ? "line-through text-mut" : "text-txt"}`}>{t.title}</div>
        <div className="flex gap-1.5 mt-0.5">
          {t.projectId && <span className="chip !text-[9.5px]">{s.projects.find((p) => p.id === t.projectId)?.name ?? "project"}</span>}
          {t.tags.map((tag) => <span key={tag} className="chip !text-[9.5px]">{tag}</span>)}
          {t.status === "BLOCKED" && <Badge tone="danger" className="!text-[9.5px]">BLOCKED</Badge>}
          <span className="text-[10px] text-mut/60 self-center">{fmtAgo(t.createdAt)}</span>
        </div>
      </div>
      <Badge tone={PRIO_TONE[t.priority]}>{t.priority}</Badge>
      <button className="opacity-0 group-hover:opacity-100 transition-opacity text-mut hover:text-danger cursor-pointer" onClick={() => deleteTask(t.id)} title="Delete task">
        <IcTrash size={13} />
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold flex items-center gap-2"><IcCheck size={18} className="text-acc" /> TASKS</h2>
          <p className="text-[11.5px] text-mut mt-0.5">{open.length} open · {done.length} done · ranked by priority</p>
        </div>
        <button className="btn-ghost" onClick={() => ask("what should I work on next?")}>Prioritise for me</button>
      </div>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) { addTask(title.trim(), prio); setTitle(""); } }}>
        <input className="input flex-1" placeholder="Add task… (include 'urgent' for HIGH priority via chat)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className="input w-28" value={prio} onChange={(e) => setPrio(e.target.value as Task["priority"])}>
          <option value="HIGH">HIGH</option><option value="MEDIUM">MEDIUM</option><option value="LOW">LOW</option>
        </select>
        <button className="btn-acc shrink-0" type="submit"><IcPlus size={14} /></button>
      </form>

      {(["HIGH", "MEDIUM", "LOW"] as const).map((p) => {
        const list = byPrio(p);
        if (!list.length) return null;
        return (
          <Panel key={p} title={<span className="flex items-center gap-2">{p} PRIORITY <span className="chip">{list.length}</span></span>}>
            {list.map((t) => <TaskRow key={t.id} t={t} />)}
          </Panel>
        );
      })}

      <Panel title={
        <button className="flex items-center gap-2 cursor-pointer" onClick={() => setShowDone((v) => !v)}>
          COMPLETED <span className="chip">{done.length}</span> <span className="text-[10px] text-mut">{showDone ? "▾" : "▸"}</span>
        </button>
      }>
        {showDone && done.map((t) => <TaskRow key={t.id} t={t} />)}
        {!showDone && <p className="px-4 py-3 text-[11.5px] text-mut">{done.length} completed tasks hidden.</p>}
      </Panel>
    </div>
  );
}

/* ---------------- LEARNING ---------------- */

export function LearningSection() {
  const s = useStore();
  const [logging, setLogging] = useState<string | null>(null);
  const [hours, setHours] = useState("1");
  const [concept, setConcept] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold flex items-center gap-2"><IcBook size={18} className="text-acc" /> LEARNING ENGINE</h2>
          <p className="text-[11.5px] text-mut mt-0.5">Project-based · difficulty rises with each completed step</p>
        </div>
        <button className="btn-ghost" onClick={() => ask("what should I learn today?")}>Plan today's sprint</button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {s.skills.map((k, idx) => {
          const nextIdx = k.path.findIndex((x) => !x.done);
          return (
            <div key={k.id} className="panel panel-hover p-4 fade-up" style={{ animationDelay: `${idx * 50}ms` }}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display font-bold text-[14px]">{k.name}</h3>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-mut">{k.practiceHours}h logged</span>
                  <Badge tone={k.level >= 60 ? "acc" : k.level >= 35 ? "info" : "warn"}>{k.level}%</Badge>
                </div>
              </div>
              <div className="mt-2.5">
                <Bar value={k.level} h={5} color={k.level >= 60 ? "var(--color-acc)" : k.level >= 35 ? "var(--color-info)" : "var(--color-warn)"} />
                <div className="flex justify-between text-[10px] font-mono text-mut mt-1">
                  <span>current {k.level}%</span><span>target {k.target}%</span>
                </div>
              </div>

              <div className="mt-3 space-y-1">
                {k.path.map((st, i) => (
                  <div key={i} className={`flex items-center gap-2 text-[11.5px] ${st.done ? "text-mut" : i === nextIdx ? "text-txt" : "text-mut/50"}`}>
                    <span className={`w-3.5 text-center font-mono text-[10px] ${st.done ? "text-acc" : i === nextIdx ? "text-info" : ""}`}>
                      {st.done ? "✓" : i === nextIdx ? "▶" : "○"}
                    </span>
                    <span className={st.done ? "line-through" : ""}>{st.name}</span>
                    {i === nextIdx && <Badge tone="info" className="!text-[9px]">up next</Badge>}
                  </div>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-line/70">
                <div className="text-[10px] font-mono uppercase tracking-wider text-mut flex items-center gap-1"><IcZap size={10} /> next lesson</div>
                <p className="text-[12px] mt-1 leading-relaxed">{k.nextLesson}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {k.weak.map((w) => <span key={w} className="chip !text-[9.5px] !text-warn !border-warn/30">weak: {w}</span>)}
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                <button className="btn-acc flex-1 !text-[11px]" onClick={() => { setLogging(k.id); setHours("1"); setConcept(k.path[nextIdx]?.name ?? ""); }}>Log practice</button>
                <button className="btn-ghost !text-[11px]" onClick={() => ask(`learning path for ${k.name}`)}>Full path</button>
              </div>
              {k.lastPracticed && (
                <div className={`text-[10px] font-mono mt-2 ${Date.now() - k.lastPracticed > 6 * 86400000 ? "text-warn" : "text-mut/60"}`}>
                  last practiced {fmtAgo(k.lastPracticed)}{Date.now() - k.lastPracticed > 6 * 86400000 ? " — going cold" : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {logging && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setLogging(null)}>
          <div className="panel corner p-5 w-full max-w-sm fade-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold text-sm mb-3">Log practice — {s.skills.find((k) => k.id === logging)?.name}</h3>
            <label className="block text-[10.5px] font-mono uppercase tracking-wider text-mut">hours</label>
            <input className="input mt-1" type="number" step="0.25" min="0.25" value={hours} onChange={(e) => setHours(e.target.value)} />
            <label className="block text-[10.5px] font-mono uppercase tracking-wider text-mut mt-3">concept completed (optional)</label>
            <select className="input mt-1" value={concept} onChange={(e) => setConcept(e.target.value)}>
              <option value="">— none, practice only —</option>
              {s.skills.find((k) => k.id === logging)?.path.filter((p) => !p.done).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
            <div className="flex gap-2 mt-4">
              <button className="btn-acc flex-1" onClick={() => {
                const h = parseFloat(hours);
                if (h > 0 && logging) logPractice(logging, h, concept || undefined);
                setLogging(null);
              }}>Save</button>
              <button className="btn-ghost" onClick={() => setLogging(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
