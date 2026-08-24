# J.A.R.V.I.S — Personal Intelligence OS

A personal AI operating system: assistant + researcher + teacher + developer + business analyst +
productivity manager + strategist. Built for one owner's real workflows — an electronics resale
business in Kenya (KSh), a freelancing track, and a project-based technology learning path.

> **Status honesty (rule 49):** this build runs fully client-side as a static Vite app.
> Everything *local* (memory, tools, business math, audit, voice diagnostics) is real and functional.
> Everything *external* (WooCommerce, M-Pesa, Meta, TikTok, Telegram, LLM providers) runs through
> swappable adapters in clearly-labelled **MOCK/OFF mode** until credentials and a hosted backend exist.
> The app never pretends an integration is live.

---

## Architecture

```
USER INPUT
   ↓
INTENT DETECTION      (rule engine, confidence-scored — replaceable by an LLM adapter)
   ↓
CONTEXT RETRIEVAL     (live state: sales window, stock, tasks, skills)
   ↓
MEMORY RETRIEVAL      (7 categories, searchable)
   ↓
TOOL PLANNING         (16-tool registry, each: name · schema · risk · logging)
   ↓
EXECUTION             (risk-gated: LOW auto · MEDIUM contextual · HIGH always confirmed)
   ↓
VALIDATION            (FACT vs ESTIMATE vs RECOMMENDATION labels; refusals over fabrication)
   ↓
RESPONSE              (reasoning trace + tool calls exposed in the UI)
   ↓
MEMORY / AUDIT UPDATE
```

### Module map (src/lib)

| Module | Responsibility |
|---|---|
| `types.ts` | All domain models (products, sales, tasks, skills, memories, audit…) |
| `seed.ts` | Deterministic first-run data: 12 SKUs, 14-day ledger, suppliers, competitors |
| `store.ts` | State kernel: pub/sub + localStorage persistence, event bus, audit logger, NEW ORDER & LOW STOCK pipelines, health monitor. **This is the swappable seam** — replace internals with REST/Socket.IO + Postgres without touching the UI |
| `brain.ts` | Intelligence layer: intent detection, tool registry, handlers, risk-gated pending actions, daily report, decision engine |
| `sim.ts` | Simulation engine — [SIM]-labelled events through the *real* pipeline |
| `audio.ts` | WebAudio synth SFX (sale/notify/error), volume + mute |
| `voice.ts` | Mic enumeration by device ID (no hard-coded indexes), live RMS level test with sample-rate/channel reporting, honest error mapping, speech recognition + TTS |

### UI (src/components)

`CommandCenter` (chat + pipeline strip + tool chips + confirmations) · `Business` (KPIs, ledger,
pricing advisor, opportunities, expenses, customers) · `Operations` (Projects/Tasks/Learning) ·
`Analytics` (hand-rolled SVG charts) · `System` (Memory / Integrations / Security / Settings) ·
`App` (boot sequence, shell, live activity rail, event→sound/flash wiring).

---

## What is REAL vs MOCK right now

| Capability | Mode | Notes |
|---|---|---|
| Memory (7 categories, CRUD, audit) | **REAL** | localStorage; export/import/factory-reset |
| Business math (revenue, profit, margin, velocity, days-of-cover) | **REAL** | revenue ≠ profit enforced everywhere |
| NEW ORDER / LOW STOCK pipelines | **REAL** | validate → ledger → metrics → notify → audit |
| Tool registry + audit log + RBAC model | **REAL** | 16 tools; every action logged with risk + status |
| Voice: mic diagnostics, recognition, TTS | **REAL** | browser Web APIs; honest failure reporting |
| Daily intelligence report | **REAL** | computed from live state, FACT/ESTIMATE labelled |
| Simulation events | **REAL, labelled [SIM]** | exercises the true pipeline |
| WooCommerce / M-Pesa / Telegram / Meta / TikTok / OpenAI / Zapier | **MOCK/OFF** | adapters designed; need credentials + hosted backend |
| Auth, HTTPS, webhook signatures, rate limiting | **DESIGNED** | checklist in Security panel; needs the backend phase |

## Backend path (when you host it)

1. Stand up Express + Socket.IO + Postgres (schema mirrors `types.ts` 1:1; use migrations).
2. Replace `store.ts` internals with API calls — the pub/sub contract stays identical.
3. Move credentials to server-side env vars (`.env`, never frontend):
   `AI_API_KEY · DATABASE_URL · JWT_SECRET · WOOCOMMERCE_KEY · WOOCOMMERCE_SECRET ·
   MPESA_CONSUMER_KEY · MPESA_CONSUMER_SECRET · TELEGRAM_BOT_TOKEN · META_ACCESS_TOKEN ·
   TIKTOK_CLIENT_KEY · EMAIL_PROVIDER_KEY` — provide `.env.example` with blanks only.
4. Point the WooCommerce `order.created` webhook at the relay — it feeds the same pipeline the
   simulator uses today.

## Testing

- `npm run build` — production bundle (verified passing).
- `npm run typecheck` — full strict TS check.
- Manual pass: boot → "daily report" → "simulate an order" (watch feed/KPIs/audit) →
  record a real sale with qty > stock (must be rejected honestly) → Settings → Test mic →
  Memory delete (appears in audit) → "set price of JBL to 5000" (requires confirmation).

## Security notes

No secrets in source. Credentials are masked after storage and flagged as dev-mode-only.
HIGH-risk actions (memory wipe, factory reset, price changes) require explicit confirmation and
are audit-logged with `confirmed: true`. Destructive operations are never performed silently.

## Voice Link — two-way conversation

The floating orb (bottom-right, every section) opens a full-duplex voice channel:
mic → speech-to-text → brain → tools → spoken response → auto-resume listening.
- **Continuous mode** (toggle in the panel) keeps the conversation rolling; disable it for one command per tap.
- **Barge-in**: start speaking and JARVIS stops mid-sentence.
- **"JARVIS stop"** by voice triggers the computer-control emergency stop.
- Mic failures (permission, busy device, unsupported browser) are reported honestly in the panel.
- Every exchange is mirrored into the Command Center transcript with full trace/tools.

## Running as its own app

JARVIS OS is an installable PWA — it opens in its own window with its own icon, not a browser tab:
- Topbar → **Install app** (uses the browser's native `beforeinstallprompt`; shows **APP MODE** once installed / launched via "Add to Home Screen").
- Topbar → **Open app** opens a dedicated popup window right now, no install needed.
- `public/manifest.webmanifest` declares `display: standalone`; `public/sw.js` caches the app shell so the installed app launches offline.
- The service worker registers in production builds only (`import.meta.env.PROD`).

## Computer Control subsystem (modules 60-96)

New section: **Computer** in the sidebar, driven by `src/lib/computer.ts`.

**Execution model.** Every significant command follows OBSERVE → PLAN → ACT → OBSERVE → VERIFY.
The executor enforces per-action timeouts (`compSettings.autoTimeoutMs`), loop protection
(3 identical failures → stop + explain), and checks the emergency-stop flag between every step.

**What is REAL in the browser sandbox:**
- Screen capture via `getDisplayMedia` (screen/window/tab), retention-limited, permission-gated
- System vitals: cores, JS heap, storage quota/usage, network, DPR + display geometry,
  `screen.isExtended` multi-monitor detection, event-loop latency probe
- Sandboxed terminal: `ls/tree/cat/git status/git diff/npm test/npm run dev/ps/kill…` execute
  for real against the project model; every command is risk-classified first
- Dev-service lifecycle with streamed boot logs
- Mic enumeration by device ID (never hard-coded indexes)

**What is PLAN + DEMONSTRATE (TEST MODE, honestly labelled):**
native mouse/keyboard/window/app launching. These produce step-by-step plans marked TEST,
logged to the Computer Action Log and the audit trail — never reported as executed.

**Permission levels.** L0 OBSERVE · L1 SAFE ACTION · L2 MODIFICATION · L3 HIGH RISK (always
confirms). Destructive commands (`rm`, `del`, `format`, `DROP TABLE`, `sudo`, fork bombs) are
blocked at the classifier and demonstrated only; `git push` runs a pre-push secret scan that
flags `.env`-style credential files.

**Emergency stop.** Dashboard button (two-stage confirm), `Esc` / `Ctrl+.` while a plan runs,
or say "JARVIS, stop". After a stop, nothing resumes until a new command is issued.

**Cross-platform design.** `osAdapters()` declares Windows (UIAutomation + SendInput), Linux
(AT-SPI + xdotool), macOS (Accessibility API + CGEvent) companion-agent requirements. The
planner/verifier layer is OS-agnostic — attaching the native agent changes nothing upstream.

**Try:** "run my project" (streams the verify loop) · "find the error" (diagnose → confirm →
fix → re-test) · "stop the server" (confirm-gated kill) · "delete this folder" (L3 gate demo) ·
"take a screenshot" (real) · "is node installed" · "git status" · "find laptop suppliers".
