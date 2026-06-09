import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseUpbitRestTrades,
  parseUpbitWsTrade,
  parseBinanceTrade,
  parseTvFrames,
} = require('../js/tradeStream.js');

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

// ── Bithumb pre-fill guard semantics (documented via pure logic) ──────────────

describe('Bithumb pre-fill guard semantics', () => {
  // These document the behaviour of fetchBithumbPrices in js/exchanges.js. Bithumb
  // (another KRW exchange) pre-fills the hero card and table before live Upbit data
  // arrives. It never sets high/low; Upbit REST/WS always does — so high>0 cleanly
  // marks authoritative Upbit data and blocks further placeholder writes.

  test('no high field means Bithumb placeholder (real Upbit data not yet arrived)', () => {
    const bithumbData = { price: 93_937_000, change: -0.0188, volume: 1234 };
    assert.equal(bithumbData.high, undefined);
    assert.equal(bithumbData.high > 0, false); // guard allows the Bithumb pre-fill to write
  });

  test('high>0 means real Upbit data has arrived (REST/WS sets high_price)', () => {
    const upbitData = { price: 100_500_000, change: 0.012, volume: 12345.6, high: 101_000_000, low: 99_000_000 };
    assert.ok(upbitData.high > 0); // guard blocks further Bithumb writes
  });

  test('change is the Bithumb day-over-day close move', () => {
    const price = 93_937_000, prevClose = 95_742_000;
    const change = prevClose > 0 ? (price - prevClose) / prevClose : 0;
    assert.ok(Math.abs(change - (-0.018853)) < 1e-4);
  });

  test('change is 0 when prev close is missing or zero', () => {
    const price = 100, prevClose = 0;
    const change = prevClose > 0 ? (price - prevClose) / prevClose : 0;
    assert.equal(change, 0);
  });

  test('only symbols confirmed on Upbit are pre-filled (Bithumb-only coins skipped)', () => {
    const upbitValid = new Set(['BTC', 'ETH']);
    const requested = ['BTC', 'ETH', 'BITHUMBONLY'];
    const allow = upbitValid ? requested.filter(s => upbitValid.has(s)) : requested;
    assert.deepEqual(allow, ['BTC', 'ETH']);
  });

  test('before the market list is known, all requested symbols are allowed', () => {
    const upbitValid = null;
    const requested = ['BTC', 'ETH', 'XRP'];
    const allow = upbitValid ? requested.filter(s => upbitValid.has(s)) : requested;
    assert.deepEqual(allow, ['BTC', 'ETH', 'XRP']);
  });

  test('allSymbols grows from any upbit event (the fromCC flag is gone)', () => {
    const allSymbols = ['BTC', 'ETH'];
    const event = { symbol: 'SOL', data: {}, prev: null };
    if (!allSymbols.includes(event.symbol)) allSymbols.push(event.symbol);
    assert.deepEqual(allSymbols, ['BTC', 'ETH', 'SOL']); // SOL added
  });
});
