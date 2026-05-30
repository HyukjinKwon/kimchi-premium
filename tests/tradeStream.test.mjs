import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseUpbitRestTrades, parseUpbitWsTrade, parseBinanceTrade, parseTvFrames } =
  require('../js/tradeStream.js');

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTvFrame(obj) {
  const json = JSON.stringify(obj);
  return `~m~${json.length}~m~${json}`;
}

function tvQsd(tvSymbol, lp, chp = 0) {
  return makeTvFrame({ m: 'qsd', p: ['qs_test', { n: tvSymbol, s: 'ok', v: { lp, chp } }] });
}

// ── parseUpbitRestTrades ──────────────────────────────────────────────────────

describe('parseUpbitRestTrades', () => {
  test('maps BID to isBuy=true', () => {
    const trades = parseUpbitRestTrades([{
      sequential_id: 1, trade_price: 143_850_000, trade_volume: 0.0012,
      ask_bid: 'BID', timestamp: 1_700_000_000_000,
    }]);
    assert.equal(trades.length, 1);
    assert.equal(trades[0].id, 1);
    assert.equal(trades[0].price, 143_850_000);
    assert.equal(trades[0].qty, 0.0012);
    assert.equal(trades[0].isBuy, true);
    assert.ok(trades[0].time instanceof Date);
    assert.equal(trades[0].time.getTime(), 1_700_000_000_000);
  });

  test('maps ASK to isBuy=false', () => {
    const trades = parseUpbitRestTrades([{
      sequential_id: 2, trade_price: 100, trade_volume: 1,
      ask_bid: 'ASK', timestamp: 0,
    }]);
    assert.equal(trades[0].isBuy, false);
  });

  test('returns empty array for empty input', () => {
    assert.deepEqual(parseUpbitRestTrades([]), []);
  });

  test('maps multiple entries preserving order', () => {
    const raw = [
      { sequential_id: 10, trade_price: 100, trade_volume: 1, ask_bid: 'BID', timestamp: 1000 },
      { sequential_id: 11, trade_price: 101, trade_volume: 2, ask_bid: 'ASK', timestamp: 2000 },
    ];
    const trades = parseUpbitRestTrades(raw);
    assert.equal(trades.length, 2);
    assert.equal(trades[0].id, 10);
    assert.equal(trades[1].id, 11);
  });
});

// ── parseUpbitWsTrade ─────────────────────────────────────────────────────────

describe('parseUpbitWsTrade', () => {
  test('parses a trade message', () => {
    const d = {
      type: 'trade', sequential_id: 99,
      trade_price: 50_000_000, trade_volume: 0.5,
      ask_bid: 'BID', trade_timestamp: 1_700_000_000_000,
    };
    const trade = parseUpbitWsTrade(d);
    assert.ok(trade);
    assert.equal(trade.id, 99);
    assert.equal(trade.price, 50_000_000);
    assert.equal(trade.qty, 0.5);
    assert.equal(trade.isBuy, true);
    assert.ok(trade.time instanceof Date);
  });

  test('returns null for ticker message type', () => {
    assert.equal(parseUpbitWsTrade({ type: 'ticker' }), null);
  });

  test('returns null for orderbook message type', () => {
    assert.equal(parseUpbitWsTrade({ type: 'orderbook' }), null);
  });

  test('ASK maps to isBuy=false', () => {
    const d = { type: 'trade', sequential_id: 1, trade_price: 100, trade_volume: 1, ask_bid: 'ASK', trade_timestamp: 0 };
    assert.equal(parseUpbitWsTrade(d).isBuy, false);
  });
});

// ── parseBinanceTrade ─────────────────────────────────────────────────────────

describe('parseBinanceTrade', () => {
  test('parses a Binance trade message', () => {
    const d = { t: 456, p: '0.00050000', q: '10.50000', m: false, T: 1_700_000_000_000 };
    const trade = parseBinanceTrade(d);
    assert.equal(trade.id, 456);
    assert.equal(trade.price, 0.0005);
    assert.equal(trade.qty, 10.5);
    assert.equal(trade.isBuy, true);   // m=false → taker bought
    assert.ok(trade.time instanceof Date);
  });

  test('m=true (market maker) maps to isBuy=false', () => {
    const d = { t: 1, p: '1', q: '1', m: true, T: 0 };
    assert.equal(parseBinanceTrade(d).isBuy, false);
  });

  test('price and qty are parsed as floats', () => {
    const d = { t: 1, p: '43210.12345678', q: '0.00123456', m: false, T: 0 };
    const trade = parseBinanceTrade(d);
    assert.equal(typeof trade.price, 'number');
    assert.equal(typeof trade.qty, 'number');
    assert.ok(Math.abs(trade.price - 43210.12345678) < 1e-8);
  });
});

// ── parseTvFrames ─────────────────────────────────────────────────────────────

describe('parseTvFrames', () => {
  test('parses a single qsd frame', () => {
    const raw = tvQsd('UPBIT:BTCKRW', 143_850_000, 1.5);
    const results = parseTvFrames(raw);
    assert.equal(results.length, 1);
    assert.equal(results[0].symbol, 'BTC');
    assert.equal(results[0].price, 143_850_000);
    assert.ok(Math.abs(results[0].change - 0.015) < 1e-10);
  });

  test('parses multiple frames concatenated in one message', () => {
    const raw = tvQsd('UPBIT:BTCKRW', 143_850_000, 1.5) +
                tvQsd('UPBIT:ETHKRW', 5_000_000, -0.5);
    const results = parseTvFrames(raw);
    assert.equal(results.length, 2);
    assert.equal(results[0].symbol, 'BTC');
    assert.equal(results[1].symbol, 'ETH');
  });

  test('skips heartbeat frames (~h~)', () => {
    const raw = '~m~3~m~~h~' + tvQsd('UPBIT:XRPKRW', 800, 0);
    const results = parseTvFrames(raw);
    assert.equal(results.length, 1);
    assert.equal(results[0].symbol, 'XRP');
  });

  test('skips non-qsd message types', () => {
    const raw = makeTvFrame({ m: 'quote_completed', p: [] });
    assert.deepEqual(parseTvFrames(raw), []);
  });

  test('skips qsd frames with missing lp field', () => {
    const raw = makeTvFrame({ m: 'qsd', p: ['s', { n: 'UPBIT:BTCKRW', s: 'ok', v: {} }] });
    assert.deepEqual(parseTvFrames(raw), []);
  });

  test('skips malformed JSON frames without throwing', () => {
    const raw = '~m~5~m~{bad}' + tvQsd('UPBIT:BTCKRW', 100, 0);
    const results = parseTvFrames(raw);
    assert.equal(results.length, 1);
    assert.equal(results[0].symbol, 'BTC');
  });

  test('returns empty array for empty string', () => {
    assert.deepEqual(parseTvFrames(''), []);
  });

  test('change defaults to 0 when chp is missing', () => {
    const raw = makeTvFrame({ m: 'qsd', p: ['s', { n: 'UPBIT:BTCKRW', s: 'ok', v: { lp: 100 } }] });
    const results = parseTvFrames(raw);
    assert.equal(results[0].change, 0);
  });
});
