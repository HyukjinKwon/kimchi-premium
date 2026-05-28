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
    const showChat = ref(true);
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
        try {
          firebase.initializeApp(FIREBASE_CONFIG);
        } catch(e) {
          // "duplicate-app" means initializeApp was already called — safe to ignore
          if (e.code !== 'app/duplicate-app') throw e;
        }
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

    // Stable session ID used by both chat and prediction
    const _sessionId = sessionStorage.getItem('chatSession') || Math.random().toString(36).slice(2);
    sessionStorage.setItem('chatSession', _sessionId);

    function initChat() {
      try {
        const db = getDb();

        // ── Presence tracking ──────────────────────────────────────────────
        const sessionId = _sessionId;

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
          requestAnimationFrame(() => {
            if (chatScrollEl.value) chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight;
          });
        });
      } catch(e) { console.error('[Chat] init failed:', e); }
    }

    // ── Prediction system ─────────────────────────────────────────────────────
    const predSymbol    = ref('BTC');
    const predPrice     = ref('');
    const predBet       = ref('');
    const predSubmitting = ref(false);
    const predError     = ref('');
    const predPending   = ref(null); // { symbol, targetPrice, targetTs, bet }
    const predCountdown = ref('');
    const predScore     = reactive({ correct: 0, tries: 0, points: 10, ts: 0 });
    const predRank      = ref(null);
    let _predResolveTimer = null;
    let _predCountdownInterval = null;

    const chatDisplayName = computed(() => {
      const rank = predRank.value ? ` #${predRank.value}` : '';
      return `${chatName.value} (${predScore.points}p${rank})`;
    });

    function startCountdownTicker() {
      clearInterval(_predCountdownInterval);
      _predCountdownInterval = setInterval(() => {
        if (!predPending.value) { predCountdown.value = ''; clearInterval(_predCountdownInterval); return; }
        const rem = predPending.value.targetTs - Date.now();
        if (rem <= 0) { predCountdown.value = '확인 중...'; return; }
        const m = Math.floor(rem / 60000);
        const s = Math.floor((rem % 60000) / 1000);
        predCountdown.value = `${m}분 ${String(s).padStart(2, '0')}초 후 확인`;
      }, 1000);
    }

    async function postSystemMessage(text, textBold) {
      try {
        const db = getDb();
        const msg = { from: chatDisplayName.value, emoji: chatEmoji.value, text, ts: firebase.database.ServerValue.TIMESTAMP, isPrediction: true };
        if (textBold) msg.textBold = textBold;
        await db.ref('messages').push(msg);
      } catch(e) {}
    }

    async function resolvePrediction() {
      console.log('[Pred] resolvePrediction called, pending:', predPending.value);
      if (!predPending.value) return;
      const { symbol, targetPrice, bet = 0 } = predPending.value;
      predPending.value = null;
      clearTimeout(_predResolveTimer);
      clearInterval(_predCountdownInterval);
      predCountdown.value = '';

      const actualPrice = prices[symbol]?.binancePrice;
      console.log('[Pred] actualPrice for', symbol, ':', actualPrice);
      if (!actualPrice) {
        predError.value = `결과 오류: ${symbol} 가격 없음`;
        setTimeout(() => { predError.value = ''; }, 5000);
        return;
      }

      const hit = Math.abs(actualPrice - targetPrice) / targetPrice <= 0.005;
      const rawChange = hit ? bet * 2 : -bet;
      if (hit) predScore.correct++;
      const pointsBefore = predScore.points;
      predScore.points = Math.max(10, predScore.points + rawChange);
      const actualChange = predScore.points - pointsBefore;

      const fmt = v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
      const earnStr = hit ? `+${actualChange}p 획득 (3x)` : `${actualChange}p 손실`;
      const resultText = hit
        ? `${chatEmoji.value} ${chatDisplayName.value} 적중! ${symbol} 예측 $${fmt(targetPrice)} ±0.5% → 실제 $${fmt(actualPrice)} | 배팅 ${bet}p`
        : `${chatEmoji.value} ${chatDisplayName.value} 실패. ${symbol} 예측 $${fmt(targetPrice)} ±0.5% → 실제 $${fmt(actualPrice)} | 배팅 ${bet}p`;
      const resultBold = `${earnStr} → 총 ${predScore.points}p`;

      predError.value = `${resultText} ${resultBold}`;
      setTimeout(() => { predError.value = ''; }, 8000);

      try {
        const db = getDb();
        await db.ref(`scores/${_sessionId}`).update({ correct: predScore.correct, tries: predScore.tries, points: predScore.points, ts: Date.now() });
        await db.ref(`predictions/${_sessionId}`).remove();
        await postSystemMessage(resultText, resultBold);
      } catch(e) { console.error('[Pred] Firebase error:', e); }
    }

    function schedulePredictionResolve(targetTs) {
      clearTimeout(_predResolveTimer);
      _predResolveTimer = setTimeout(resolvePrediction, Math.max(0, targetTs - Date.now()));
    }

    function initPrediction() {
      try {
        const db = getDb();
        db.ref(`scores/${_sessionId}`).once('value', snap => {
          const d = snap.val();
          if (d) { predScore.correct = d.correct || 0; predScore.tries = d.tries || 0; predScore.points = d.points || 10; predScore.ts = d.ts || 0; }
        });
        db.ref('settings/pointsReset').on('value', snap => {
          const d = snap.val();
          if (!d || d.ts <= predScore.ts) return;
          predScore.points = d.points;
          predScore.correct = 0;
          predScore.tries = 0;
          predScore.ts = d.ts;
          try { db.ref(`scores/${_sessionId}`).set({ points: d.points, correct: 0, tries: 0, ts: d.ts }); } catch(e) {}
        });
        db.ref(`predictions/${_sessionId}`).once('value', snap => {
          const d = snap.val();
          if (d) {
            predPending.value = { symbol: d.symbol, targetPrice: d.targetPrice, targetTs: d.targetTs, bet: d.bet || 0 };
            schedulePredictionResolve(d.targetTs);
            startCountdownTicker();
          }
        });
        db.ref('scores').on('value', snap => {
          const data = snap.val() || {};
          const list = Object.entries(data)
            .map(([id, s]) => ({ id, points: s.points || 0, tries: s.tries || 0 }))
            .filter(s => s.tries > 0 && s.points > 10)
            .sort((a, b) => b.points - a.points || a.tries - b.tries);
          const idx = list.findIndex(s => s.id === _sessionId);
          predRank.value = idx >= 0 ? idx + 1 : null;
        });
      } catch(e) {}
    }

    watch(predRank, (newRank, oldRank) => {
      if (newRank === 1 && oldRank !== 1) {
        predError.value = '🏆 1등이 되었습니다! 다른 사용자의 메시지를 삭제할 수 있습니다.';
        setTimeout(() => { predError.value = ''; }, 5000);
      }
    });

    async function submitPrediction() {
      const sym = predSymbol.value.trim().toUpperCase();
      const target = parseFloat(predPrice.value);
      const bet = Math.min(parseInt(predBet.value) || 0, predScore.points);
      if (!sym || !target || target <= 0 || bet <= 0) return;
      if (parseInt(predBet.value) > predScore.points) {
        predError.value = `배팅은 보유 포인트(${predScore.points}p)를 초과할 수 없습니다.`;
        setTimeout(() => { predError.value = ''; }, 3000);
        return;
      }
      if (predPending.value) {
        predError.value = `이미 예측 중입니다. ${predCountdown.value}`;
        setTimeout(() => { predError.value = ''; }, 3000);
        return;
      }

      predSubmitting.value = true;
      predScore.tries++;
      const targetTs = Date.now() + 60 * 60 * 1000;
      predPending.value = { symbol: sym, targetPrice: target, targetTs, bet };
      schedulePredictionResolve(targetTs);
      startCountdownTicker();
      predPrice.value = '';
      predBet.value = '';
      predSubmitting.value = false;

      try {
        const db = getDb();
        await db.ref(`predictions/${_sessionId}`).set({ symbol: sym, targetPrice: target, targetTs, bet });
        await db.ref(`scores/${_sessionId}`).update({ correct: predScore.correct, tries: predScore.tries, points: predScore.points, ts: Date.now() });
        const fmt = v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
        await postSystemMessage(`${chatEmoji.value} ${chatDisplayName.value} — ${sym} 1시간 후 $${fmt(target)} 예측 | 배팅 ${bet}p`);
      } catch(e) {}  // Firebase errors don't cancel the local prediction
    }

    function checkPrediction(symbol) {
      if (!predPending.value || predPending.value.symbol !== symbol) return;
      if (Date.now() >= predPending.value.targetTs) resolvePrediction();
    }

    async function resetAllPoints() {
      if (predScore.points <= 1000000) return;
      try {
        const db = getDb();
        await db.ref('settings/pointsReset').set({ ts: Date.now(), points: 10 });
        await postSystemMessage(`🔄 ${chatDisplayName.value}이(가) 모든 사용자의 포인트를 10p로 초기화했습니다.`);
      } catch(e) { console.error('[Reset] failed:', e); }
    }

    async function deleteMessage(messageId) {
      if (predRank.value !== 1) return;
      try {
        const db = getDb();
        await db.ref(`messages/${messageId}`).update({ deleted: true, deletedBy: chatDisplayName.value });
      } catch(e) {}
    }

    // ── /Prediction system ────────────────────────────────────────────────────

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
          from: chatDisplayName.value,
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
        return p && p.binancePrice > 0;
      });

      if (showFavOnly.value) syms = syms.filter(s => favCoins.value.has(s));
      if (searchStr.value) {
        const q = searchStr.value.toUpperCase();
        syms = syms.filter(s => s.includes(q));
      }

      return syms.map(s => {
        const p = prices[s];
        const krwPrice = p.upbitPrice || 0;
        const usdPrice = p.binancePrice;
        const binanceKrw = usdKrw.value ? usdPrice * usdKrw.value : 0;
        const gap = (krwPrice && binanceKrw) ? krwPrice - binanceKrw : 0;
        const pct = (krwPrice && binanceKrw) ? gap / binanceKrw * 100 : 0;
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
          checkPrediction(symbol);
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
      initPrediction();
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
      chatName, chatEmoji, chatDisplayName, chatEditingNick, chatInput, chatInputEl, chatMessages, chatSending, chatError, chatScrollEl, onlineCount,
      sendChatMessage, saveNickname, deleteMessage, resetAllPoints,
      predSymbol, predPrice, predBet, predSubmitting, predError, predPending, predCountdown, predScore, predRank, submitPrediction,
      status, favCoins, showFavOnly, alarms,
      initialLoading,
      sortKey, sortDir,
      rows, btcRow,
      setSort, sortIcon,
      toggleFav,
      fmtKrw, fmtUsd, fmtPct, fmtPremium, fmtKrwGap, pctClass, premiumClass, fmtVolume,
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
