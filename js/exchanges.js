// Exchange data manager — handles WebSocket connections and price aggregation

const ExchangeManager = (() => {
  const state = {
    usdKrw: 0,
    jpyKrw: 0,
    upbit: {},
    binance: {},
    coinbase: {},
    btcDominance: 0,
    coinbaseUsdPremium: 0,
    listeners: [],
    ws: {},
    status: { upbit: 'disconnected', binance: 'disconnected' },
  };

  // Exponential backoff: 1s → 2s → 4s → … capped at 30s, plus jitter
  function backoff(attempt) {
    return Math.min(30000, 1000 * Math.pow(2, attempt)) + Math.random() * 500;
  }

  let _upbitAttempt  = 0;
  let _binanceAttempt = 0;

  function emit(event, data) {
    state.listeners.forEach(fn => fn(event, data));
  }

  function on(fn) { state.listeners.push(fn); }

  // --- USD/KRW exchange rate ---
  async function fetchExchangeRate() {
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/USD');
      const d = await r.json();
      if (d.rates) {
        state.usdKrw = d.rates.KRW;
        state.jpyKrw = d.rates.KRW / d.rates.JPY;
        emit('rate', { usdKrw: state.usdKrw, jpyKrw: state.jpyKrw });
      }
    } catch(e) {
      try {
        const r2 = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const d2 = await r2.json();
        state.usdKrw = d2.rates.KRW;
        state.jpyKrw = d2.rates.KRW / d2.rates.JPY;
        emit('rate', { usdKrw: state.usdKrw, jpyKrw: state.jpyKrw });
      } catch(e2) {}
    }
    setTimeout(fetchExchangeRate, 60000);
  }

  // --- BTC Dominance via CoinGecko ---
  async function fetchGlobal() {
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/global');
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      if (d.data) {
        state.btcDominance = d.data.market_cap_percentage.btc.toFixed(1);
        emit('global', { btcDominance: state.btcDominance });
        setTimeout(fetchGlobal, 120000);
        return;
      }
    } catch(e) {}
    setTimeout(fetchGlobal, 15000);
  }

  // --- Upbit WebSocket ---
  function connectUpbit(symbols) {
    if (state.ws.upbit) { state.ws.upbit.close(); }
    state.status.upbit = 'connecting';
    emit('status', state.status);

    const codes = symbols.map(s => `KRW-${s}`);
    const ws = new WebSocket('wss://api.upbit.com/websocket/v1');

    ws.onopen = () => {
      _upbitAttempt = 0;
      state.status.upbit = 'connected';
      emit('status', state.status);
      ws.send(JSON.stringify([
        { ticket: 'kimchi-premium' },
        { type: 'ticker', codes, isOnlyRealtime: false },
      ]));
    };

    ws.onmessage = async (e) => {
      try {
        const buf = await e.data.arrayBuffer();
        const text = new TextDecoder().decode(buf);
        const d = JSON.parse(text);
        if (!d.code || typeof d.code !== 'string') return;
        const symbol = d.code.replace('KRW-', '');
        const prev = state.upbit[symbol];
        state.upbit[symbol] = {
          price: d.trade_price,
          change: d.signed_change_rate,
          changePrice: d.signed_change_price,
          volume: d.acc_trade_price_24h / 1e8,
          high: d.high_price,
          low: d.low_price,
        };
        emit('upbit', { symbol, data: state.upbit[symbol], prev });
      } catch(e) {}
    };

    ws.onclose = () => {
      state.status.upbit = 'disconnected';
      emit('status', state.status);
      setTimeout(() => connectUpbit(symbols), backoff(_upbitAttempt++));
    };

    ws.onerror = () => ws.close();
    state.ws.upbit = ws;
  }

  // --- Binance WebSocket (all mini tickers) ---
  function connectBinance() {
    if (state.ws.binance) { state.ws.binance.close(); }
    state.status.binance = 'connecting';
    emit('status', state.status);

    const ws = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');

    ws.onopen = () => {
      _binanceAttempt = 0;
      state.status.binance = 'connected';
      emit('status', state.status);
    };

    ws.onmessage = (e) => {
      try {
        const arr = JSON.parse(e.data);
        if (!Array.isArray(arr)) return;
        const updates = [];
        arr.forEach(t => {
          if (!t.s || !t.s.endsWith('USDT')) return;
          const symbol = t.s.replace('USDT', '');
          const prev = state.binance[symbol];
          state.binance[symbol] = {
            price: parseFloat(t.c),
            change: (parseFloat(t.c) - parseFloat(t.o)) / parseFloat(t.o),
            volume: parseFloat(t.q) / 1e6,
            high: parseFloat(t.h),
            low: parseFloat(t.l),
            open: parseFloat(t.o),
          };
          updates.push({ symbol, data: state.binance[symbol], prev });
        });
        if (updates.length) emit('binance-batch', updates);
      } catch(e) {}
    };

    ws.onclose = () => {
      state.status.binance = 'disconnected';
      emit('status', state.status);
      setTimeout(connectBinance, backoff(_binanceAttempt++));
    };

    ws.onerror = () => ws.close();
    state.ws.binance = ws;
  }

  // --- Coinbase REST — BTC only, for Coinbase premium indicator ---
  async function fetchCoinbasePrice() {
    try {
      const r = await fetch('https://api.exchange.coinbase.com/products/BTC-USD/ticker');
      const d = await r.json();
      const price = parseFloat(d.price);
      state.coinbase.BTC = { price };
      if (state.binance.BTC) {
        state.coinbaseUsdPremium = ((price - state.binance.BTC.price) / state.binance.BTC.price * 100).toFixed(3);
        emit('coinbase-premium', parseFloat(state.coinbaseUsdPremium));
      }
    } catch(e) {}
    setTimeout(fetchCoinbasePrice, 5000);
  }

  // --- Init ---
  async function fetchUpbitMarkets(retry = 4) {
    try {
      const r = await fetch('https://api.upbit.com/v1/market/all?isDetails=false');
      if (r.status === 429) return [];
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      return d.filter(m => m.market.startsWith('KRW-')).map(m => m.market.replace('KRW-', ''));
    } catch(e) {
      if (retry > 0) {
        await new Promise(r => setTimeout(r, 800));
        return fetchUpbitMarkets(retry - 1);
      }
      return [];
    }
  }

  // Lightweight: prices only (148 KB vs 1.76 MB for 24hr). Used for fast initial table render.
  async function fetchBinancePrices() {
    try {
      const r = await fetch('https://api.binance.com/api/v3/ticker/price');
      const list = await r.json();
      const data = {};
      list.forEach(t => {
        if (!t.symbol.endsWith('USDT')) return;
        data[t.symbol.slice(0, -4)] = parseFloat(t.price);
      });
      return data;
    } catch(e) { return {}; }
  }

  // Full 24hr stats (change %, volume, high, low). Heavy — loaded in background.
  async function fetchBinanceMarkets() {
    try {
      const r = await fetch('https://api.binance.com/api/v3/ticker/24hr');
      const list = await r.json();
      const data = {};
      list.forEach(t => {
        if (!t.symbol.endsWith('USDT')) return;
        const sym = t.symbol.slice(0, -4);
        data[sym] = {
          price: parseFloat(t.lastPrice),
          change: parseFloat(t.priceChangePercent) / 100,
          volume: parseFloat(t.quoteVolume) / 1e6,
          high: parseFloat(t.highPrice),
          low: parseFloat(t.lowPrice),
          open: parseFloat(t.openPrice),
        };
      });
      return data;
    } catch(e) { return {}; }
  }

  // Single request for all symbols — simpler and avoids parallel 429s from batching.
  async function fetchAllUpbitTickers(symbols, retry = 1) {
    try {
      const markets = symbols.map(s => `KRW-${s}`).join(',');
      const r = await fetch(`https://api.upbit.com/v1/ticker?markets=${encodeURIComponent(markets)}`);
      if (r.status === 429) return;
      if (!r.ok) throw new Error(r.status);
      const list = await r.json();
      if (!Array.isArray(list)) throw new Error('bad response');
      list.forEach(t => {
        const sym = t.market.replace('KRW-', '');
        const d = {
          price: t.trade_price,
          change: t.signed_change_rate,
          volume: t.acc_trade_price_24h / 1e8,
          high: t.high_price,
          low: t.low_price,
        };
        state.upbit[sym] = d;
        emit('upbit', { symbol: sym, data: d, prev: null });
      });
    } catch(e) {
      if (retry > 0) {
        await new Promise(r => setTimeout(r, 800));
        await fetchAllUpbitTickers(symbols, retry - 1);
      }
    }
  }

  // Fetch Binance 24hr data for a small set of symbols using the multi-symbol endpoint
  async function fetchBinancePriority(symbols) {
    try {
      const syms = encodeURIComponent(JSON.stringify(symbols.map(s => s + 'USDT')));
      const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${syms}`);
      const list = await r.json();
      if (!Array.isArray(list)) return;
      const updates = list.map(t => ({
        symbol: t.symbol.slice(0, -4),
        data: {
          price:  parseFloat(t.lastPrice),
          change: parseFloat(t.priceChangePercent) / 100,
          volume: parseFloat(t.quoteVolume) / 1e6,
          high:   parseFloat(t.highPrice),
          low:    parseFloat(t.lowPrice),
          open:   parseFloat(t.openPrice),
        },
        prev: null,
      }));
      emit('binance-batch', updates);
    } catch(e) {}
  }

  const PRIORITY_SYMS = ['BTC','ETH','XRP','SOL','DOGE','ADA','AVAX','TON','SUI','LINK'];

  // Fetch live Upbit prices via TradingView's relay WebSocket.
  // TradingView's servers have persistent connections to exchanges and send the cached
  // last tick immediately, arriving much faster than a direct Upbit connection.
  // Prices are only applied if Upbit hasn't already provided data for that symbol.
  function fetchTradingViewQuotes(symbols) {
    if (!symbols.length) return;
    const session = 'qs_' + Math.random().toString(36).slice(2, 12);

    function send(ws, method, params) {
      const json = JSON.stringify({ m: method, p: params });
      ws.send(`~m~${json.length}~m~${json}`);
    }

    const ws = new WebSocket('wss://widgetdata.tradingview.com/socket.io/websocket');
    const pending = new Set(symbols);

    ws.onopen = () => {
      send(ws, 'set_auth_token', ['unauthorized_user_token']);
      send(ws, 'quote_create_session', [session]);
      send(ws, 'quote_set_fields', [session, 'lp', 'ch', 'chp', 'volume']);
      send(ws, 'quote_fast_symbols', [session, ...symbols.map(s => `UPBIT:${s}KRW`)]);
    };

    ws.onmessage = (e) => {
      for (const { symbol, price, change } of parseTvFrames(e.data)) {
        if (!pending.has(symbol)) continue;
        // Only use TradingView price if Upbit hasn't arrived yet for this symbol
        if (!state.upbit[symbol]) {
          const d = { price, change, volume: 0 };
          state.upbit[symbol] = d;
          emit('upbit', { symbol, data: d, prev: null });
        }
        pending.delete(symbol);
        if (pending.size === 0) ws.close();
      }
    };

    ws.onerror = () => ws.close();
    // Give larger batches more time; close regardless once Upbit REST has landed
    const timeout = Math.max(8000, symbols.length * 30);
    setTimeout(() => { try { ws.close(); } catch(e) {} }, timeout);
  }

  async function init() {
    fetchExchangeRate();
    fetchGlobal();

    // Show priority coins immediately while we fetch the full market list
    emit('symbols', PRIORITY_SYMS);

    // Kick off TradingView relay connection early — delivers Upbit prices for priority
    // coins within ~200ms, well before the Upbit REST chain completes.
    fetchTradingViewQuotes(PRIORITY_SYMS);

    fetchBinancePriority(PRIORITY_SYMS); // quick 24hr stats for hero card

    // Start both fetches in parallel
    const upbitMarketsP = fetchUpbitMarkets();   // ~30ms,  56KB
    const binancePricesP = fetchBinancePrices(); // ~100ms, 148KB

    const upbitSymbols = await upbitMarketsP;
    const defaultSymbols = upbitSymbols.length > 0 ? upbitSymbols : PRIORITY_SYMS;
    emit('symbols', defaultSymbols);

    // Fetch TradingView quotes for all remaining coins (PRIORITY_SYMS already in flight)
    const remainingSyms = defaultSymbols.filter(s => !PRIORITY_SYMS.includes(s));
    if (remainingSyms.length) fetchTradingViewQuotes(remainingSyms);

    // Fire Binance prices as soon as they arrive — don't wait for Upbit.
    // Table shows immediately with Binance columns; Upbit cells filled from TradingView until REST completes.
    const upbitP = fetchAllUpbitTickers(defaultSymbols);
    const binancePrices = await binancePricesP;
    const binancePriceSet = new Set(Object.keys(binancePrices));
    const commonSymbols = defaultSymbols.filter(s => binancePriceSet.has(s));
    emit('symbols', commonSymbols);
    emit('binance-prices', binancePrices);

    await upbitP;

    // Load heavy 24hr stats in background — updates change %, volume, high, low
    fetchBinanceMarkets().then(binanceData => {
      const updates = commonSymbols
        .filter(s => binanceData[s])
        .map(s => ({ symbol: s, data: binanceData[s], prev: null }));
      if (updates.length) emit('binance-batch', updates);
    });

    connectUpbit(defaultSymbols);
    connectBinance();
    fetchCoinbasePrice();

    return defaultSymbols;
  }

  return { init, on, state };
})();
