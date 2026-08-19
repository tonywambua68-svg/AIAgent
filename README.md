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
