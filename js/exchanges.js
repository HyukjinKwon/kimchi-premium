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
        localStorage.setItem('btcDominance', state.btcDominance);
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
  async function fetchUpbitMarkets() {
    try {
      const r = await fetch('https://api.upbit.com/v1/market/all?isDetails=false');
      const d = await r.json();
      return d.filter(m => m.market.startsWith('KRW-')).map(m => m.market.replace('KRW-', ''));
    } catch(e) { return []; }
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

  // Fetch Upbit tickers in parallel batches of 100 (Upbit's max per request).
  // Batches of 20 with ~240 remaining symbols = 12 simultaneous requests, which
  // exceeds Upbit's ~10 req/s quotation rate limit and causes silent 429 failures.
  async function fetchAndStreamUpbitTickers(symbols) {
    const batches = [];
    for (let i = 0; i < symbols.length; i += 100)
      batches.push(symbols.slice(i, i + 100));

    await Promise.all(batches.map(async batch => {
      try {
        const markets = batch.map(s => `KRW-${s}`).join(',');
        const r = await fetch(`https://api.upbit.com/v1/ticker?markets=${encodeURIComponent(markets)}`);
        if (!r.ok) return;
        const list = await r.json();
        if (!Array.isArray(list)) return;
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
      } catch(e) {}
    }));
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

  async function init() {
    fetchExchangeRate();
    fetchGlobal();

    try {
      const cachedDom = localStorage.getItem('btcDominance');
      if (cachedDom) {
        const n = parseFloat(cachedDom);
        if (Number.isFinite(n) && n >= 0 && n <= 100) emit('global', { btcDominance: n.toFixed(1) });
      }
    } catch(e) {}

    // Return visits: show full cached symbol list instantly (t=0)
    // First visit: show priority coins while we fetch
    let cachedSymbols = null;
    try {
      const s = JSON.parse(localStorage.getItem('commonSymbols') || 'null');
      if (Array.isArray(s) && s.length) cachedSymbols = s;
    } catch(e) {}
    emit('symbols', cachedSymbols || PRIORITY_SYMS);

    // Priority coins: fire-and-forget, don't block init on these
    fetchAndStreamUpbitTickers(PRIORITY_SYMS);  // ~20ms, 15KB
    fetchBinancePriority(PRIORITY_SYMS);         // ~50ms,  5KB

    // Start both slow fetches in parallel but handle them independently
    const upbitMarketsP = fetchUpbitMarkets();   // ~30ms,  56KB
    const binancePricesP = fetchBinancePrices(); // ~100ms, 148KB ← former bottleneck

    // As soon as Upbit markets arrive (~30ms), start streaming remaining Upbit
    // prices and expand the table — don't wait for the 148KB Binance file
    const upbitSymbols = await upbitMarketsP;
    const defaultSymbols = upbitSymbols.length > 0 ? upbitSymbols :
      ['BTC','ETH','XRP','ADA','SOL','DOGE','DOT','AVAX','LINK',
       'ATOM','UNI','LTC','BCH','TRX','ETC','XLM','NEAR'];

    const prioritySet = new Set(PRIORITY_SYMS);
    const remainingAll = defaultSymbols.filter(s => !prioritySet.has(s));
    if (!cachedSymbols) emit('symbols', defaultSymbols); // first visit: expand table early
    const remainingTickersP = remainingAll.length
      ? fetchAndStreamUpbitTickers(remainingAll)
      : Promise.resolve();

    // Wait for both Binance prices and remaining Upbit tickers together so the
    // full table renders with all prices already populated (avoids "only N coins" on slow mobile)
    const [binancePrices] = await Promise.all([binancePricesP, remainingTickersP]);
    const binancePriceSet = new Set(Object.keys(binancePrices));
    const commonSymbols = defaultSymbols.filter(s => binancePriceSet.has(s));
    emit('symbols', commonSymbols);
    emit('binance-prices', binancePrices);

    // Cache for next visit so the full table renders at t=0
    try { localStorage.setItem('commonSymbols', JSON.stringify(commonSymbols)); } catch(e) {}

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
