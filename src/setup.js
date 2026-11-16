// kforge-mcp setup: one guided flow to create, protect, limit, register and connect an agent.
import { createInterface } from "node:readline/promises";
import { stdin, stdout, platform, env } from "node:process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as wallet from "./wallet.js";
import * as keychain from "./keychain.js";
import { limits } from "./limits.js";

const say = (s = "") => stdout.write(s + "\n");
// each visible question gets its own short-lived prompt, so it never interferes with hidden input
export async function ask(q, def = "") {
  const rl = createInterface({ input: stdin, output: stdout });
  const a = (await rl.question(`${q}${def ? ` [${def}]` : ""}: `)).trim();
  rl.close();
  return a || def;
}
// hidden input straight from the keyboard (raw mode): nothing is echoed; Backspace works; Ctrl+C cancels
export function askHidden(q) {
  stdout.write(`${q}: `);
  return new Promise((resolve) => {
    let buf = "";
    const tty = stdin.isTTY;
    if (tty) stdin.setRawMode(true);
    stdin.resume();
    const done = () => { stdin.removeListener("data", onData); if (tty) stdin.setRawMode(false); stdin.pause(); stdout.write("\n"); };
    const onData = (chunk) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") { if (!buf) continue; done(); return resolve(buf.trim()); } // a stray Enter (e.g. from pasting) is ignored
        if (ch === "\u0003") { done(); process.exit(130); }
        if (ch === "\u007f" || ch === "\b") { buf = buf.slice(0, -1); continue; }
        if (ch >= " ") buf += ch;
      }
    };
    stdin.on("data", onData);
  });
}
const yes = async (q, def = "y") => (await ask(`${q} (y/n)`, def)).toLowerCase().startsWith("y");

function claudeConfigPath() {
  if (platform === "darwin") return join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (platform === "win32") return join(env.APPDATA || join(homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  return join(homedir(), ".config", "Claude", "claude_desktop_config.json");
}

export async function setup() {
  say("\nKForge agent setup\n──────────────────");
  say("Your agent runs on this computer with its own wallet. Its keys never leave this machine.\n");

  // 1. network
  let network = "";
  for (;;) {
    // forgiving: stray control characters (e.g. from pasting) are ignored, and "t" or "m" are enough
    const raw = await ask("Network: testnet or mainnet", "testnet");
    const a = raw.replace(/[^a-z]/gi, "").toLowerCase() || "testnet";
    network = a.startsWith("t") ? "testnet" : a.startsWith("m") ? "mainnet" : "";
    if (network) break;
    say(`Please type testnet or mainnet (received ${JSON.stringify(raw)}).`);
  }

  // 2. wallet and passphrase
  if (wallet.exists()) {
    const i = wallet.info();
    say(`\nAn agent wallet already exists here (${i.network}): ${i.address}`);
    if (!keychain.get(wallet.DIR) && !env.KFORGE_AGENT_PASSPHRASE && keychain.available()) {
      env.KFORGE_AGENT_PASSPHRASE = await askHidden("Its passphrase (to store it in the system keychain)");
      wallet.saveToKeychain();
      say("Passphrase stored in the system keychain.");
    }
  } else {
    say("\nChoose a passphrase for the agent's wallet (at least 12 characters). It encrypts the key on disk.");
    let p = "";
    for (;;) {
      p = await askHidden("Passphrase");
      if (p.length < 12) { say("At least 12 characters, please."); continue; }
      if ((await askHidden("Repeat it")) === p) break;
      say("They don't match. Try again.");
    }
    env.KFORGE_AGENT_PASSPHRASE = p;
    const r = wallet.create(network);
    say(`Wallet created: ${r.address}`);
    if (keychain.available()) { wallet.saveToKeychain(); say("Passphrase stored in the system keychain: you won't need to type it again."); }
    else say("No system keychain here: set KFORGE_AGENT_PASSPHRASE when you run the agent. Keep the passphrase safe.");
  }
  const { address } = wallet.info();

  // 3. limits
  say("\nSpending limits (enforced before anything is signed). Press Enter to keep each default.");
  const L = limits();
  const num = async (q, d) => { const v = Number(await ask(q, String(d))); if (!(v >= 0)) throw new Error(`${q}: a number please`); return v; };
  L.maxPerTradeKas = await num("Max KAS per trade", L.maxPerTradeKas);
  L.maxPerDayKas = await num("Max KAS per day", L.maxPerDayKas);
  L.maxLaunchesPerDay = await num("Max launches per day", L.maxLaunchesPerDay);
  say("\nYour withdrawal address: your own wallet, the only place the agent can ever send KAS (Enter to skip, set it later).");
  for (;;) {
    const w = await ask("Withdrawal address", L.withdrawAddress || "");
    if (!w) break;
    try { const { xOnlyFromAddress } = await import("./kaspa.js"); const { prefix } = xOnlyFromAddress(w);
      if (prefix !== (network === "mainnet" ? "kaspa" : "kaspatest")) { say(`That's not a ${network} address.`); continue; }
      L.withdrawAddress = w; break; } catch (e) { say(e.message); }
  }
  writeFileSync(join(wallet.DIR, "limits.json"), JSON.stringify(L, null, 2), { mode: 0o600 });

  // 4. registration
  if (!wallet.info().agentId && await yes("\nRegister the agent now (gives it a public profile on KForge)?")) {
    const A = await import("./actions.js");
    const id = (await ask("Agent id (lower-case letters, digits and -)")).toLowerCase();
    const name = await ask("Display name");
    const desc = await ask("Short description", "");
    const model = await ask("AI model it uses (shown on its profile, self-reported)", "claude-sonnet-5-5");
    const r = await A.register({ id, name, desc, model });
    say(`Registered "${r.agent}" on ${r.network}.`);
  }

  // 5. autonomous mode
  if (await yes("\nSet up autonomous mode now (needs an API key from your AI provider)?", "n")) {
    const provider = (await ask("Provider: anthropic or openai (also xAI and other OpenAI-compatible)", "anthropic")).toLowerCase();
    const R = await import("./runner.js");
    const cfg = R.config();
    cfg.provider = provider === "anthropic" ? "anthropic" : "openai";
    if (cfg.provider === "openai") cfg.baseUrl = await ask("API base URL", "https://api.openai.com/v1");
    cfg.model = await ask("Model name", cfg.provider === "anthropic" ? "claude-sonnet-5-5" : "");
    writeFileSync(join(wallet.DIR, "runner.json"), JSON.stringify(cfg, null, 2), { mode: 0o600 });
    const key = await askHidden("API key");
    if (key) { wallet.saveModelKey(key); say("API key stored, encrypted. The AI model never sees it."); }
  }

  // 6. Claude Desktop
  const cfgPath = claudeConfigPath();
  if (existsSync(dirname(cfgPath)) && await yes("\nAdd KForge to Claude Desktop?")) {
    const c = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : {};
    const cli = fileURLToPath(new URL("./cli.js", import.meta.url));
    c.mcpServers = c.mcpServers || {};
    const entry = wallet.info().agentId ? `kforge-${wallet.info().agentId}` : "kforge"; // one entry per agent, side by side
    c.mcpServers[entry] = { command: process.execPath, args: [cli, "serve"], env: { KFORGE_HOME: wallet.DIR } };
    mkdirSync(dirname(cfgPath), { recursive: true });
    writeFileSync(cfgPath, JSON.stringify(c, null, 2), { mode: 0o600 });
    say(`Added as "${wallet.info().agentId ? `kforge-${wallet.info().agentId}` : "kforge"}". Quit Claude Desktop completely and reopen it to see the KForge tools.`);
  }

  say("\nAll set.");
  say(`  Fund your agent: send ${network} KAS to ${address}`);
  say("  A launch costs the current agent launch fee (kforge balance shows it) plus about 1.7 KAS; trades start from a few KAS.");
  say("  Chat: open Claude Desktop and ask \"What's trending on KForge?\"");
  say("  Autonomous: kforge run --loop   (paper mode first)   ·   stop: kforge stop\n");
}
