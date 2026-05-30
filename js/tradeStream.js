// Pure parsing functions for trade stream data.
// Used by exchanges.js (TradingView relay) and app.js (Upbit/Binance WebSocket + REST).
// Also exported for unit tests via CommonJS.

function parseUpbitRestTrades(list) {
  return list.map(t => ({
    id: t.sequential_id,
    price: t.trade_price,
    qty: t.trade_volume,
    isBuy: t.ask_bid === 'BID',
    time: new Date(t.timestamp),
  }));
}

function parseUpbitWsTrade(d) {
  if (d.type !== 'trade') return null;
  return {
    id: d.sequential_id || Date.now(),
    price: d.trade_price,
    qty: d.trade_volume,
    isBuy: d.ask_bid === 'BID',
    time: new Date(d.trade_timestamp),
  };
}

function parseBinanceTrade(d) {
  return {
    id: d.t,
    price: parseFloat(d.p),
    qty: parseFloat(d.q),
    isBuy: !d.m,   // m=true means the buyer was the market maker (i.e. taker sold)
    time: new Date(d.T),
  };
}

// Parses one raw WebSocket message from TradingView's relay, which may contain
// multiple frames concatenated as ~m~<len>~m~<body>.
// Returns an array of { symbol, price, change } for any qsd (quote set data) frames.
function parseTvFrames(raw) {
  const results = [];
  const bodies = raw.split(/~m~\d+~m~/);
  for (const body of bodies) {
    if (!body || body.startsWith('~h~')) continue;
    try {
      const msg = JSON.parse(body);
      if (msg.m !== 'qsd') continue;
      const info = msg.p?.[1];
      if (!info?.v?.lp) continue;
      results.push({
        symbol: info.n.replace('UPBIT:', '').replace('KRW', ''),
        price: info.v.lp,
        change: info.v.chp != null ? info.v.chp / 100 : 0,
      });
    } catch(e) {}
  }
  return results;
}

// Parses a CryptoCompare histominute response into trade-panel entries.
// Used as a placeholder in the Upbit Trades panel before live Upbit data arrives.
// Each entry is one 1-minute candle; isBuy reflects whether price rose that minute.
// qty is 0 (shown as '--') because minute aggregate volume isn't a meaningful trade size.
function parseCryptoCompareBars(data) {
  const bars = data?.Data?.Data;
  if (!Array.isArray(bars)) return [];
  return bars
    .filter(b => b.close > 0)
    .slice(-30)   // keep last 30 minutes (array is oldest-first)
    .reverse()    // newest first to match trade panel ordering
    .map(b => ({
      id: b.time,
      price: b.close,
      qty: 0,
      isBuy: b.close >= b.open,
      time: new Date(b.time * 1000),
    }));
}

if (typeof module !== 'undefined') {
  module.exports = { parseUpbitRestTrades, parseUpbitWsTrade, parseBinanceTrade, parseTvFrames, parseCryptoCompareBars };
}
