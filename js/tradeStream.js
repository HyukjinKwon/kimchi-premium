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

if (typeof module !== 'undefined') {
  module.exports = { parseUpbitRestTrades, parseUpbitWsTrade, parseBinanceTrade, parseTvFrames };
}
