// Kaspa primitives for KForge agents: addresses and wallet-style message signatures.
import { schnorr } from "@noble/curves/secp256k1";
import { blake2b } from "@noble/hashes/blake2b";
import { bytesToHex, hexToBytes, utf8ToBytes, randomBytes } from "@noble/hashes/utils";

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];

function polymod(values) {
  let c = 1n;
  for (const d of values) {
    const c0 = c >> 35n;
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);
    for (let i = 0; i < 5; i++) if ((c0 >> BigInt(i)) & 1n) c ^= GEN[i];
  }
  return c ^ 1n;
}

function convertBits(data, from, to) {
  let acc = 0, bits = 0;
  const out = [], max = (1 << to) - 1;
  for (const b of data) {
    acc = (acc << from) | b; bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & max); }
  }
  if (bits) out.push((acc << (to - bits)) & max);
  return out;
}

/** A schnorr (x-only, 32-byte) public key as a Kaspa address, e.g. prefix "kaspa" or "kaspatest". */
export function addressFromXOnly(prefix, xonly) {
  const payload = convertBits([0, ...xonly], 8, 5); // version 0 = schnorr public key
  const pm = polymod([...[...prefix].map((c) => c.charCodeAt(0) & 31), 0, ...payload, 0, 0, 0, 0, 0, 0, 0, 0]);
  const checksum = Array.from({ length: 8 }, (_, i) => Number((pm >> BigInt(5 * (7 - i))) & 31n));
  return `${prefix}:${[...payload, ...checksum].map((d) => CHARSET[d]).join("")}`;
}

/** A standard (schnorr, version 0) Kaspa address back to its x-only key; throws on a bad checksum or another type. */
export function xOnlyFromAddress(address) {
  const [prefix, data] = String(address || "").toLowerCase().split(":");
  if (!prefix || !data) throw new Error("not a Kaspa address");
  const vals = [...data].map((c) => { const v = CHARSET.indexOf(c); if (v < 0) throw new Error("not a Kaspa address"); return v; });
  if (polymod([...[...prefix].map((c) => c.charCodeAt(0) & 31), 0, ...vals]) !== 0n) throw new Error("the address checksum is wrong");
  const five = vals.slice(0, -8);
  let acc = 0, bits = 0; const bytes = [];
  for (const v of five) { acc = (acc << 5) | v; bits += 5; while (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 255); } }
  if (bytes[0] !== 0 || bytes.length !== 33) throw new Error("only standard Kaspa addresses are supported");
  return { prefix, xonly: Uint8Array.from(bytes.slice(1)) };
}

export function newPrivateKey() { return schnorr.utils.randomPrivateKey(); }
export function xOnlyOf(priv) { return schnorr.getPublicKey(priv); }

/** The digest a Kaspa wallet signs for a text message. */
export function messageDigest(message) {
  return blake2b(utf8ToBytes(message), { dkLen: 32, key: utf8ToBytes("PersonalMessageSigningHash") });
}

/** Sign a text message like a Kaspa wallet does: hex of a 64-byte schnorr signature. */
export function signMessage(priv, message) {
  return bytesToHex(schnorr.sign(messageDigest(message), priv, randomBytes(32)));
}

export function verifyMessage(xonly, message, sigHex) {
  return schnorr.verify(hexToBytes(sigHex), messageDigest(message), xonly);
}

export { bytesToHex, hexToBytes };
