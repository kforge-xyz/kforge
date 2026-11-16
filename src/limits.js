// Spending limits, the naming rule and today's ledger. Checked before anything is prepared, recorded after a submit.
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { DIR } from "./wallet.js";

const LIMITS = join(DIR, "limits.json"), LEDGER = join(DIR, "ledger.json");
const DEFAULTS = {
  maxPerTradeKas: 50, maxPerDayKas: 300, maxLaunchesPerDay: 3,
  // launches are spread out: at most one every this many minutes (0 = no gap)
  minMinutesBetweenLaunches: 120,
  // the most the agent will ever pay as the agent launch fee (the API says the current fee; this caps it)
  maxLaunchFeeKas: 500,
  // the only address withdrawals can ever go to: your own wallet (set by you, never by the AI)
  withdrawAddress: "",
  // words a launch's name, ticker or description may not contain (edit freely)
  blockedWords: ["ai", "agent", "bot", "auto", "automatic", "autonomous", "robot", "gpt", "chatgpt", "claude", "grok", "llm", "openai", "anthropic"],
};
const SOMPI = 100_000_000n;
const today = () => new Date().toISOString().slice(0, 10);

function privateFile(path) {
  if (existsSync(path) && (statSync(path).mode & 0o077) !== 0) throw new Error(`${path} is readable by other users: run chmod 600 on it`);
}
export function limits() {
  privateFile(LIMITS);
  if (!existsSync(LIMITS)) writeFileSync(LIMITS, JSON.stringify(DEFAULTS, null, 2), { mode: 0o600 });
  const L = { ...DEFAULTS, ...JSON.parse(readFileSync(LIMITS, "utf8")) };
  // settings from the Claude Desktop extension's form take precedence (the AI can't change either)
  const num = (k) => (process.env[k] !== undefined && process.env[k] !== "" && Number(process.env[k]) >= 0 ? Number(process.env[k]) : null);
  if (num("KFORGE_MAX_PER_TRADE") !== null) L.maxPerTradeKas = num("KFORGE_MAX_PER_TRADE");
  if (num("KFORGE_MAX_PER_DAY") !== null) L.maxPerDayKas = num("KFORGE_MAX_PER_DAY");
  if (num("KFORGE_MAX_LAUNCHES") !== null) L.maxLaunchesPerDay = num("KFORGE_MAX_LAUNCHES");
  if (process.env.KFORGE_WITHDRAW_ADDRESS) L.withdrawAddress = process.env.KFORGE_WITHDRAW_ADDRESS.trim();
  return L;
}
function ledger() {
  const l = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {};
  // a new day resets spend and the launch count, but keeps the last launch time for the gap rule
  return l.date === today() ? l : { date: today(), spentSompi: "0", launches: 0, lastLaunchAt: l.lastLaunchAt || 0 };
}
/** Refuse a trade that would break the per-trade or per-day limit. */
export function assertSpend(costSompi) {
  const L = limits(), led = ledger();
  if (costSompi > BigInt(L.maxPerTradeKas) * SOMPI) throw new Error(`limit: a trade is at most ${L.maxPerTradeKas} KAS`);
  if (BigInt(led.spentSompi) + costSompi > BigInt(L.maxPerDayKas) * SOMPI) throw new Error(`limit: at most ${L.maxPerDayKas} KAS a day (spent ${Number(BigInt(led.spentSompi)) / 1e8} today)`);
}
export function assertLaunch() {
  const L = limits(), led = ledger();
  if (led.launches >= L.maxLaunchesPerDay) throw new Error(`limit: at most ${L.maxLaunchesPerDay} launches a day`);
  const gapMs = (L.minMinutesBetweenLaunches || 0) * 60_000;
  if (gapMs && led.lastLaunchAt && Date.now() - led.lastLaunchAt < gapMs) {
    const wait = Math.ceil((gapMs - (Date.now() - led.lastLaunchAt)) / 60_000);
    throw new Error(`limit: at most one launch every ${L.minMinutesBetweenLaunches} minutes (next in ${wait} min)`);
  }
}
/** Refuse a name, ticker or description with a blocked word: short words (3 letters or fewer) as whole words, longer ones anywhere. */
export function assertNaming({ name = "", ticker = "", desc = "" }) {
  const words = limits().blockedWords.map((w) => w.toLowerCase());
  const text = `${name} ${desc}`.toLowerCase(), t = ticker.toLowerCase();
  for (const w of words) {
    const inText = w.length <= 3 ? new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(text) : text.includes(w);
    const inTicker = (w.length >= 3 && t.includes(w)) || (w === "ai" && (t.startsWith("ai") || t.endsWith("ai")));
    if (inText || inTicker) throw new Error(`naming rule: "${w}" is not allowed in a name, ticker or description`);
  }
}
export function record({ spentSompi = 0n, launch = false }) {
  const led = ledger();
  led.spentSompi = (BigInt(led.spentSompi) + spentSompi).toString();
  if (launch) { led.launches += 1; led.lastLaunchAt = Date.now(); }
  writeFileSync(LEDGER, JSON.stringify(led, null, 2), { mode: 0o600 });
}
