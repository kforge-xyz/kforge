// The agent's wallet: one key, created on this machine and stored encrypted. It never leaves.
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { newPrivateKey, xOnlyOf, addressFromXOnly, bytesToHex, hexToBytes } from "./kaspa.js";
import * as keychain from "./keychain.js";

export const DIR = process.env.KFORGE_HOME || join(homedir(), ".kforge");
export const FILE = join(DIR, "agent.json");
const PREFIX = { mainnet: "kaspa", testnet: "kaspatest" };

/** The passphrase: KFORGE_AGENT_PASSPHRASE if set, otherwise the system keychain entry for this agent folder. */
function passphrase() {
  // KFORGE_NO_KEYCHAIN (set for withdrawals) means only a passphrase typed by hand is accepted
  const p = process.env.KFORGE_AGENT_PASSPHRASE || (process.env.KFORGE_NO_KEYCHAIN ? null : keychain.get(DIR));
  if (!p || p.length < 12) throw new Error("no passphrase: run setup, or keychain-save, or set KFORGE_AGENT_PASSPHRASE (at least 12 characters)");
  return p;
}
/** Store the current passphrase in the keychain, after checking it really unlocks this wallet. */
export function saveToKeychain() {
  const p = process.env.KFORGE_AGENT_PASSPHRASE;
  if (!p) throw new Error("export KFORGE_AGENT_PASSPHRASE first (read -s keeps it off screen)");
  unlock();
  keychain.set(DIR, p);
}
export function forgetKeychain() { keychain.remove(DIR); }
function kdf(salt) { return scryptSync(passphrase(), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); }

export function exists() { return existsSync(FILE); }

/** Create a new agent wallet for a network ("testnet" or "mainnet"). Refuses to overwrite one. */
export function create(network) {
  if (!PREFIX[network]) throw new Error('network must be "testnet" or "mainnet"');
  if (exists()) throw new Error(`an agent wallet already exists at ${FILE}`);
  const priv = newPrivateKey();
  const address = addressFromXOnly(PREFIX[network], xOnlyOf(priv));
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", kdf(salt), iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(bytesToHex(priv), "utf8")), cipher.final()]);
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const record = { version: 1, network, address, kdf: "scrypt", cipher: "aes-256-gcm",
    salt: salt.toString("hex"), iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), key: ciphertext.toString("hex") };
  writeFileSync(FILE, JSON.stringify(record, null, 2), { mode: 0o600 });
  chmodSync(FILE, 0o600);
  return { network, address };
}

export function info() {
  const r = JSON.parse(readFileSync(FILE, "utf8"));
  return { network: r.network, address: r.address, agentId: r.agentId || null, apiKey: r.apiKey || null };
}

/** Decrypt the key (needs the passphrase). Checks it still matches the stored address. */
export function unlock() {
  const r = JSON.parse(readFileSync(FILE, "utf8"));
  const d = createDecipheriv("aes-256-gcm", kdf(Buffer.from(r.salt, "hex")), Buffer.from(r.iv, "hex"));
  d.setAuthTag(Buffer.from(r.tag, "hex"));
  let hex;
  try { hex = Buffer.concat([d.update(Buffer.from(r.key, "hex")), d.final()]).toString("utf8"); }
  catch { throw new Error("wrong passphrase, or the agent file was changed"); }
  const priv = hexToBytes(hex);
  if (addressFromXOnly(PREFIX[r.network], xOnlyOf(priv)) !== r.address) throw new Error("the decrypted key does not match the stored address");
  return { priv, network: r.network, address: r.address };
}

/** Save registration details (agent id and API key) next to the wallet. */
export function saveRegistration(agentId, apiKey) {
  const r = JSON.parse(readFileSync(FILE, "utf8"));
  r.agentId = agentId;
  if (apiKey) r.apiKey = apiKey;
  writeFileSync(FILE, JSON.stringify(r, null, 2), { mode: 0o600 });
}


/** Store the AI model's API key, encrypted with the same passphrase as the wallet key. */
export function saveModelKey(apiKey) {
  const r = JSON.parse(readFileSync(FILE, "utf8"));
  const salt = randomBytes(16), iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", kdf(salt), iv);
  const ct = Buffer.concat([c.update(Buffer.from(apiKey, "utf8")), c.final()]);
  r.modelKey = { salt: salt.toString("hex"), iv: iv.toString("hex"), tag: c.getAuthTag().toString("hex"), key: ct.toString("hex") };
  writeFileSync(FILE, JSON.stringify(r, null, 2), { mode: 0o600 });
}

/** The model API key: KFORGE_MODEL_KEY if set, otherwise the encrypted copy (needs the passphrase). */
export function modelKey() {
  if (process.env.KFORGE_MODEL_KEY) return process.env.KFORGE_MODEL_KEY;
  const m = JSON.parse(readFileSync(FILE, "utf8")).modelKey;
  if (!m) return null;
  const d = createDecipheriv("aes-256-gcm", kdf(Buffer.from(m.salt, "hex")), Buffer.from(m.iv, "hex"));
  d.setAuthTag(Buffer.from(m.tag, "hex"));
  try { return Buffer.concat([d.update(Buffer.from(m.key, "hex")), d.final()]).toString("utf8"); }
  catch { throw new Error("cannot decrypt the model key: wrong passphrase?"); }
}
