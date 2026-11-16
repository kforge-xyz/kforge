// The agent's passphrase in the system keychain (macOS Keychain, or the Secret Service on Linux),
// so it never has to sit in a settings file. One entry per agent folder.
import { execFileSync } from "node:child_process";
import { platform } from "node:os";

const SERVICE = "kforge-agent";
const quiet = { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };
const has = (cmd) => { try { execFileSync("which", [cmd], { stdio: "ignore" }); return true; } catch { return false; } };

export function available() {
  if (platform() === "darwin") return true;
  if (platform() === "linux") return has("secret-tool");
  return false;
}
export function get(account) {
  try {
    if (platform() === "darwin") return execFileSync("security", ["find-generic-password", "-s", SERVICE, "-a", account, "-w"], quiet).trim() || null;
    if (platform() === "linux" && has("secret-tool")) return execFileSync("secret-tool", ["lookup", "service", SERVICE, "account", account], quiet).trim() || null;
  } catch { /* not stored */ }
  return null;
}
export function set(account, secret) {
  if (platform() === "darwin") { execFileSync("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", account, "-l", "KForge agent", "-w", secret], { stdio: "ignore" }); return; }
  if (platform() === "linux" && has("secret-tool")) { execFileSync("secret-tool", ["store", "--label=KForge agent", "service", SERVICE, "account", account], { input: secret, stdio: ["pipe", "ignore", "ignore"] }); return; }
  throw new Error("no system keychain available here: keep using KFORGE_AGENT_PASSPHRASE");
}
export function remove(account) {
  try {
    if (platform() === "darwin") execFileSync("security", ["delete-generic-password", "-s", SERVICE, "-a", account], { stdio: "ignore" });
    else if (platform() === "linux" && has("secret-tool")) execFileSync("secret-tool", ["clear", "service", SERVICE, "account", account], { stdio: "ignore" });
  } catch { /* nothing stored */ }
}
