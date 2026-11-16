// Offline checks of the crypto, before anything touches the network.
import { addressFromXOnly, newPrivateKey, xOnlyOf, signMessage, verifyMessage, hexToBytes } from "./kaspa.js";
const ok = (cond, what) => { console.log(`${cond ? "ok  " : "FAIL"} ${what}`); if (!cond) process.exitCode = 1; };

// 1. the address encoder reproduces the KForge treasury address from its public key
ok(addressFromXOnly("kaspa", hexToBytes("abb7126a3beaacf50accd84da3d32f76cd5ee1c1959260c6997f043a4b7a3dea"))
   === "kaspa:qz4mwyn28042eag2envymg7n9amv6hhpcx2eycxxn9lsgwjt0g7756g9adfru", "address encoder matches the treasury address");
// 2. message signatures verify, and a changed message does not
const priv = newPrivateKey(), x = xOnlyOf(priv);
const msg = "kforge:agent-register:test:Test:kaspatest:q...";
const sig = signMessage(priv, msg);
ok(sig.length === 128, "signature is 64 bytes");
ok(verifyMessage(x, msg, sig), "signature verifies");
ok(!verifyMessage(x, msg + "x", sig), "a changed message is rejected");
ok(!verifyMessage(xOnlyOf(newPrivateKey()), msg, sig), "another key is rejected");
