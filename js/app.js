const { createApp, ref, computed, reactive, onMounted, watch, nextTick } = Vue;

createApp({
  setup() {
    // --- State ---
    const usdKrw = ref(0);
    const jpyKrw = ref(0);
    const btcDominance = ref('--');
    const coinbaseUsdPremium = ref('--');
    const usdtKrwPrice = ref(0);
    const nightMode = ref(localStorage.getItem('nightMode') === '1');
    const searchStr = ref('');
    const showFilter = ref(false);
    const _desktop = window.innerWidth > 1024;
    const showCharts = ref(window.innerWidth > 768);
    const showAlarm = ref(false);
    const showChat = ref(_desktop);
    const showNews = ref(_desktop);
    const showLiq  = ref(_desktop);

    // ── Chat (Firebase Realtime Database) ────────────────────────────────────
    // Paste your config from: Firebase console → Project Settings → Your apps → SDK setup
    const FIREBASE_CONFIG = {
      apiKey:            'YOUR_API_KEY',
      authDomain:        'YOUR_PROJECT.firebaseapp.com',
      databaseURL:       'https://realtimekimp-default-rtdb.asia-southeast1.firebasedatabase.app',
      projectId:         'YOUR_PROJECT',
      storageBucket:     'YOUR_PROJECT.appspot.com',
      messagingSenderId: 'YOUR_SENDER_ID',
      appId:             'YOUR_APP_ID',
    };

    let _firebaseReady = false;
    function getDb() {
      if (!_firebaseReady) {
        firebase.initializeApp(FIREBASE_CONFIG);
        _firebaseReady = true;
      }
      return firebase.database();
    }

    function generateNickname() {
      const adj = [
        '빠른','강한','숨은','황금','번개','비밀','용감한','날쌘',
        '달빛','불꽃','전설','최강','빛나는','새벽','폭풍','침묵',
        '얼음','어둠','강철','은밀','바람','천둥','우주','혜성',
        '심해','극한','화염','무적','신비','날카로운','냉혹','불굴',
        '다이아','영원','구름','붉은','푸른','검은','하얀','녹색',
      ];
      const noun = [
        '고래','황소','상어','독수리','곰','여우','늑대','새우',
        '사자','호랑이','치타','팬더','코브라','매','불사조','유니콘',
        '악어','표범','맘모스','문어','돌고래','봉황','용','흑표',
        '기사','마법사','전사','탐정','해커','트레이더','고수','챔피언',
        '스라소니','코뿔소','하이에나','수리','번개매','심해어','우주인','검투사',
      ];
      return adj[Math.floor(Math.random()*adj.length)]
           + noun[Math.floor(Math.random()*noun.length)]
           + Math.floor(Math.random()*100);
    }

    function generateEmoji() {
      const emojis = [
        '😀','😂','😅','😍','🤔','😎','🥳','🤩','😱','🙄','😴','🤣','😇','🥰','😤',
        '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵',
        '🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🦋','🐌','🐞',
        '🐢','🐍','🦎','🦕','🐙','🦑','🦀','🐡','🐠','🐟','🐬','🐳','🦈','🐊','🐅',
        '🐆','🦓','🐘','🦛','🐪','🐫','🦒','🦘','🐃','🐄','🐎','🐏','🐑','🐐','🐕',
        '🐈','🦃','🦚','🦜','🦢','🦩','🕊','🐇','🦝','🦨','🦡','🦦','🦥','🐿','🦔',
        '🌸','🌺','🌻','🌹','🌷','🌼','💐','🍀','🌴','🌵','🍄','🌊','🔥','⭐','🌙',
        '🍎','🍊','🍋','🍇','🍓','🍒','🍑','🥭','🍍','🥝','🍅','🫐','🍕','🍔','🌮',
        '🍜','🍣','🍩','🎂','🍦','🧁','🍫','🍿','🧃','🍺','🧋','🫖',
        '⚽','🏀','🏈','⚾','🎾','🏐','🎱','🏓','🎯','🎮','🎲','🎻','🎸','🥁','🎹',
        '🚀','🛸','✈','🚂','🚢','🏎','🛺','🚁','🛻','🚒',
        '💎','💰','🔑','🎁','🎉','🏆','🥇','🎊','🎈','✨','💫','🌈','☄','🎭','🎨',
      ];
      return emojis[Math.floor(Math.random() * emojis.length)];
    }

    const _savedName = localStorage.getItem('chatName');
    const chatName = ref(_savedName || generateNickname());
    if (!_savedName) localStorage.setItem('chatName', chatName.value);

    const _savedEmoji = localStorage.getItem('chatEmoji');
    const chatEmoji = ref(_savedEmoji || generateEmoji());
    if (!_savedEmoji) localStorage.setItem('chatEmoji', chatEmoji.value);

    const chatEditingNick = ref(false);
    const chatInput = ref('');
    const chatInputEl = ref(null);
    const chatMessages = ref([]);
    const chatSending = ref(false);
    const chatError = ref('');
    const chatScrollEl = ref(null);

    function saveNickname() {
      if (!chatName.value.trim()) chatName.value = generateNickname();
      localStorage.setItem('chatName', chatName.value);
      chatEditingNick.value = false;
    }

    const onlineCount = ref(0);

    function initChat() {
      try {
        const db = getDb();

        // ── Presence tracking ──────────────────────────────────────────────
        // Use a per-tab session ID so each open tab counts separately
        const sessionId = sessionStorage.getItem('chatSession') || Math.random().toString(36).slice(2);
        sessionStorage.setItem('chatSession', sessionId);

        db.ref('.info/connected').on('value', (snap) => {
          if (!snap.val()) return;
          const presenceRef = db.ref(`presence/${sessionId}`);
          presenceRef.onDisconnect().remove(); // auto-remove when tab closes
          presenceRef.set({ name: chatName.value, emoji: chatEmoji.value, ts: Date.now() });
        });

        db.ref('presence').on('value', (snap) => {
          onlineCount.value = snap.numChildren();
        });

        // ── Messages ───────────────────────────────────────────────────────
        const since = Date.now() - 24 * 60 * 60 * 1000;
        db.ref('messages').orderByChild('ts').startAt(since).limitToLast(50).on('value', async (snap) => {
          const data = snap.val();
          chatMessages.value = data
            ? Object.entries(data).map(([id, m]) => ({ id, ...m })).sort((a, b) => a.ts - b.ts)
            : [];
          await nextTick();
          if (chatScrollEl.value) chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight;
        });
      } catch(e) {}
    }

    const _chatLimiter = createRateLimiter();
    let _countdownTimer = null;

    function startCountdown(seconds) {
      chatError.value = `너무 많은 메시지입니다. ${seconds}초 후에 다시 시도하세요.`;
      clearInterval(_countdownTimer);
      let remaining = seconds;
      _countdownTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(_countdownTimer);
          chatError.value = '';
        } else {
          chatError.value = `너무 많은 메시지입니다. ${remaining}초 후에 다시 시도하세요.`;
        }
      }, 1000);
    }

    async function sendChatMessage() {
      const text = chatInput.value.trim();
      if (!text) return;

      const limit = _chatLimiter.try();
      if (!limit.ok) {
        startCountdown(limit.retryAfter);
        return;
      }

      if (chatSending.value) return;
      chatSending.value = true;
      chatError.value = '';
      try {
        const db = getDb();
        await db.ref('messages').push({
          from: chatName.value,
          emoji: chatEmoji.value,
          text,
          ts: firebase.database.ServerValue.TIMESTAMP,
        });
        chatInput.value = '';
      } catch(e) {
        chatError.value = 'Failed to send. Please try again.';
      } finally {
        chatSending.value = false;
        await nextTick();
        chatInputEl.value?.focus();
      }
    }

    const status = reactive({ upbit: 'disconnected', binance: 'disconnected' });
    const STABLECOINS = new Set(['USDT', 'USDC', 'USDS', 'BUSD', 'DAI', 'TUSD', 'FDUSD', 'PYUSD', 'USDP']);

    function safeJsonParse(key, fallback) {
      try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch(e) { return fallback; }
    }

    const _savedFavs = new Set(Array.isArray(safeJsonParse('favCoins', [])) ? safeJsonParse('favCoins', []) : []);
    STABLECOINS.forEach(s => _savedFavs.delete(s));
    const favCoins = ref(_savedFavs);
    const showFavOnly = ref(_savedFavs.size > 0);
    const alarms = ref(Array.isArray(safeJsonParse('alarms', [])) ? safeJsonParse('alarms', []) : []);

    // Sorting — default: market-cap rank ascending
    const initialLoading = ref(true);
    const sortKey = ref('top20Rank');
    const sortDir = ref(-1);

    // --- Coin chart ---
    const selectedCoin = ref(null);
    const chartExchange = ref('upbit');
    const chartMarket = ref('KRW');
    const chartInterval = ref('60');
    const chartIntervals = [
      { value: '1', label: '1m' }, { value: '3', label: '3m' },
      { value: '5', label: '5m' }, { value: '15', label: '15m' },
      { value: '30', label: '30m' }, { value: '60', label: '1H' },
      { value: '240', label: '4H' }, { value: '1D', label: '1D' },
      { value: '1W', label: '1W' }, { value: '1M', label: '1M' },
    ];

    function buildTvSymbol(coin, exchange, market) {
      if (exchange === 'upbit') return `UPBIT:${coin}KRW`;
      return market === 'BTC' ? `BINANCE:${coin}BTC` : `BINANCE:${coin}USDT`;
    }

    // --- Real-time trade stream (Upbit or Binance) ---
    let tradeWs = null;
    let tradeGeneration = 0;
    const recentTrades = ref([]);
    let _tradeBuf = [];
    let _tradeRaf = null;

    function _flushTradeBuf(gen) {
      _tradeRaf = null;
      if (tradeGeneration !== gen || _tradeBuf.length === 0) { _tradeBuf = []; return; }
      const batch = _tradeBuf.reverse();
      _tradeBuf = [];
      recentTrades.value = [...batch, ...recentTrades.value].slice(0, 30);
    }

    function connectTradeStream(symbol, exchange) {
      if (_tradeRaf !== null) { cancelAnimationFrame(_tradeRaf); _tradeRaf = null; }
      if (tradeWs) { tradeWs.close(); tradeWs = null; }
      _tradeBuf = [];
      recentTrades.value = [];
      const gen = ++tradeGeneration;

      if (exchange === 'upbit') {
        const ws = new WebSocket('wss://api.upbit.com/websocket/v1');
        tradeWs = ws;
        ws.onopen = () => {
          ws.send(JSON.stringify([
            { ticket: 'kimchi-trade' },
            { type: 'trade', codes: [`KRW-${symbol}`], isOnlyRealtime: true },
          ]));
        };
        ws.onmessage = async (e) => {
          try {
            if (tradeGeneration !== gen) return;
            const text = new TextDecoder().decode(await e.data.arrayBuffer());
            const d = JSON.parse(text);
            if (d.type !== 'trade') return;
            _tradeBuf.push({ id: d.sequential_id || Date.now(), price: d.trade_price, qty: d.trade_volume, isBuy: d.ask_bid === 'BID', time: new Date(d.trade_timestamp) });
            if (_tradeRaf === null) _tradeRaf = requestAnimationFrame(() => _flushTradeBuf(gen));
          } catch(e) {}
        };
        ws.onerror = () => ws.close();
        ws.onclose  = () => { if (tradeWs === ws) tradeWs = null; };
      } else {
        const market = chartMarket.value === 'BTC' ? 'btc' : 'usdt';
        const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}${market}@trade`);
        tradeWs = ws;
        ws.onmessage = (e) => {
          try {
            if (tradeGeneration !== gen) return;
            const d = JSON.parse(e.data);
            _tradeBuf.push({ id: d.t, price: parseFloat(d.p), qty: parseFloat(d.q), isBuy: !d.m, time: new Date(d.T) });
            if (_tradeRaf === null) _tradeRaf = requestAnimationFrame(() => _flushTradeBuf(gen));
          } catch(e) {}
        };
        ws.onerror = () => { if (tradeWs === ws) { ws.close(); tradeWs = null; } };
        ws.onclose  = () => { if (tradeWs === ws) tradeWs = null; };
      }
    }

    function disconnectTradeStream() {
      if (_tradeRaf !== null) { cancelAnimationFrame(_tradeRaf); _tradeRaf = null; }
      tradeGeneration++;
      if (tradeWs) { tradeWs.close(); tradeWs = null; }
      _tradeBuf = [];
      recentTrades.value = [];
    }

    // fmtTradePrice, fmtTradeQty — defined in js/utils.js

    function mountCoinChart() {
      const container = document.getElementById('coin-chart-container');
      if (!container || !selectedCoin.value) return;
      container.innerHTML = '';
      new TradingView.widget({
        autosize: true,
        symbol: buildTvSymbol(selectedCoin.value, chartExchange.value, chartMarket.value),
        interval: chartInterval.value,
        timezone: 'Asia/Seoul',
        theme: nightMode.value ? 'Dark' : 'Light',
        style: '1',
        locale: 'en',
        enable_publishing: false,
        allow_symbol_change: true,
        container_id: 'coin-chart-container',
      });
    }

    async function showCoinChart(symbol) {
      if (selectedCoin.value === symbol) {
        closeCoinChart();
        return;
      }
      chartExchange.value = 'binance';
      chartMarket.value = 'USDT';
      selectedCoin.value = symbol;
      connectTradeStream(symbol, 'binance');
      await nextTick();
      document.getElementById('coin-chart-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      mountCoinChart();
    }

    function closeCoinChart() {
      selectedCoin.value = null;
      disconnectTradeStream();
    }

    watch([chartExchange, chartMarket, chartInterval], ([newEx, newMkt], [oldEx, oldMkt]) => {
      if (!selectedCoin.value) return;
      mountCoinChart();
      if (newEx !== oldEx || newMkt !== oldMkt) {
        connectTradeStream(selectedCoin.value, newEx);
      }
    });

    // Price data keyed by symbol
    const prices = reactive({});
    // All known symbols (union of upbit + binance)
    const allSymbols = ref([]);
    // Top-20 market cap: symbol -> rank (1-based)
    const top20 = ref({});

    // --- Night mode ---
    watch(nightMode, (v) => {
      document.body.classList.toggle('night', v);
      localStorage.setItem('nightMode', v ? '1' : '0');
      remountCharts();
      if (selectedCoin.value) mountCoinChart();
    }, { immediate: true });

    // --- Computed coin rows (Upbit KRW vs Binance USDT) ---
    const rows = computed(() => {
      let syms = allSymbols.value.filter(s => {
        const p = prices[s];
        return p && p.upbitPrice > 0 && p.binancePrice > 0;
      });

      if (showFavOnly.value) syms = syms.filter(s => favCoins.value.has(s));
      if (searchStr.value) {
        const q = searchStr.value.toUpperCase();
        syms = syms.filter(s => s.includes(q));
      }

      return syms.map(s => {
        const p = prices[s];
        const krwPrice = p.upbitPrice;
        const usdPrice = p.binancePrice;
        const binanceKrw = usdKrw.value ? usdPrice * usdKrw.value : 0;
        const gap = binanceKrw ? krwPrice - binanceKrw : 0;
        const pct = binanceKrw ? gap / binanceKrw * 100 : 0;
        const top20Rank = top20.value[s] ?? null;
        return {
          symbol: s,
          krwPrice,
          usdPrice,
          binanceKrw,
          gap,
          pct,
          change: p.upbitChange ?? 0,
          volume: p.upbitVolume ?? 0,
          upDown: p.upDown,
          binanceUpDown: p.binanceUpDown,
          isFav: favCoins.value.has(s),
          isTop20: top20Rank !== null,
          top20Rank,
        };
      }).sort((a, b) => {
        // rank: always ascending with nulls (non-top20) at bottom
        if (sortKey.value === 'top20Rank') {
          const ra = a.top20Rank ?? 9999;
          const rb = b.top20Rank ?? 9999;
          return ra - rb;
        }
        const va = a[sortKey.value] ?? 0;
        const vb = b[sortKey.value] ?? 0;
        if (typeof va === 'string') return sortDir.value * va.localeCompare(vb);
        return sortDir.value * (vb - va);
      });
    });

    // --- BTC hero row ---
    const btcRow = computed(() => rows.value.find(r => r.symbol === 'BTC') || null);

    // --- Sort ---
    function setSort(key) {
      if (sortKey.value === key) sortDir.value *= -1;
      else { sortKey.value = key; sortDir.value = -1; }
    }
    function sortIcon(key) {
      if (sortKey.value !== key) return '↕';
      return sortDir.value === -1 ? '↓' : '↑';
    }

    // --- Favorites ---
    function toggleFav(symbol) {
      if (favCoins.value.has(symbol)) favCoins.value.delete(symbol);
      else favCoins.value.add(symbol);
      localStorage.setItem('favCoins', JSON.stringify([...favCoins.value]));
    }

    // --- Number formatting --- defined in js/utils.js (globals)
    function onImgError(e) {
      e.target.src = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/generic.png';
    }

    // --- Alarm ---
    function addAlarm(symbol, type, threshold) {
      alarms.value.push({ symbol, type, threshold, id: Date.now() });
      localStorage.setItem('alarms', JSON.stringify(alarms.value));
    }
    function removeAlarm(id) {
      alarms.value = alarms.value.filter(a => a.id !== id);
      localStorage.setItem('alarms', JSON.stringify(alarms.value));
    }
    function checkAlarms() {
      alarms.value.forEach(alarm => {
        const row = rows.value.find(r => r.symbol === alarm.symbol);
        if (!row) return;
        const val = alarm.type === 'premium' ? row.pct : row.krwPrice;
        const hit = alarm.dir === 'above' ? val >= alarm.threshold : val <= alarm.threshold;
        if (hit && !alarm.fired) {
          alarm.fired = true;
          if (Notification.permission === 'granted') {
            new Notification(`${alarm.symbol} alarm`, {
              body: `${alarm.type} ${alarm.dir} ${alarm.threshold}`,
            });
          }
        } else if (!hit) {
          alarm.fired = false;
        }
      });
    }

    // --- Exchange event handling ---
    function handleExchangeEvent(event, data) {
      if (event === 'rate') {
        usdKrw.value = data.usdKrw;
        jpyKrw.value = data.jpyKrw;
        // Compute USDT KRW price from Binance BTCUSDT vs Upbit BTCKRW
        updateUsdtKrw();
      } else if (event === 'global') {
        btcDominance.value = data.btcDominance;
      } else if (event === 'status') {
        Object.assign(status, data);
      } else if (event === 'symbols') {
        allSymbols.value = data.slice();
      } else if (event === 'upbit') {
        const { symbol, data: d, prev } = data;
        if (!prices[symbol]) prices[symbol] = {};
        const upDown = prev && d.price !== prev.price ? (d.price > prev.price ? 'up' : 'down') : null;
        Object.assign(prices[symbol], {
          upbitPrice: d.price,
          upbitChange: d.change,
          upbitVolume: d.volume,
          upDown,
        });
        if (!allSymbols.value.includes(symbol)) allSymbols.value.push(symbol);
        updateUsdtKrw();
        checkAlarms();
      } else if (event === 'binance-batch') {
        data.forEach(({ symbol, data: d, prev }) => {
          if (!prices[symbol]) prices[symbol] = {};
          const binanceUpDown = prev && d.price !== prev.price ? (d.price > prev.price ? 'up' : 'down') : null;
          Object.assign(prices[symbol], {
            binancePrice: d.price,
            binanceChange: d.change,
            binanceVolume: d.volume,
            binanceUpDown,
          });
          if (!allSymbols.value.includes(symbol)) allSymbols.value.push(symbol);
        });
      } else if (event === 'binance-prices') {
        Object.entries(data).forEach(([symbol, price]) => {
          if (!prices[symbol]) prices[symbol] = {};
          if (!prices[symbol].binancePrice) prices[symbol].binancePrice = price;
        });
        updateUsdtKrw();
      } else if (event === 'coinbase-premium') {
        coinbaseUsdPremium.value = data;
      }
    }

    function updateUsdtKrw() {
      if (prices.BTC?.upbitPrice && prices.BTC?.binancePrice && prices.BTC?.binancePrice > 0) {
        usdtKrwPrice.value = prices.BTC.upbitPrice / prices.BTC.binancePrice;
      } else if (usdKrw.value) {
        usdtKrwPrice.value = usdKrw.value;
      }
    }

    // CoinMarketCap top-N by market cap (excluding stablecoins and BNB/TRX which are not on Upbit KRW).
    // CMC overall ranks (including stablecoins) are preserved for accurate badge display.
    // Bump FAV_VERSION whenever CMC_TOP10 changes to reset stale localStorage defaults.
    const FAV_VERSION = 'v4';
    const CMC_TOP10 = [
      { sym: 'BTC',  rank: 1 },
      { sym: 'ETH',  rank: 2 },
      { sym: 'XRP',  rank: 4 },
      { sym: 'SOL',  rank: 6 },
      { sym: 'DOGE', rank: 8 },
      { sym: 'ADA',  rank: 9 },
      { sym: 'AVAX', rank: 11 },
      { sym: 'TON',  rank: 12 },
      { sym: 'SUI',  rank: 13 },
      { sym: 'LINK', rank: 15 },
    ];

    function initFavorites() {
      const map = {};
      CMC_TOP10.forEach(({ sym, rank }) => { map[sym] = rank; });
      top20.value = map;

      // Reset to current defaults if version changed (clears stale coins like BNB/TRX)
      if (safeJsonParse('favVersion', null) !== FAV_VERSION) {
        favCoins.value = new Set(CMC_TOP10.map(c => c.sym));
        localStorage.setItem('favCoins', JSON.stringify([...favCoins.value]));
        localStorage.setItem('favVersion', JSON.stringify(FAV_VERSION));
        showFavOnly.value = true;
      }
    }

    // ── Liquidation stream ─────────────────────────────────────────────────────
    const recentLiqs = ref([]);
    const liqLong24h = ref(0);
    const liqShort24h = ref(0);
    const liqStatus = ref('connecting');
    const _liqHistory = [];
    let _liqWs = null;
    let _bybitWs = null;
    let _okxWs = null;
    const _okxCtVal = {};
    let _liqAttempt = 0, _bybitAttempt = 0, _okxAttempt = 0;

    function _liqBackoff(attempt) {
      return Math.min(30000, 1000 * Math.pow(2, attempt)) + Math.random() * 500;
    }

    function _recomputeLiq24h() {
      const cutoff = Date.now() - 864e5;
      while (_liqHistory.length && _liqHistory[0].ts < cutoff) _liqHistory.shift();
      let lng = 0, sht = 0;
      _liqHistory.forEach(l => { if (l.side === 'LONG') lng += l.usd; else sht += l.usd; });
      liqLong24h.value = lng;
      liqShort24h.value = sht;
    }

    function _pushLiq(symbol, side, usd, price, ts) {
      _liqHistory.push({ ts, side, usd });
      _recomputeLiq24h();
      recentLiqs.value = [{ id: ts + '_' + symbol, symbol, side, usd, price, ts }, ...recentLiqs.value].slice(0, 50);
    }

    // Binance futures — all-market liquidation stream
    function connectLiqStream() {
      if (_liqWs) { _liqWs.close(); _liqWs = null; }
      const ws = new WebSocket('wss://fstream.binance.com/ws/!forceOrder@arr');
      ws.onopen  = () => { _liqAttempt = 0; liqStatus.value = 'connected'; };
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          const o = d.o;
          if (!o) return;
          const side = o.S === 'SELL' ? 'LONG' : 'SHORT';
          const usd  = parseFloat(o.ap) * parseFloat(o.z);
          if (!usd) return;
          _pushLiq(o.s.replace('USDT', ''), side, usd, parseFloat(o.ap), o.T || Date.now());
        } catch(e) {}
      };
      ws.onclose = () => { _liqWs = null; liqStatus.value = 'connecting'; setTimeout(connectLiqStream, _liqBackoff(_liqAttempt++)); };
      ws.onerror  = () => ws.close();
      _liqWs = ws;
    }

    // Bybit — per-symbol liquidation stream (top coins, fires more frequently)
    const _BYBIT_SYMS = ['BTCUSDT','ETHUSDT','XRPUSDT','BNBUSDT','SOLUSDT',
                         'DOGEUSDT','ADAUSDT','TRXUSDT','AVAXUSDT','SHIBUSDT',
                         'DOTUSDT','LINKUSDT','LTCUSDT','NEARUSDT','UNIUSDT',
                         'SUIUSDT','TONUSDT','BCHUSDT','FILUSDT','APTUSDT'];
    function connectBybitLiqStream() {
      if (_bybitWs) { _bybitWs.close(); _bybitWs = null; }
      const ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');
      ws.onopen = () => {
        _bybitAttempt = 0;
        liqStatus.value = 'connected';
        ws.send(JSON.stringify({ op: 'subscribe', args: _BYBIT_SYMS.map(s => 'liquidation.' + s) }));
      };
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (!d.topic || !d.data) return;
          const o = d.data;
          const side = o.side === 'Sell' ? 'LONG' : 'SHORT';
          const usd  = parseFloat(o.size) * parseFloat(o.price);
          if (!usd) return;
          _pushLiq(o.symbol.replace('USDT', ''), side, usd, parseFloat(o.price), o.updatedTime || Date.now());
        } catch(e) {}
      };
      ws.onclose = () => { _bybitWs = null; setTimeout(connectBybitLiqStream, _liqBackoff(_bybitAttempt++)); };
      ws.onerror  = () => ws.close();
      _bybitWs = ws;
    }

    // fmtLiqUsd, fmtLiqPrice — defined in js/utils.js

    // ── OKX liquidation helpers ───────────────────────────────────────────────
    async function fetchOKXInstruments() {
      try {
        const r = await fetch('https://www.okx.com/api/v5/public/instruments?instType=SWAP');
        const d = await r.json();
        if (d.code === '0') {
          d.data.forEach(i => { _okxCtVal[i.instId] = parseFloat(i.ctVal) || 1; });
        }
      } catch(e) {}
    }

    function connectOKXLiqStream() {
      if (_okxWs) { _okxWs.close(); _okxWs = null; }
      const ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');
      ws.onopen = () => {
        _okxAttempt = 0;
        liqStatus.value = 'connected';
        ws.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'liquidation-orders', instType: 'SWAP' }] }));
      };
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (!d.data || !Array.isArray(d.data)) return;
          d.data.forEach(entry => {
            if (!entry.instId || !entry.instId.endsWith('USDT-SWAP')) return;
            const sym = entry.instId.replace('-USDT-SWAP', '');
            const cv = _okxCtVal[entry.instId] || 1;
            (entry.details || []).forEach(det => {
              const side = det.side === 'sell' ? 'LONG' : 'SHORT';
              const usd = parseFloat(det.sz) * cv * parseFloat(det.bkPx);
              if (!usd) return;
              _pushLiq(sym, side, usd, parseFloat(det.bkPx), parseInt(det.ts, 10) || Date.now());
            });
          });
        } catch(e) {}
      };
      ws.onclose = () => { _okxWs = null; setTimeout(connectOKXLiqStream, _liqBackoff(_okxAttempt++)); };
      ws.onerror  = () => ws.close();
      _okxWs = ws;
    }

    async function seedLiqFromOKX() {
      try {
        const liqR = await fetch('https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&state=filled&limit=100');
        const liqD = await liqR.json();
        if (liqD.code !== '0' || !Array.isArray(liqD.data)) return;

        const items = [];
        liqD.data.forEach(entry => {
          if (!entry.instId.endsWith('USDT-SWAP')) return;
          const sym = entry.instId.replace('-USDT-SWAP', '');
          const cv  = _okxCtVal[entry.instId] || 1;
          (entry.details || []).forEach(det => {
            const side = det.side === 'sell' ? 'LONG' : 'SHORT';
            const usd  = parseFloat(det.sz) * cv * parseFloat(det.bkPx);
            const ts   = parseInt(det.ts, 10);
            if (!usd || !ts) return;
            _liqHistory.push({ ts, side, usd });
            items.push({ id: 'okx_' + ts + '_' + sym, symbol: sym, side, usd, price: parseFloat(det.bkPx), ts });
          });
        });

        if (items.length > 0) {
          items.sort((a, b) => b.ts - a.ts);
          recentLiqs.value = items.slice(0, 50);
          _recomputeLiq24h();
        }
      } catch(e) {}
    }

    // ── News feed ─────────────────────────────────────────────────────────────
    const cryptoNews = ref([]);
    const newsStatus = ref('loading');
    const newsUpdatedAt = ref('');

    async function fetchNews() {
      newsStatus.value = 'loading';

      async function fetchRss(feedUrl) {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(feedUrl), { signal: ctrl.signal });
        clearTimeout(tid);
        const d = await r.json();
        if (d.status !== 'ok' || !Array.isArray(d.items) || !d.items.length) throw new Error('empty');
        return d.items.slice(0, 6).map(item => ({
          id: item.guid || item.link, title: item.title, url: item.link,
          published_on: Math.floor(new Date(item.pubDate.replace(' ', 'T') + 'Z').getTime() / 1000),
        }));
      }

      // Primary: blockmedia.co.kr (Korean crypto-focused news)
      try {
        cryptoNews.value = await fetchRss('https://blockmedia.co.kr/feed');
        newsStatus.value = 'ok';
        newsUpdatedAt.value = new Date().toLocaleTimeString();
        setTimeout(fetchNews, 5 * 60 * 1000);
        return;
      } catch(e) {}

      // Fallback: Google News Korean crypto search
      try {
        const gnFeed = 'https://news.google.com/rss/search?q=암호화폐+비트코인&hl=ko&gl=KR&ceid=KR:ko';
        cryptoNews.value = await fetchRss(gnFeed);
        newsStatus.value = 'ok';
        newsUpdatedAt.value = new Date().toLocaleTimeString();
        setTimeout(fetchNews, 5 * 60 * 1000);
        return;
      } catch(e) {}

      newsStatus.value = 'error';
      setTimeout(fetchNews, 60 * 1000);
    }

    // newsAge — defined in js/utils.js

    onMounted(async () => {
      ExchangeManager.on(handleExchangeEvent);
      await ExchangeManager.init();
      initialLoading.value = false;
      initFavorites();
      setInterval(checkAlarms, 5000);
      initChat();
      connectLiqStream();
      connectBybitLiqStream();
      // Fetch OKX instrument ctVals once, then seed history and start WS
      fetchOKXInstruments().then(() => {
        seedLiqFromOKX();
        connectOKXLiqStream();
      });
      fetchNews();
    });

    return {
      usdKrw, jpyKrw, btcDominance, coinbaseUsdPremium, usdtKrwPrice,
      nightMode, searchStr, showFilter, showCharts, showAlarm, showChat, showNews, showLiq,
      chatName, chatEmoji, chatEditingNick, chatInput, chatInputEl, chatMessages, chatSending, chatError, chatScrollEl, onlineCount,
      sendChatMessage, saveNickname,
      status, favCoins, showFavOnly, alarms,
      initialLoading,
      sortKey, sortDir,
      rows, btcRow,
      setSort, sortIcon,
      toggleFav,
      fmtKrw, fmtUsd, fmtPct, fmtPremium, pctClass, premiumClass, fmtVolume,
      coinIcon, onImgError,
      addAlarm, removeAlarm,
      top20,
      selectedCoin, chartExchange, chartMarket, chartInterval, chartIntervals,
      showCoinChart, closeCoinChart,
      recentTrades, fmtTradePrice, fmtTradeQty,
      recentLiqs, liqLong24h, liqShort24h, liqStatus, fmtLiqUsd, fmtLiqPrice,
      cryptoNews, newsStatus, newsUpdatedAt, newsAge,
    };
  }
}).mount('#app');
