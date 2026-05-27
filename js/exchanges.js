// Exchange data manager — handles WebSocket connections and price aggregation

const ExchangeManager = (() => {
  const state = {
    usdKrw: 0,
    jpyKrw: 0,
    upbit: {},      // symbol -> { price, change, volume }
    bithumb: {},
    binance: {},    // symbol -> { price, change, volume }
    coinbase: {},   // symbol -> { price }
    btcDominance: 0,
    coinbaseUsdPremium: 0,
    usdtKrw: 0,
    listeners: [],
    ws: {},
    status: { upbit: 'disconnected', binance: 'disconnected', bithumb: 'disconnected' },
  };

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
      // fallback: try another source
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

  // --- BTC Dominance & global data via CoinGecko ---
  async function fetchGlobal() {
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/global');
      const d = await r.json();
      if (d.data) {
        state.btcDominance = d.data.market_cap_percentage.btc.toFixed(1);
        emit('global', { btcDominance: state.btcDominance });
      }
    } catch(e) {}
    setTimeout(fetchGlobal, 120000);
  }

  // --- Upbit WebSocket ---
  function connectUpbit(symbols) {
    if (state.ws.upbit) { state.ws.upbit.close(); }
    state.status.upbit = 'connecting';
    emit('status', state.status);

    const codes = symbols.map(s => `KRW-${s}`);
    const ws = new WebSocket('wss://api.upbit.com/websocket/v1');

    ws.onopen = () => {
      state.status.upbit = 'connected';
      emit('status', state.status);
      ws.send(JSON.stringify([
        { ticket: 'kimchi-premium' },
        { type: 'ticker', codes, isOnlyRealtime: false },
      ]));
    };

    ws.onmessage = async (e) => {
      const buf = await e.data.arrayBuffer();
      const text = new TextDecoder().decode(buf);
      const d = JSON.parse(text);
      const symbol = d.code.replace('KRW-', '');
      const prev = state.upbit[symbol];
      state.upbit[symbol] = {
        price: d.trade_price,
        change: d.signed_change_rate,
        changePrice: d.signed_change_price,
        volume: d.acc_trade_price_24h / 1e8, // 억원
        high: d.high_price,
        low: d.low_price,
      };
      emit('upbit', { symbol, data: state.upbit[symbol], prev });
    };

    ws.onclose = () => {
      state.status.upbit = 'disconnected';
      emit('status', state.status);
      setTimeout(() => connectUpbit(symbols), 3000);
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
      state.status.binance = 'connected';
      emit('status', state.status);
    };

    ws.onmessage = (e) => {
      const arr = JSON.parse(e.data);
      const updates = [];
      arr.forEach(t => {
        if (!t.s.endsWith('USDT')) return;
        const symbol = t.s.replace('USDT', '');
        const prev = state.binance[symbol];
        state.binance[symbol] = {
          price: parseFloat(t.c),
          change: (parseFloat(t.c) - parseFloat(t.o)) / parseFloat(t.o),
          volume: parseFloat(t.q) / 1e6, // million USDT
          high: parseFloat(t.h),
          low: parseFloat(t.l),
          open: parseFloat(t.o),
        };
        updates.push({ symbol, data: state.binance[symbol], prev });
      });
      if (updates.length) emit('binance-batch', updates);
    };

    ws.onclose = () => {
      state.status.binance = 'disconnected';
      emit('status', state.status);
      setTimeout(connectBinance, 3000);
    };

    ws.onerror = () => ws.close();
    state.ws.binance = ws;
  }

  // --- Bithumb WebSocket ---
  function connectBithumb(symbols) {
    if (state.ws.bithumb) { state.ws.bithumb.close(); }
    state.status.bithumb = 'connecting';
    emit('status', state.status);

    const ws = new WebSocket('wss://pubwss.bithumb.com/pub/ws');

    ws.onopen = () => {
      state.status.bithumb = 'connected';
      emit('status', state.status);
      const syms = symbols.map(s => `${s}_KRW`);
      ws.send(JSON.stringify({ type: 'ticker', symbols: syms, tickTypes: ['MID'] }));
    };

    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type !== 'ticker') return;
        const c = d.content;
        const symbol = c.symbol.replace('_KRW', '');
        const prev = state.bithumb[symbol];
        state.bithumb[symbol] = {
          price: parseFloat(c.closePrice),
          change: parseFloat(c.chgRate) / 100,
          changePrice: parseFloat(c.chgAmt),
          volume: parseFloat(c.volumePower),
        };
        emit('bithumb', { symbol, data: state.bithumb[symbol], prev });
      } catch(e2) {}
    };

    ws.onclose = () => {
      state.status.bithumb = 'disconnected';
      emit('status', state.status);
      setTimeout(() => connectBithumb(symbols), 3000);
    };

    ws.onerror = () => ws.close();
    state.ws.bithumb = ws;
  }

  // --- Coinbase REST (polled, no public WS without auth) ---
  async function fetchCoinbasePrice(symbol = 'BTC') {
    try {
      const r = await fetch(`https://api.exchange.coinbase.com/products/${symbol}-USD/ticker`);
      const d = await r.json();
      const price = parseFloat(d.price);
      state.coinbase[symbol] = { price };
      emit('coinbase', { symbol, price });

      // Coinbase premium vs Binance
      if (symbol === 'BTC' && state.binance.BTC) {
        const binanceUsd = state.binance.BTC.price;
        state.coinbaseUsdPremium = ((price - binanceUsd) / binanceUsd * 100).toFixed(3);
        emit('coinbase-premium', state.coinbaseUsdPremium);
      }
    } catch(e) {}
    setTimeout(() => fetchCoinbasePrice(symbol), 5000);
  }

  // --- Compute kimchi premium ---
  function getKimchiPremium(symbol, criterion = 'upbit', target = 'binance') {
    const krwPrice = criterion === 'upbit' ? state.upbit[symbol]?.price :
                     criterion === 'bithumb' ? state.bithumb[symbol]?.price : null;
    const usdPrice = target === 'binance' ? state.binance[symbol]?.price :
                     target === 'coinbase' ? state.coinbase[symbol]?.price : null;

    if (!krwPrice || !usdPrice || !state.usdKrw) return null;
    const binanceKrw = usdPrice * state.usdKrw;
    const gap = krwPrice - binanceKrw;
    const pct = gap / binanceKrw * 100;
    return { gap, pct, krwPrice, usdPrice, binanceKrw };
  }

  // --- Init available markets ---
  async function fetchUpbitMarkets() {
    try {
      const r = await fetch('https://api.upbit.com/v1/market/all?isDetails=false');
      const d = await r.json();
      return d.filter(m => m.market.startsWith('KRW-')).map(m => m.market.replace('KRW-', ''));
    } catch(e) { return []; }
  }

  async function init() {
    fetchExchangeRate();
    fetchGlobal();

    const upbitSymbols = await fetchUpbitMarkets();
    const defaultSymbols = upbitSymbols.length > 0 ? upbitSymbols :
      ['BTC','ETH','XRP','ADA','SOL','DOGE','DOT','MATIC','AVAX','LINK',
       'ATOM','UNI','LTC','BCH','EOS','TRX','ETC','XLM','ALGO','NEAR'];

    connectUpbit(defaultSymbols);
    connectBinance();
    connectBithumb(defaultSymbols.slice(0, 30)); // Bithumb has fewer coins
    fetchCoinbasePrice('BTC');
    fetchCoinbasePrice('ETH');

    return defaultSymbols;
  }

  return { init, on, state, getKimchiPremium };
})();
