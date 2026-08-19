/* J.A.R.V.I.S OS — simulation engine
 * Generates clearly-labelled [SIM] business events so the full pipeline
 * (validate → ledger → metrics → notify → audit) can run without live credentials.
 * Every simulated event is marked in the feed, ledger and audit log. */

import { getState, recordSale, logEvent, notify } from "./store";

let timer: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;

function tick() {
  const s = getState();
  if (!s.settings.simOn) return;
  tickCount++;
  const roll = Math.random();

  if (roll < 0.62) {
    // simulated NEW ORDER through the real pipeline
    const candidates = s.products.filter((p) => p.stock > 1);
    if (!candidates.length) {
      logEvent("SIMULATION", "No stock above safety level — simulated demand skipped (inventory realism preserved)", "info", true);
      return;
    }
    // weight toward fast movers
    const weighted = [...candidates, ...candidates.filter((p) => p.sold14d > 4)];
    const p = weighted[Math.floor(Math.random() * weighted.length)];
    recordSale({ productId: p.id, qty: 1, channel: Math.random() > 0.4 ? "mpesa" : "online", simulated: true });
  } else if (roll < 0.78) {
    logEvent("SIMULATION", "Price watch: competitor marketplace listing shifted ~2% on refurb laptops — no action needed yet", "info", true);
  } else if (roll < 0.9) {
    const fast = [...s.products].sort((a, b) => b.sold14d - a.sold14d)[0];
    notify("Simulated insight", `${fast.name} search interest appears to be rising (mock signal). Consider featuring it this week.`, "info", true);
  } else {
    logEvent("SIMULATION", "Channel scan: 3 new IG shops in the accessories niche this week (mock competitive sweep)", "info", true);
  }
}

export function startSim() {
  stopSim();
  const interval = Math.max(20, getState().settings.simIntervalSec) * 1000;
  timer = setInterval(tick, interval);
}

export function stopSim() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function simTickNow() {
  tick();
}
