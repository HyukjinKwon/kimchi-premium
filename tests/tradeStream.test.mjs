import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseUpbitRestTrades,
  parseUpbitWsTrade,
  parseBinanceTrade,
  parseTvFrames,
  parseCryptoCompareBars,
} = require('../js/tradeStream.js');

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTvFrame(obj) {
  const json = JSON.stringify(obj);
  return `~m~${json.length}~m~${json}`;
}

function tvQsd(tvSymbol, lp, chp = 0) {
  return makeTvFrame({ m: 'qsd', p: ['qs_test', { n: tvSymbol, s: 'ok', v: { lp, chp } }] });
}

function makeCCBar(time, open, close, volumefrom = 1) {
  return { time, open, high: Math.max(open, close), low: Math.min(open, close), close, volumefrom, volumeto: close * volumefrom };
}

function makeCCResponse(bars) {
  return { Response: 'Success', Data: { Data: bars } };
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

  test('preserves order of multiple entries', () => {
    const raw = [
      { sequential_id: 10, trade_price: 100, trade_volume: 1, ask_bid: 'BID', timestamp: 1000 },
      { sequential_id: 11, trade_price: 101, trade_volume: 2, ask_bid: 'ASK', timestamp: 2000 },
    ];
    const trades = parseUpbitRestTrades(raw);
    assert.equal(trades.length, 2);
    assert.equal(trades[0].id, 10);
    assert.equal(trades[1].id, 11);
  });

  test('time is a Date constructed from timestamp ms', () => {
    const trades = parseUpbitRestTrades([{
      sequential_id: 1, trade_price: 1, trade_volume: 1, ask_bid: 'BID', timestamp: 1_700_000_000_000,
    }]);
    assert.ok(trades[0].time instanceof Date);
    assert.equal(trades[0].time.getTime(), 1_700_000_000_000);
  });
});

// ── parseUpbitWsTrade ─────────────────────────────────────────────────────────

describe('parseUpbitWsTrade', () => {
  test('parses a trade message correctly', () => {
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
    assert.equal(trade.time.getTime(), 1_700_000_000_000);
  });

  test('returns null for ticker type', () => assert.equal(parseUpbitWsTrade({ type: 'ticker' }), null));
  test('returns null for orderbook type', () => assert.equal(parseUpbitWsTrade({ type: 'orderbook' }), null));
  test('returns null for missing type', () => assert.equal(parseUpbitWsTrade({}), null));

  test('ASK maps to isBuy=false', () => {
    const d = { type: 'trade', sequential_id: 1, trade_price: 100, trade_volume: 1, ask_bid: 'ASK', trade_timestamp: 0 };
    assert.equal(parseUpbitWsTrade(d).isBuy, false);
  });

  test('falls back to Date.now() when sequential_id is missing', () => {
    const before = Date.now();
    const d = { type: 'trade', trade_price: 100, trade_volume: 1, ask_bid: 'BID', trade_timestamp: 0 };
    const trade = parseUpbitWsTrade(d);
    assert.ok(trade.id >= before);
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
    assert.equal(trade.isBuy, true);
    assert.ok(trade.time instanceof Date);
    assert.equal(trade.time.getTime(), 1_700_000_000_000);
  });

  test('m=false means taker bought (isBuy=true)', () => {
    assert.equal(parseBinanceTrade({ t: 1, p: '1', q: '1', m: false, T: 0 }).isBuy, true);
  });

  test('m=true means market maker (taker sold, isBuy=false)', () => {
    assert.equal(parseBinanceTrade({ t: 1, p: '1', q: '1', m: true, T: 0 }).isBuy, false);
  });

  test('price and qty are parsed as floats from strings', () => {
    const trade = parseBinanceTrade({ t: 1, p: '43210.12345678', q: '0.00123456', m: false, T: 0 });
    assert.equal(typeof trade.price, 'number');
    assert.equal(typeof trade.qty, 'number');
    assert.ok(Math.abs(trade.price - 43210.12345678) < 1e-8);
    assert.ok(Math.abs(trade.qty - 0.00123456) < 1e-10);
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

  test('parses multiple concatenated frames', () => {
    const raw = tvQsd('UPBIT:BTCKRW', 143_850_000, 1.5) + tvQsd('UPBIT:ETHKRW', 5_000_000, -0.5);
    const results = parseTvFrames(raw);
    assert.equal(results.length, 2);
    assert.equal(results[0].symbol, 'BTC');
    assert.equal(results[1].symbol, 'ETH');
  });

  test('skips heartbeat frames', () => {
    const raw = '~m~3~m~~h~' + tvQsd('UPBIT:XRPKRW', 800, 0);
    const results = parseTvFrames(raw);
    assert.equal(results.length, 1);
    assert.equal(results[0].symbol, 'XRP');
  });

  test('skips non-qsd message types', () => {
    assert.deepEqual(parseTvFrames(makeTvFrame({ m: 'quote_completed', p: [] })), []);
  });

  test('skips qsd frames with missing lp', () => {
    assert.deepEqual(parseTvFrames(makeTvFrame({ m: 'qsd', p: ['s', { n: 'UPBIT:BTCKRW', s: 'ok', v: {} }] })), []);
  });

  test('skips malformed JSON without throwing', () => {
    const raw = '~m~5~m~{bad}' + tvQsd('UPBIT:BTCKRW', 100, 0);
    assert.equal(parseTvFrames(raw).length, 1);
  });

  test('returns empty array for empty string', () => {
    assert.deepEqual(parseTvFrames(''), []);
  });

  test('chp missing defaults change to 0', () => {
    const raw = makeTvFrame({ m: 'qsd', p: ['s', { n: 'UPBIT:BTCKRW', s: 'ok', v: { lp: 100 } }] });
    assert.equal(parseTvFrames(raw)[0].change, 0);
  });
});

// ── parseCryptoCompareBars ────────────────────────────────────────────────────

describe('parseCryptoCompareBars', () => {
  test('parses bars newest-first', () => {
    const bars = [
      makeCCBar(1000, 100, 102),
      makeCCBar(1060, 102, 105),
      makeCCBar(1120, 105, 103),
    ];
    const result = parseCryptoCompareBars(makeCCResponse(bars));
    assert.equal(result.length, 3);
    assert.equal(result[0].id, 1120); // newest first
    assert.equal(result[1].id, 1060);
    assert.equal(result[2].id, 1000);
  });

  test('price is the candle close price', () => {
    const result = parseCryptoCompareBars(makeCCResponse([makeCCBar(1000, 100, 109_500_000)]));
    assert.equal(result[0].price, 109_500_000);
  });

  test('isBuy=true when close >= open (price rose)', () => {
    const result = parseCryptoCompareBars(makeCCResponse([makeCCBar(1000, 100, 110)]));
    assert.equal(result[0].isBuy, true);
  });

  test('isBuy=true when close === open (flat candle)', () => {
    const result = parseCryptoCompareBars(makeCCResponse([makeCCBar(1000, 100, 100)]));
    assert.equal(result[0].isBuy, true);
  });

  test('isBuy=false when close < open (price fell)', () => {
    const result = parseCryptoCompareBars(makeCCResponse([makeCCBar(1000, 110, 100)]));
    assert.equal(result[0].isBuy, false);
  });

  test('qty is always 0 (aggregate volume is not a trade-level quantity)', () => {
    const bars = [makeCCBar(1000, 100, 102, 50), makeCCBar(1060, 102, 105, 200)];
    const result = parseCryptoCompareBars(makeCCResponse(bars));
    result.forEach(t => assert.equal(t.qty, 0));
  });

  test('time is a Date from bar.time seconds', () => {
    const result = parseCryptoCompareBars(makeCCResponse([makeCCBar(1_700_000_000, 100, 101)]));
    assert.ok(result[0].time instanceof Date);
    assert.equal(result[0].time.getTime(), 1_700_000_000_000);
  });

  test('filters out bars with close === 0 (no data)', () => {
    const bars = [makeCCBar(1000, 0, 0), makeCCBar(1060, 100, 102)];
    const result = parseCryptoCompareBars(makeCCResponse(bars));
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 1060);
  });

  test('limits to the last 30 bars', () => {
    const bars = Array.from({ length: 50 }, (_, i) => makeCCBar(1000 + i * 60, 100, 101));
    const result = parseCryptoCompareBars(makeCCResponse(bars));
    assert.equal(result.length, 30);
    // Should be the last 30 (newest), reversed to newest-first
    assert.equal(result[0].id, 1000 + 49 * 60); // last bar = newest
  });

  test('returns empty array for null/undefined data', () => {
    assert.deepEqual(parseCryptoCompareBars(null), []);
    assert.deepEqual(parseCryptoCompareBars(undefined), []);
    assert.deepEqual(parseCryptoCompareBars({}), []);
  });

  test('returns empty array when Data.Data is missing', () => {
    assert.deepEqual(parseCryptoCompareBars({ Data: {} }), []);
    assert.deepEqual(parseCryptoCompareBars({ Data: { Data: null } }), []);
  });

  test('returns empty array when all bars have close=0', () => {
    const bars = [makeCCBar(1000, 0, 0), makeCCBar(1060, 0, 0)];
    assert.deepEqual(parseCryptoCompareBars(makeCCResponse(bars)), []);
  });

  test('handles single bar correctly', () => {
    const result = parseCryptoCompareBars(makeCCResponse([makeCCBar(5000, 200, 210)]));
    assert.equal(result.length, 1);
    assert.equal(result[0].price, 210);
    assert.equal(result[0].isBuy, true);
  });

  test('id is the raw UNIX timestamp (seconds)', () => {
    const result = parseCryptoCompareBars(makeCCResponse([makeCCBar(9999, 100, 101)]));
    assert.equal(result[0].id, 9999);
  });
});

// ── CryptoCompare guard semantics (documented via pure logic) ─────────────────

describe('CryptoCompare fill guard semantics', () => {
  // These tests document the expected behaviour of the high>0 guard used in
  // fetchCryptoComparePrices. Upbit REST/WS always sets high/low (day range);
  // CC never does — making high a clean discriminator even though CC now also
  // supplies volume (so volume>0 can no longer serve as the guard).

  test('no high field means CC placeholder (real Upbit data not yet arrived)', () => {
    const ccData = { price: 100_000_000, change: 0.01, volume: 5000 };
    assert.equal(ccData.high, undefined);
    assert.equal(ccData.high > 0, false); // guard allows CryptoCompare to update
  });

  test('high>0 means real Upbit data has arrived (REST/WS sets high_price)', () => {
    const upbitData = { price: 100_500_000, change: 0.012, volume: 12345.6, high: 101_000_000, low: 99_000_000 };
    assert.ok(upbitData.high > 0); // guard blocks further CryptoCompare updates
  });

  test('fromCC flag distinguishes placeholder events from real Upbit events', () => {
    const ccEvent   = { symbol: 'BTC', data: { price: 100, change: 0, volume: 5000 }, prev: null, fromCC: true };
    const upbitEvent = { symbol: 'BTC', data: { price: 101, change: 0.01, volume: 5000, high: 102, low: 98 }, prev: null };
    assert.equal(ccEvent.fromCC, true);
    assert.equal(upbitEvent.fromCC, undefined); // real Upbit events never carry fromCC
  });

  test('allSymbols should not grow from CryptoCompare events (fromCC guard)', () => {
    const allSymbols = ['BTC', 'ETH'];
    // Simulate: CC emits for a non-Upbit coin
    const event = { symbol: 'NONUPBIT', data: {}, prev: null, fromCC: true };
    // App should NOT push when fromCC is true
    if (!event.fromCC && !allSymbols.includes(event.symbol)) allSymbols.push(event.symbol);
    assert.deepEqual(allSymbols, ['BTC', 'ETH']); // unchanged
  });

  test('allSymbols grows from real Upbit WS events (no fromCC)', () => {
    const allSymbols = ['BTC', 'ETH'];
    const event = { symbol: 'SOL', data: {}, prev: null }; // no fromCC
    if (!event.fromCC && !allSymbols.includes(event.symbol)) allSymbols.push(event.symbol);
    assert.deepEqual(allSymbols, ['BTC', 'ETH', 'SOL']); // SOL added
  });
});
