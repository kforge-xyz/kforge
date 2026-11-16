// Kaspa transaction signature hash (schnorr), computed from txJson exactly as rusty-kaspa v2.0.1
// does it (consensus/core/src/hashing/sighash.rs, calc_schnorr_signature_hash). The agent signs only
// hashes it computed itself, from a transaction it has checked: never a hash someone else supplied.
import { blake2b } from "@noble/hashes/blake2b";
import { bytesToHex, hexToBytes, utf8ToBytes, concatBytes } from "@noble/hashes/utils";

const KEY = utf8ToBytes("TransactionSigningHash");
const hash = (bytes) => blake2b(bytes, { dkLen: 32, key: KEY });
const ZERO = new Uint8Array(32);
export const SIGHASH_ALL = 1;

class Writer {
  constructor() { this.parts = []; }
  bytes(b) { this.parts.push(b); return this; }
  uint(n, size) { const b = new Uint8Array(size); let v = BigInt(n); for (let i = 0; i < size; i++) { b[i] = Number(v & 0xffn); v >>= 8n; } return this.bytes(b); }
  u8(n) { return this.uint(n, 1); }
  u16(n) { return this.uint(n, 2); }
  u32(n) { return this.uint(n, 4); }
  u64(n) { return this.uint(n, 8); }
  varBytes(b) { return this.u64(b.length).bytes(b); }
  done() { return concatBytes(...this.parts); }
}

/** "0000aa20…" -> version (first 2 bytes) and script bytes. */
export function parseSpk(s) { return { version: parseInt(s.slice(0, 4), 16), script: hexToBytes(s.slice(4)) }; }
const h32 = (hex) => hexToBytes(hex);
function writeSpk(w, spk) { const { version, script } = parseSpk(spk); w.u16(version).varBytes(script); }

function writeOutput(w, o, txVersion) {
  w.u64(o.value);
  writeSpk(w, o.scriptPublicKey);
  if (txVersion >= 1) {
    w.u8(o.covenant ? 1 : 0);
    if (o.covenant) w.u16(o.covenant.authorizingInput).bytes(h32(o.covenant.covenantId));
  }
}

/** The schnorr signature hash of input `index` of a parsed txJson, as hex. Only SIGHASH_ALL. */
export function sighash(tx, index, hashType = SIGHASH_ALL) {
  if (hashType !== SIGHASH_ALL) throw new Error("only SIGHASH_ALL is supported");
  const input = tx.inputs[index];
  if (!input || !input.utxo) throw new Error(`input ${index} or its utxo is missing`);
  const prev = new Writer(); for (const i of tx.inputs) prev.bytes(h32(i.transactionId)).u32(i.index);
  const seq = new Writer(); for (const i of tx.inputs) seq.u64(i.sequence);
  const outs = new Writer(); for (const o of tx.outputs) writeOutput(outs, o, tx.version);
  const nativeEmpty = /^0+$/.test(tx.subnetworkId) && (tx.payload || "") === "";
  const payloadHash = nativeEmpty ? ZERO : hash(new Writer().varBytes(hexToBytes(tx.payload || "")).done());

  const w = new Writer();
  w.u16(tx.version).bytes(hash(prev.done())).bytes(hash(seq.done()));
  if (tx.version < 1) { const s = new Writer(); for (const i of tx.inputs) s.u8(i.sigOpCount || 0); w.bytes(hash(s.done())); }
  w.bytes(h32(input.transactionId)).u32(input.index);
  writeSpk(w, input.utxo.scriptPublicKey);
  w.u64(input.utxo.amount).u64(input.sequence);
  if (tx.version < 1) w.u8(input.sigOpCount || 0);
  w.bytes(hash(outs.done())).u64(tx.lockTime).bytes(hexToBytes(tx.subnetworkId)).u64(tx.gas).bytes(payloadHash).u8(hashType);
  return bytesToHex(hash(w.done()));
}
