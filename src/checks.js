// Checks every transaction before the agent signs it. KAS may leave the agent's wallet only for what the
// action needs; anything else is refused before a signature is made.
import { sighash } from "./sighash.js";
export const SOMPI = 100_000_000n;
export const kas = (sompi) => (Number(sompi) / 1e8).toFixed(8).replace(/\.?0+$/, "");

/** The agent's own pay-to-public-key script, as txJson writes it: version 0000, OP_DATA_32 <key> OP_CHECKSIG. */
export const agentSpk = (xonlyHex) => "0000" + "20" + xonlyHex + "ac";

/**
 * Check a prepared transaction; returns the KAS it gains for the agent (negative = it costs).
 * - every input to sign is the agent's own coin, or (tokenCovId) a holding of the token being traded
 * - maxCost: the agent may lose at most this much KAS; minNet: it must gain at least this much
 */
export function checkTx(tx, signIndexes, mySpk, { maxCost = null, minNet = null, tokenCovId = null } = {}, what = "transaction") {
  for (const i of signIndexes) {
    const u = tx.inputs[i]?.utxo;
    if (!u) throw new Error(`${what}: input ${i} has no utxo`);
    const ok = u.scriptPublicKey === mySpk || (tokenCovId && u.covenantId === tokenCovId);
    if (!ok) throw new Error(`${what}: refusing to sign input ${i}, it is not the agent's coin or holding`);
  }
  const mine = tx.inputs.filter((i) => i.utxo?.scriptPublicKey === mySpk).reduce((s, i) => s + BigInt(i.utxo.amount), 0n);
  const back = tx.outputs.filter((o) => o.scriptPublicKey === mySpk).reduce((s, o) => s + BigInt(o.value), 0n);
  const net = back - mine;
  if (maxCost !== null && -net > maxCost) throw new Error(`${what}: would cost ${kas(-net)} KAS, more than the allowed ${kas(maxCost)} KAS`);
  if (minNet !== null && net < minNet) throw new Error(`${what}: would return ${kas(net)} KAS, less than the minimum ${kas(minNet)} KAS`);
  return net;
}

/** The API's sighash must equal the one computed here; a mismatch means something is wrong. */
export function checkSighash(tx, index, apiSighash, what) {
  if (apiSighash && sighash(tx, index) !== apiSighash) throw new Error(`${what}: the API's sighash differs from the one computed here; refusing`);
}

/** An agent launch's curve genesis must pay exactly the agent fee to the treasury and name this agent (key "op"). */
export function checkAgentLaunch(curveTx, treasurySpk, agentId, fee) {
  const feeOuts = curveTx.outputs.filter((o) => o.scriptPublicKey === treasurySpk);
  if (feeOuts.length !== 1 || BigInt(feeOuts[0].value) !== fee) throw new Error(`curve genesis: expected exactly one ${kas(fee)} KAS fee output to the treasury`);
  const payload = Buffer.from(curveTx.payload, "hex").toString("utf8");
  const j = JSON.parse(payload.slice(payload.indexOf("{")));
  if (j.op !== agentId) throw new Error(`curve genesis: the descriptor names "${j.op}", not "${agentId}"`);
  return j;
}
