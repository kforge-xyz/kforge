// Indicator maths against known results, before it is used on real tokens.
import { prices, candles, rsi, macd, sma, emaSeries, bollinger, compute } from "../src/indicators.js";
const ok = (c, what) => { console.log(`${c ? "ok  " : "FAIL"} ${what}`); if (!c) process.exitCode = 1; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// 1. fee correction: a curve sell recorded net of 0.9801 maps back to the curve price
const p = prices([{ ts: 1, side: "sell", phase: "curve", tokens: 1_000_000, kas: 615628923 }]);
ok(near(p[0].price, 6.28128682, 1e-6), `curve sell back to curve price (6.2813 KAS/step): ${p[0].price.toFixed(6)}`);
// 2. Wilder RSI on these exact closes, by hand: gains 3.34/14, losses 1.40/14, RS 2.386, RSI 70.46
//    (the textbook 70.53 uses the same series at more decimal places)
const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
ok(near(rsi(closes).value, 70.46, 0.01), `RSI(14) on the reference closes = 70.46 (by hand): ${rsi(closes).value}`);
ok(rsi([1, 2, 3]).value === null && /needs 15/.test(rsi([1, 2, 3]).reason), "RSI refuses with too few candles");
ok(rsi(Array(20).fill(5)).value === null, "RSI refuses when the price never moved");
ok(rsi(Array.from({ length: 20 }, (_, i) => i + 1)).value === 100, "RSI is 100 on a steady rise");
// 3. averages and bands
ok(sma([1, 2, 3, 4], 4) === 2.5 && near(emaSeries([1, 2, 3, 4, 5], 3).at(-1), 4), "SMA and EMA basics");
ok(bollinger(Array(20).fill(10)).upper === 10, "Bollinger bands collapse on a flat price");
ok(macd(Array.from({ length: 40 }, (_, i) => i)).macd > 0, "MACD positive on a rising series");
// 4. candles fill gaps with the previous close
const cs = candles([{ ts: 0, price: 1, volumeKas: 1 }, { ts: 7200, price: 2, volumeKas: 1 }], 3600, 7200);
ok(cs.length === 3 && cs[1].c === 1 && cs[1].v === 0 && cs[2].c === 2, "gaps filled with the previous close");
ok(compute(cs).data.reliability === "thin", "few trades are reported as thin");
