// The JavaScript sighash must reproduce, exactly, every hash our Rust code computed.
import { readFileSync } from "node:fs";
import { sighash } from "../src/sighash.js";
const vectors = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url)));
let pass = 0, fail = 0;
const reverseHashes = (tx) => {
  const r = (h) => h.match(/../g).reverse().join("");
  const t = structuredClone(tx);
  for (const i of t.inputs) { i.transactionId = r(i.transactionId); }
  for (const o of t.outputs) if (o.covenant) o.covenant.covenantId = r(o.covenant.covenantId);
  return t;
};
for (const v of vectors) {
  const tx = JSON.parse(v.txJson);
  v.sighashes.forEach((expected, i) => {
    const got = sighash(tx, i);
    if (got === expected) { pass++; console.log(`ok   ${v.name}, input ${i}`); return; }
    fail++;
    const rev = sighash(reverseHashes(tx), i) === expected;
    console.log(`FAIL ${v.name}, input ${i}\n     expected ${expected}\n     got      ${got}${rev ? "\n     (matches if 32-byte ids are byte-reversed)" : ""}`);
  });
}
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
