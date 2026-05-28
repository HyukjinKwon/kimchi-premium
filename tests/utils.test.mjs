import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  fmtKrw, fmtUsd, fmtPct, fmtPremium,
  pctClass, premiumClass, fmtVolume,
  fmtTradePrice, fmtTradeQty,
  fmtLiqUsd, fmtLiqPrice,
  newsAge, coinIcon, createRateLimiter,
} = require('../js/utils.js');

// ── fmtKrw ───────────────────────────────────────────────────────────────────
test('fmtKrw returns -- for 0', () => assert.equal(fmtKrw(0), '--'));
test('fmtKrw returns -- for null', () => assert.equal(fmtKrw(null), '--'));
test('fmtKrw rounds and formats', () => assert.equal(fmtKrw(1234567.8), '1,234,568'));
test('fmtKrw formats small number', () => assert.equal(fmtKrw(100), '100'));

// ── fmtUsd ───────────────────────────────────────────────────────────────────
test('fmtUsd returns -- for 0', () => assert.equal(fmtUsd(0), '--'));
test('fmtUsd shows 2dp for >= 1000', () => assert.equal(fmtUsd(105000), '105,000.00'));
test('fmtUsd shows min 2dp for 1–999', () => assert.equal(fmtUsd(2.5), '2.50'));
test('fmtUsd shows up to 6dp for < 1', () => assert.equal(fmtUsd(0.000123), '0.000123'));

// ── fmtPct ───────────────────────────────────────────────────────────────────
test('fmtPct returns -- for null', () => assert.equal(fmtPct(null), '--'));
test('fmtPct returns -- for NaN', () => assert.equal(fmtPct(NaN), '--'));
test('fmtPct prefixes + for positive', () => assert.equal(fmtPct(5.123), '+5.12%'));
test('fmtPct formats negative', () => assert.equal(fmtPct(-2.5), '-2.50%'));
test('fmtPct formats zero with +', () => assert.equal(fmtPct(0), '+0.00%'));

// ── fmtPremium ───────────────────────────────────────────────────────────────
test('fmtPremium returns -- for null', () => assert.equal(fmtPremium(null), '--'));
test('fmtPremium shows 2dp positive', () => assert.equal(fmtPremium(2.345), '+2.35%'));
test('fmtPremium shows 2dp negative', () => assert.equal(fmtPremium(-1.234), '-1.23%'));

// ── pctClass ─────────────────────────────────────────────────────────────────
test('pctClass td-up for positive', () => assert.equal(pctClass(0.5), 'td-up'));
test('pctClass td-down for negative', () => assert.equal(pctClass(-0.5), 'td-down'));
test('pctClass td-neutral for 0', () => assert.equal(pctClass(0), 'td-neutral'));
test('pctClass td-neutral for null', () => assert.equal(pctClass(null), 'td-neutral'));

// ── premiumClass ─────────────────────────────────────────────────────────────
test('premiumClass pos for positive', () => assert.equal(premiumClass(1), 'pos'));
test('premiumClass neg for negative', () => assert.equal(premiumClass(-1), 'neg'));
test('premiumClass neutral for 0', () => assert.equal(premiumClass(0), 'neutral'));

// ── fmtVolume ────────────────────────────────────────────────────────────────
test('fmtVolume returns -- for 0', () => assert.equal(fmtVolume(0), '--'));
test('fmtVolume T for >= 1000', () => assert.equal(fmtVolume(1500), '1.5T'));
test('fmtVolume B for >= 1', () => assert.equal(fmtVolume(5), '5B'));
test('fmtVolume M for < 1', () => assert.equal(fmtVolume(0.5), '50M'));

// ── fmtTradePrice ─────────────────────────────────────────────────────────────
test('fmtTradePrice returns -- for 0', () => assert.equal(fmtTradePrice(0), '--'));
test('fmtTradePrice 2dp for >= 1000', () => assert.equal(fmtTradePrice(50000), '50,000.00'));
test('fmtTradePrice 3dp for 100–999', () => assert.equal(fmtTradePrice(250), '250.000'));
test('fmtTradePrice 4dp for 1–99', () => assert.equal(fmtTradePrice(5), '5.0000'));
test('fmtTradePrice 8dp for < 0.01', () => assert.equal(fmtTradePrice(0.001), '0.00100000'));

// ── fmtTradeQty ───────────────────────────────────────────────────────────────
test('fmtTradeQty 1dp for >= 100', () => assert.equal(fmtTradeQty(150), '150.0'));
test('fmtTradeQty 3dp for >= 1', () => assert.equal(fmtTradeQty(5), '5.000'));
test('fmtTradeQty 5dp for < 1', () => assert.equal(fmtTradeQty(0.5), '0.50000'));

// ── fmtLiqUsd ────────────────────────────────────────────────────────────────
test('fmtLiqUsd $0 for 0', () => assert.equal(fmtLiqUsd(0), '$0'));
test('fmtLiqUsd billions', () => assert.equal(fmtLiqUsd(1.5e9), '$1.50B'));
test('fmtLiqUsd millions', () => assert.equal(fmtLiqUsd(2.34e6), '$2.34M'));
test('fmtLiqUsd thousands', () => assert.equal(fmtLiqUsd(1500), '$1.5K'));
test('fmtLiqUsd small', () => assert.equal(fmtLiqUsd(500), '$500'));

// ── fmtLiqPrice ───────────────────────────────────────────────────────────────
test('fmtLiqPrice returns -- for 0', () => assert.equal(fmtLiqPrice(0), '--'));
test('fmtLiqPrice 1dp for >= 10000', () => assert.equal(fmtLiqPrice(95000), '95,000'));
test('fmtLiqPrice 2dp for 100–9999', () => assert.equal(fmtLiqPrice(2500), '2,500'));
test('fmtLiqPrice 4dp for 1–99', () => assert.equal(fmtLiqPrice(5), '5.0000'));
test('fmtLiqPrice 6dp for < 1', () => assert.equal(fmtLiqPrice(0.5), '0.500000'));

// ── newsAge ───────────────────────────────────────────────────────────────────
test('newsAge returns a non-empty local time string', () => {
  const ts = Math.floor(Date.now() / 1000) - 30 * 60;
  assert.ok(newsAge(ts).length > 0);
});

// ── coinIcon ──────────────────────────────────────────────────────────────────
test('coinIcon returns lowercase URL', () => {
  assert.ok(coinIcon('BTC').includes('/btc.png'));
  assert.ok(coinIcon('ETH').includes('/eth.png'));
});

// ── createRateLimiter ─────────────────────────────────────────────────────────
test('rateLimiter allows first 4 sends', () => {
  const rl = createRateLimiter({ limit: 4, window: 15_000, block: 60_000 });
  let t = 1000;
  assert.equal(rl.try(t += 100).ok, true);
  assert.equal(rl.try(t += 100).ok, true);
  assert.equal(rl.try(t += 100).ok, true);
  assert.equal(rl.try(t += 100).ok, true);
});

test('rateLimiter blocks on 5th send within window', () => {
  const rl = createRateLimiter({ limit: 4, window: 15_000, block: 60_000 });
  let t = 1000;
  rl.try(t += 100);
  rl.try(t += 100);
  rl.try(t += 100);
  rl.try(t += 100);
  const result = rl.try(t += 100);
  assert.equal(result.ok, false);
  assert.equal(result.retryAfter, 60);
});

test('rateLimiter stays blocked during block period', () => {
  const rl = createRateLimiter({ limit: 4, window: 15_000, block: 60_000 });
  let t = 1000;
  rl.try(t += 100); rl.try(t += 100); rl.try(t += 100); rl.try(t += 100);
  rl.try(t += 100); // triggers block
  assert.equal(rl.try(t += 30_000).ok, false); // 30s later, still blocked
});

test('rateLimiter unblocks after block period expires', () => {
  const rl = createRateLimiter({ limit: 4, window: 15_000, block: 60_000 });
  let t = 1000;
  rl.try(t += 100); rl.try(t += 100); rl.try(t += 100); rl.try(t += 100);
  rl.try(t += 100); // triggers block at t=1500, blockedUntil=61500
  assert.equal(rl.try(t + 61_000).ok, true); // 61s after block: unblocked
});

test('rateLimiter resets counter after window slides', () => {
  const rl = createRateLimiter({ limit: 4, window: 15_000, block: 60_000 });
  let t = 0;
  rl.try(t += 100); rl.try(t += 100); rl.try(t += 100); rl.try(t += 100);
  // now slide past the window
  assert.equal(rl.try(t + 20_000).ok, true); // old timestamps expired
});

test('rateLimiter retryAfter decrements correctly', () => {
  const rl = createRateLimiter({ limit: 4, window: 15_000, block: 60_000 });
  let t = 1000;
  rl.try(t += 100); rl.try(t += 100); rl.try(t += 100); rl.try(t += 100);
  rl.try(t += 100); // block starts at t=1500
  const r = rl.try(t + 10_000); // 10s into block
  assert.equal(r.ok, false);
  assert.equal(r.retryAfter, 50); // 60 - 10 = 50s remaining
});
