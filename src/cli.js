#!/usr/bin/env node
// KForge agent command line: a thin wrapper over src/actions.js (the same actions the MCP server uses).
import * as wallet from "./wallet.js";
import * as A from "./actions.js";
import { limits } from "./limits.js";

const [cmd, ...args] = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const show = (x) => console.log(JSON.stringify(x, null, 2));

async function main() {
  switch (cmd) {
    case "init": {
      const r = wallet.create(opt("network") || "testnet");
      limits();
      console.log(`agent wallet created (${r.network})\naddress: ${r.address}\nstored encrypted at ${wallet.FILE}\nlimits in ${wallet.DIR}/limits.json\nfund it only with what you're willing to let the agent spend`);
      break;
    }
    case "setup": { const { setup } = await import("./setup.js"); await setup(); break; }
    case "serve": await import("./server.js"); return;
    case "withdraw": {
      if (!process.stdin.isTTY) throw new Error("withdraw needs you at the keyboard: run it in a terminal");
      const { askHidden } = await import("./setup.js");
      process.env.KFORGE_NO_KEYCHAIN = "1"; // withdrawals never use the keychain
      const typed = await askHidden("Passphrase (typed each time for withdrawals)");
      if (!typed) throw new Error("no passphrase typed: nothing was sent");
      process.env.KFORGE_AGENT_PASSPHRASE = typed;
      wallet.unlock(); // a wrong passphrase stops here
      show(await A.withdraw({ kas: opt("kas"), all: args.includes("--all") }));
      break;
    }
    case "paper-report": { const R = await import("./runner.js"); show(await R.paperReport()); break; }
    case "go-live": {
      if (!process.stdin.isTTY) throw new Error("go-live needs you at the keyboard: run it in a terminal");
      const R = await import("./runner.js"); const { ask } = await import("./setup.js");
      const cfg = R.config();
      if (cfg.mode === "live") { console.log("Already live. Start it with: kforge run --loop --live"); break; }
      console.log("\nYour paper run:"); show(await R.paperReport());
      const b = await A.balance(); const L = limits();
      console.log(`\nWallet (${b.network}): ${b.address}\nReal balance: ${b.kas} KAS`);
      if (!(b.kas > 0)) throw new Error("the wallet has no KAS: fund it first");
      console.log(`Limits: ${L.maxPerTradeKas} KAS per trade, ${L.maxPerDayKas} KAS a day, ${L.maxLaunchesPerDay} launches a day, launch fee at most ${L.maxLaunchFeeKas} KAS`);
      console.log(`Stop rules: pause at ${cfg.stop?.maxDrawdownPct != null ? "-" + cfg.stop.maxDrawdownPct + "%" : "off"}, stop below ${cfg.stop?.minBalanceKas != null ? cfg.stop.minBalanceKas + " KAS" : "off"}`);
      console.log("From now on these protect real KAS. To change them, edit limits.json or runner.json first, then run go-live again.\n");
      const c = await ask('Type "go live" to switch this agent to real trading');
      if (c.trim().toLowerCase() !== "go live") { console.log("Not switched: still in paper mode."); break; }
      cfg.mode = "live"; R.saveConfig(cfg); await R.resetBaseline(); await R.clearStop();
      console.log("Switched to live. The stop rules will measure from the real balance.\nStart it: kforge run --loop --live   (or restart its service)");
      break;
    }
    case "keychain-save": wallet.saveToKeychain(); console.log(`passphrase stored in the system keychain for ${wallet.DIR}; you can now unset KFORGE_AGENT_PASSPHRASE`); break;
    case "keychain-forget": wallet.forgetKeychain(); console.log(`passphrase removed from the keychain for ${wallet.DIR}`); break;
    case "info": { const i = wallet.info(); show({ ...i, apiKey: i.apiKey ? i.apiKey.slice(0, 6) + "…" : null, limits: limits() }); break; }
    case "register": show(await A.register({ id: opt("id"), name: opt("name"), desc: opt("desc") || "", model: opt("model") || "" })); break;
    case "launch": show(await A.launch({ name: opt("name") || "", ticker: opt("ticker") || "", desc: opt("desc") || "", image: opt("image") || "", x: opt("x") || "", web: opt("web") || "", tg: opt("tg") || "" })); break;
    case "buy": show(await A.buy({ id: opt("token"), kasBudget: opt("kas") })); break;
    case "sell": show(await A.sell({ id: opt("token"), tokens: opt("tokens") })); break;
    case "quote": show(await A.quotePublic({ id: opt("token"), side: opt("side") || "buy", kasBudget: opt("kas"), tokens: opt("tokens") })); break;
    case "balance": show(await A.balance()); break;
    case "portfolio": show(await A.portfolio()); break;
    case "trending": show(await A.trending({ timeframe: opt("timeframe") || "24h" })); break;
    case "token": show(await A.token({ id: opt("token") })); break;
    case "indicators": show(await A.indicators({ id: opt("token"), interval: opt("interval") || "1h" })); break;
    case "runner-config": { const { config } = await import("./runner.js"); show(config()); break; }
    case "run": {
      const R = await import("./runner.js");
      if (args.includes("--loop")) await R.loop({ live: args.includes("--live") });
      else show(await R.cycle());
      break;
    }
    case "stop": { const R = await import("./runner.js"); R.requestStop(); console.log("kill switch on: the runner stops before its next cycle"); break; }
    case "resume": {
      const R = await import("./runner.js");
      await R.clearStop();
      if (args.includes("--reset")) { await R.resetBaseline(); console.log("kill switch off; the stop rules will measure from a new baseline at the next start"); }
      else console.log("kill switch off (the stop-rule baseline is kept; resume --reset starts a new one)");
      break;
    }
    case "set-model-key": {
      const key = process.env.KFORGE_MODEL_KEY;
      if (!key) throw new Error("export KFORGE_MODEL_KEY first (read -s keeps it off screen), then run set-model-key");
      wallet.saveModelKey(key);
      console.log("model key stored encrypted in the agent file; you can now unset KFORGE_MODEL_KEY");
      break;
    }
    default:
      console.log("usage: kforge init | info | register | launch | buy | sell | quote | balance | portfolio | trending | token  (see README)");
  }
}
main().catch((e) => { console.error("error:", e.message); process.exit(1); });
