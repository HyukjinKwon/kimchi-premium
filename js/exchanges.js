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
      const r = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=USD');
      const d = await r.json();
      const rates = d.data.rates;
      if (rates.KRW && rates.JPY) {
        state.usdKrw = parseFloat(rates.KRW);
        state.jpyKrw = parseFloat(rates.KRW) / parseFloat(rates.JPY);
        emit('rate', { usdKrw: state.usdKrw, jpyKrw: state.jpyKrw });
      }
    } catch(e) {}
    setTimeout(fetchExchangeRate, 3000);
  }

  // --- BTC Dominance (localStorage cache survives reloads) ---
  const _cachedDominance = localStorage.getItem('btcDominance');
  if (_cachedDominance) {
    state.btcDominance = _cachedDominance;
  }

  async function fetchGlobal() {
    // Try Coinlore first (no rate limits, closest to TradingView), fall back to CoinGecko
    const sources = [
      async () => {
        const r = await fetch('https://api.coinlore.net/api/global/');
        if (!r.ok) throw new Error(r.status);
        const d = await r.json();
        return d[0]?.btc_d ? parseFloat(d[0].btc_d).toFixed(1) : null;
      },
      async () => {
        const r = await fetch('https://api.coingecko.com/api/v3/global');
        if (r.status === 429) return null;
        if (!r.ok) throw new Error(r.status);
        const d = await r.json();
        return d.data?.market_cap_percentage?.btc != null
          ? d.data.market_cap_percentage.btc.toFixed(1) : null;
      },
    ];
    for (const source of sources) {
      try {
        const val = await source();
        if (val) {
          state.btcDominance = val;
          localStorage.setItem('btcDominance', val);
          emit('global', { btcDominance: state.btcDominance });
          setTimeout(fetchGlobal, 120000);
          return;
        }
      } catch(e) {}
    }
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

  const PRIORITY_SYMS = ['BTC','ETH','XRP','SOL','DOGE','ADA','AVAX','SHIB','SUI','LINK'];

  // Authoritative Upbit symbol set — populated once fetchUpbitMarkets() succeeds.
  // The Bithumb pre-fill uses it to avoid emitting coins not listed on Upbit.
  let _upbitValidSyms = null;

  // Short cache so the symbol-list and price-fill calls share a single ALL_KRW fetch.
  let _bithumbCache = null; // { at, data }
  async function getBithumbData() {
    if (_bithumbCache && Date.now() - _bithumbCache.at < 5000) return _bithumbCache.data;
    try {
      const r = await fetch('https://api.bithumb.com/public/ticker/ALL_KRW');
      if (!r.ok) return null;
      const { status, data } = await r.json();
      if (status !== '0000' || !data) return null;
      _bithumbCache = { at: Date.now(), data };
      return data;
    } catch(e) { return null; }
  }

  // Pre-fill Upbit prices from Bithumb (CORS-open, ~90 ms, no key) so the hero card and
  // top rows show a realistic KRW price/premium immediately — and as a fallback when
  // Upbit is geo-throttled. Bithumb is another KRW exchange, so its prices closely track
  // Upbit; real Upbit REST/WS data overwrites these within ~100 ms. Only symbols confirmed
  // on Upbit are emitted (when that set is known), so Bithumb-only coins don't leak in.
  async function fetchBithumbPrices(symbols) {
    if (!symbols.length) return;
    const allow = _upbitValidSyms ? symbols.filter(s => _upbitValidSyms.has(s)) : symbols;
    if (!allow.length) return;
    const data = await getBithumbData();
    if (data) {
      for (const sym of allow) {
        const t = data[sym];
        if (!t?.closing_price) continue;
        // Skip if real Upbit data has arrived — Upbit REST/WS always sets high/low,
        // which the Bithumb pre-fill never does, so high > 0 marks authoritative data.
        if (state.upbit[sym]?.high > 0) continue;
        const price = parseFloat(t.closing_price);
        const prevClose = parseFloat(t.prev_closing_price);
        const d = {
          price,
          // Approximate Upbit's since-KST-midnight change with Bithumb's day-over-day move.
          change: prevClose > 0 ? (price - prevClose) / prevClose : 0,
          // 24h traded value in KRW, scaled to 억 to match Upbit's volume units.
          volume: parseFloat(t.acc_trade_value_24H || 0) / 1e8,
        };
        state.upbit[sym] = d;
        emit('upbit', { symbol: sym, data: d, prev: null });
      }
    }
  }

  async function init() {
    fetchExchangeRate();
    if (state.btcDominance) emit('global', { btcDominance: state.btcDominance });
    fetchGlobal();

    // Paint the priority coins (all Upbit-listed) instantly with prices while the full
    // Upbit market list loads. Upbit's own ticker (~70 ms) is authoritative; Bithumb
    // (~90 ms, CORS-open) is the temporary price fallback when Upbit is throttled.
    emit('symbols', PRIORITY_SYMS);
    fetchAllUpbitTickers(PRIORITY_SYMS);
    fetchBithumbPrices(PRIORITY_SYMS);
    fetchBinancePriority(PRIORITY_SYMS); // quick 24hr stats for hero card

    // Fetch the Upbit coin list and Binance prices in parallel — the Upbit list is the
    // fast, authoritative source for *which* coins to show; Binance decides which have
    // a USD side. Kicking the list off here (not after) loads the full table sooner.
    const upbitMarketsP = fetchUpbitMarketsUntilLoaded();
    const binancePrices = await fetchBinancePrices();
    const binancePriceSet = new Set(Object.keys(binancePrices));
    emit('binance-prices', binancePrices);

    connectBinance();
    fetchCoinbasePrice();

    // Expand to the full universe once the Upbit list resolves — in the background, NOT
    // awaited, so a transiently throttled Upbit can't stall init() (which gates the
    // favorites/chat/prediction setup that runs right after init() in app.js).
    loadUpbitUniverse(upbitMarketsP, binancePriceSet);

    return PRIORITY_SYMS;
  }

  // The coin list is ALWAYS Upbit's — never substituted by Bithumb. Upbit's market/all
  // can be transiently rate-limited (429), so keep retrying until it loads; the 10
  // priority coins stay visible meanwhile.
  async function fetchUpbitMarketsUntilLoaded() {
    let syms = await fetchUpbitMarkets();
    while (!syms.length) {
      await new Promise(r => setTimeout(r, 5000));
      syms = await fetchUpbitMarkets();
    }
    return syms;
  }

  // Once the Upbit list loads: expand the table, fill temporary prices from Bithumb,
  // seed real Upbit prices over the top, then open the Upbit WS for live updates.
  async function loadUpbitUniverse(upbitMarketsP, binancePriceSet) {
    const upbitSymbols = await upbitMarketsP;
    _upbitValidSyms = new Set(upbitSymbols);

    // Table shows coins listed on both Upbit and Binance (premium needs a USD side).
    const commonSymbols = upbitSymbols.filter(s => binancePriceSet.has(s));
    emit('symbols', commonSymbols);

    // Temporary prices from Bithumb while the real Upbit REST seed is in flight.
    fetchBithumbPrices(commonSymbols);
    await fetchAllUpbitTickers(upbitSymbols);

    // Heavy 24hr Binance stats in the background — change %, volume, high, low.
    fetchBinanceMarkets().then(binanceData => {
      const updates = commonSymbols
        .filter(s => binanceData[s])
        .map(s => ({ symbol: s, data: binanceData[s], prev: null }));
      if (updates.length) emit('binance-batch', updates);
    });

    connectUpbit(upbitSymbols);
  }

  return { init, on, state };
})();
