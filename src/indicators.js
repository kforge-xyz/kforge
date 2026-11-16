// Technical indicators for KForge tokens, computed in code from the token's trade history; the model
// reads them, it never calculates them. Curve sells are recorded net of two 1% fees, so they are put
// back to the curve price (÷ 0.9801), or every sell would look like a 2% drop.
export const INTERVALS = { "5m": 300, "15m": 900, "1h": 3600, "4h": 14400 };
const MAX_CANDLES = 500;

/** Trades -> fee-corrected prices in KAS per million tokens (one curve step), oldest first. */
export function prices(trades) {
  return trades.filter((t) => t.tokens > 0).sort((a, b) => a.ts - b.ts).map((t) => {
    let price = t.kas / (t.tokens / 1_000_000) / 1e8;
    if (t.phase === "curve" && t.side === "sell") price /= 0.9801;
    return { ts: t.ts, price, volumeKas: t.kas / 1e8 };
  });
}

/** Prices -> candles, gaps filled with the previous close and zero volume. */
export function candles(points, intervalSec, nowSec = Math.floor(Date.now() / 1000)) {
  if (!points.length) return [];
  const first = Math.floor(points[0].ts / intervalSec), last = Math.floor(nowSec / intervalSec);
  const start = Math.max(first, last - MAX_CANDLES + 1);
  const out = [];
  let prevClose = points.filter((p) => Math.floor(p.ts / intervalSec) < start).at(-1)?.price ?? points[0].price;
  for (let b = start, i = 0; b <= last; b++) {
    while (i < points.length && Math.floor(points[i].ts / intervalSec) < b) i++;
    const inside = [];
    while (i < points.length && Math.floor(points[i].ts / intervalSec) === b) inside.push(points[i++]);
    if (inside.length) {
      const ps = inside.map((p) => p.price);
      out.push({ t: b * intervalSec, o: ps[0], h: Math.max(...ps), l: Math.min(...ps), c: ps.at(-1), v: inside.reduce((s, p) => s + p.volumeKas, 0), trades: inside.length });
      prevClose = ps.at(-1);
    } else out.push({ t: b * intervalSec, o: prevClose, h: prevClose, l: prevClose, c: prevClose, v: 0, trades: 0 });
  }
  return out;
}

const need = (n, have) => ({ value: null, reason: `needs ${n} candles, has ${have}` });
const r = (x, d = 6) => (x == null || !isFinite(x) ? null : Number(x.toFixed(d)));
export const sma = (xs, n) => (xs.length < n ? null : xs.slice(-n).reduce((s, x) => s + x, 0) / n);
export function emaSeries(xs, n) {
  if (xs.length < n) return [];
  const k = 2 / (n + 1), out = [xs.slice(0, n).reduce((s, x) => s + x, 0) / n];
  for (let i = n; i < xs.length; i++) out.push(xs[i] * k + out.at(-1) * (1 - k));
  return out;
}
export function rsi(closes, n = 14) {
  if (closes.length < n + 1) return need(n + 1, closes.length);
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) gain += d; else loss -= d; }
  gain /= n; loss /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (gain === 0 && loss === 0) return { value: null, reason: "no price movement in the period" };
  return { value: r(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss), 2) };
}
export function macd(closes, fast = 12, slow = 26, signal = 9) {
  if (closes.length < slow + signal) return need(slow + signal, closes.length);
  const f = emaSeries(closes, fast), s = emaSeries(closes, slow);
  const line = s.map((v, i) => f[i + (slow - fast)] - v);
  const sig = emaSeries(line, signal);
  return { macd: r(line.at(-1)), signal: r(sig.at(-1)), histogram: r(line.at(-1) - sig.at(-1)) };
}
export function bollinger(closes, n = 20, k = 2) {
  if (closes.length < n) return need(n, closes.length);
  const w = closes.slice(-n), m = w.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(w.reduce((s, x) => s + (x - m) ** 2, 0) / n);
  return { middle: r(m), upper: r(m + k * sd), lower: r(m - k * sd) };
}
export function atr(cs, n = 14) {
  if (cs.length < n + 1) return need(n + 1, cs.length);
  const tr = cs.slice(1).map((c, i) => Math.max(c.h - c.l, Math.abs(c.h - cs[i].c), Math.abs(c.l - cs[i].c)));
  let a = tr.slice(0, n).reduce((s, x) => s + x, 0) / n;
  for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
  return { value: r(a) };
}

/** Every indicator for one token's candles, with how much data stands behind them. */
export function compute(cs) {
  const closes = cs.map((c) => c.c);
  const traded = cs.filter((c) => c.trades > 0);
  const trades = cs.reduce((s, c) => s + c.trades, 0);
  const vol = cs.reduce((s, c) => s + c.v, 0);
  const recent = cs.slice(-6).reduce((s, c) => s + c.v, 0), before = cs.slice(-12, -6).reduce((s, c) => s + c.v, 0);
  const val = (x) => (x == null ? null : r(x));
  return {
    lastPrice: r(closes.at(-1)),
    rsi14: rsi(closes),
    macd: macd(closes),
    sma20: cs.length >= 20 ? { value: val(sma(closes, 20)) } : need(20, cs.length),
    sma50: cs.length >= 50 ? { value: val(sma(closes, 50)) } : need(50, cs.length),
    ema20: cs.length >= 20 ? { value: val(emaSeries(closes, 20).at(-1)) } : need(20, cs.length),
    ema50: cs.length >= 50 ? { value: val(emaSeries(closes, 50).at(-1)) } : need(50, cs.length),
    bollinger20: bollinger(closes),
    atr14: atr(cs),
    vwap: { value: vol > 0 ? r(cs.reduce((s, c) => s + c.c * c.v, 0) / vol) : null },
    volumeTrend: cs.length >= 12 ? { last6Kas: r(recent, 2), previous6Kas: r(before, 2), change: before > 0 ? r(recent / before - 1, 3) : null } : need(12, cs.length),
    data: { candles: cs.length, candlesWithTrades: traded.length, trades, reliability: trades < 30 || traded.length < 10 ? "thin" : "ok" },
  };
}
