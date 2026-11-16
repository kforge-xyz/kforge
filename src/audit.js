// Local audit log: one JSON line per action, check and refusal. Never keys, passphrases or signatures.
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { DIR } from "./wallet.js";
export function audit(event, details = {}) {
  appendFileSync(join(DIR, "audit.log"), JSON.stringify({ at: new Date().toISOString(), event, ...details }) + "\n", { mode: 0o600 });
}
