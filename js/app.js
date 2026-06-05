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
    const chatName = ref((_savedName || generateNickname()).slice(0, 20));
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
    const visitorCount = ref(0);

    // Tab-scoped session ID for chat presence; persistent user ID for betting/scores
    const _sessionId = sessionStorage.getItem('chatSession') || Math.random().toString(36).slice(2);
    sessionStorage.setItem('chatSession', _sessionId);
    const _userId = localStorage.getItem('predUserId') || Math.random().toString(36).slice(2);
    localStorage.setItem('predUserId', _userId);

    function initChat() {
      try {
        const db = getDb();

        // ── Presence tracking ──────────────────────────────────────────────
        const sessionId = _sessionId;

        db.ref('.info/connected').on('value', (snap) => {
          if (!snap.val()) return;
          const presenceRef = db.ref(`presence/${sessionId}`);
          presenceRef.onDisconnect().remove(); // auto-remove when tab closes
          presenceRef.set({ name: chatName.value, emoji: chatEmoji.value, uid: _userId, ts: Date.now() });
          // Record visit timestamp for 24h visitor window (keyed by persistent userId)
          db.ref(`visitors/${_userId}`).set({ ts: Date.now() });
        });

        db.ref('presence').on('value', (snap) => {
          onlineCount.value = snap.numChildren();
          const ids = new Set();
          snap.forEach(child => { const d = child.val(); if (d?.uid) ids.add(d.uid); });
          _presenceActiveIds = ids;
          recomputeRank();
        });

        // ── 24-hour visitor count ──────────────────────────────────────────
        db.ref('visitors').orderByChild('ts').startAt(Date.now() - 24 * 60 * 60 * 1000).on('value', (snap) => {
          visitorCount.value = snap.numChildren();
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
      } catch(e) {
        console.error('[Chat] init failed:', e);
        chatError.value = '채팅을 불러올 수 없어요. 광고 차단(애드블록) 프로그램을 쓰고 있다면 이 사이트를 허용해 주세요.';
      }
    }

    // ── Prediction system ─────────────────────────────────────────────────────
    const predSymbols   = ['BTC', 'ETH', 'XRP', 'SOL'];
    const predSymbol    = ref('BTC');
    const predPrice     = ref('');
    const predBet       = ref('');
    const predSubmitting = ref(false);
    const predError     = ref('');
    const predPending   = ref(null); // { symbol, targetPrice, targetTs, bet }
    const predCountdown = ref('');
    const predScore     = reactive({ correct: 0, tries: 0, points: 10, ts: 0 });
    const predRank      = ref(null);
    // KIMP claim (points → token). Eligible at >= 100,000 points.
    const kimpAddress   = ref('');
    const kimpClaiming  = ref(false);
    const kimpClaim     = ref(null);  // mirrors claims/{userId}: { address, status, ... }
    const kimpRemaining = ref(null);  // live on-chain KIMP balance of the payout wallet
    const kimpError     = ref('');    // inline error in the airdrop panel
    const showKimpInfo  = ref(false); // toggles the "KIMP" info box
    const showWalletGuide = ref(false); // toggles the "지갑이 없으신가요?" how-to box
    let _predResolveTimer = null;
    let _predCountdownInterval = null;
    let _rawScores = {};
    let _presenceActiveIds = new Set();

    function recomputeRank() {
      const list = Object.entries(_rawScores)
        .map(([id, s]) => ({ id, points: s.points || 0, tries: s.tries || 0 }))
        .filter(s => s.tries > 0 && s.points > 10 && _presenceActiveIds.has(s.id))
        .sort((a, b) => b.points - a.points || a.tries - b.tries);
      const idx = list.findIndex(s => s.id === _userId);
      predRank.value = idx >= 0 ? idx + 1 : null;
    }

    const chatDisplayName = computed(() => {
      const rank = predRank.value ? ` #${predRank.value}` : '';
      const full = `${chatName.value} (${predScore.points}p${rank})`;
      return full.length <= 50 ? full : full.slice(0, 47) + '…';
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

      const hit = Math.abs(actualPrice - targetPrice) / targetPrice <= 0.003;
      const rawChange = hit ? bet * 2 : -bet;
      if (hit) predScore.correct++;
      const pointsBefore = predScore.points;
      predScore.points = Math.max(10, predScore.points + rawChange);
      const actualChange = predScore.points - pointsBefore;

      const fmt = v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
      const earnStr = hit ? `+${actualChange}p 획득 (2x)` : `${actualChange}p 손실`;
      const resultText = hit
        ? `${chatEmoji.value} ${chatDisplayName.value} 적중! ${symbol} 예측 $${fmt(targetPrice)} ±0.3% → 실제 $${fmt(actualPrice)} | 배팅 ${bet}p`
        : `${chatEmoji.value} ${chatDisplayName.value} 실패. ${symbol} 예측 $${fmt(targetPrice)} ±0.3% → 실제 $${fmt(actualPrice)} | 배팅 ${bet}p`;
      const resultBold = `${earnStr} → 총 ${predScore.points}p`;

      predError.value = `${resultText} ${resultBold}`;
      setTimeout(() => { predError.value = ''; }, 8000);

      try {
        const db = getDb();
        await db.ref(`scores/${_userId}`).update({ correct: predScore.correct, tries: predScore.tries, points: predScore.points, ts: Date.now() });
        await db.ref(`predictions/${_userId}`).remove();
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
        db.ref(`scores/${_userId}`).once('value', snap => {
          const d = snap.val();
          if (d) { predScore.correct = d.correct || 0; predScore.tries = d.tries || 0; predScore.points = d.points || 10; predScore.ts = d.ts || 0; }
          // Load pending prediction only after scores are loaded to avoid racing
          // predScore.points=10 (initial) against a resolution that uses the real balance.
          db.ref(`predictions/${_userId}`).once('value', snap2 => {
            const d2 = snap2.val();
            if (!d2) return;
            predPending.value = { symbol: d2.symbol, targetPrice: d2.targetPrice, targetTs: d2.targetTs, bet: d2.bet || 0 };
            if (Date.now() >= d2.targetTs) {
              resolvePrediction();
            } else {
              schedulePredictionResolve(d2.targetTs);
              startCountdownTicker();
            }
          });
        });
        db.ref('settings/pointsReset').on('value', snap => {
          const d = snap.val();
          if (!d || d.ts <= predScore.ts) return;
          predScore.correct = 0;
          predScore.tries = 0;
          predScore.points = d.points;
          predScore.ts = d.ts;
          try { db.ref(`scores/${_userId}`).set({ points: d.points, correct: 0, tries: 0, ts: d.ts }); } catch(e) {}
        });
        db.ref('scores').on('value', snap => {
          _rawScores = snap.val() || {};
          recomputeRank();
        });
        let _prevClaimStatus = null;
        db.ref(`claims/${_userId}`).on('value', snap => {
          const c = snap.val();
          kimpClaim.value = c;
          // Mirror the server's score reset locally — but ONLY when a claim
          // transitions to 'paid' this session, not when an old paid claim
          // loads (otherwise a returning player's fresh points snap to 10).
          if (c && c.status === 'paid' && _prevClaimStatus && _prevClaimStatus !== 'paid') {
            predScore.points = 10; predScore.correct = 0; predScore.tries = 0;
          }
          _prevClaimStatus = c ? c.status : null;
        });
      } catch(e) {}
    }

    watch(predRank, (newRank, oldRank) => {
      if (newRank === 1 && oldRank !== null && oldRank !== 1) {
        predError.value = '🏆 1등이 되었습니다! 다른 사용자의 메시지를 삭제할 수 있습니다.';
        setTimeout(() => { predError.value = ''; }, 5000);
      }
    });

    // On symbol change: always reset price to the new symbol's current price (or empty).
    watch(predSymbol, (sym) => {
      if (predPending.value) return;
      const p = prices[sym]?.binancePrice;
      predPrice.value = p ? String(p) : '';
    });

    function fillPredPriceIfEmpty() {
      if (predPending.value || predPrice.value) return;
      const p = prices[predSymbol.value]?.binancePrice;
      if (p) predPrice.value = String(p);
    }

    async function submitPrediction() {
      const sym = predSymbol.value;
      const target = parseFloat(predPrice.value);
      const bet = Math.min(parseInt(predBet.value) || 0, predScore.points);
      if (!sym || !Number.isFinite(target) || target <= 0 || bet <= 0) return;
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
      const targetTs = Date.now() + 10 * 60 * 1000;
      const pending = { symbol: sym, targetPrice: target, targetTs, bet };

      try {
        const db = getDb();
        await db.ref(`predictions/${_userId}`).set(pending);
        predPending.value = pending;
        schedulePredictionResolve(targetTs);
        startCountdownTicker();
        predPrice.value = '';
        predBet.value = '';
        await db.ref(`scores/${_userId}`).update({ correct: predScore.correct, tries: predScore.tries, points: predScore.points, ts: Date.now() });
        const fmt = v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
        await postSystemMessage(`${chatEmoji.value} ${chatDisplayName.value} — ${sym} 10분 후 $${fmt(target)} 예측 | 배팅 ${bet}p`);
      } catch(e) {
        predScore.tries--;
        predError.value = predPending.value
          ? `이미 예측 중입니다. ${predCountdown.value}`
          : '예측을 저장하지 못했습니다. 잠시 후 다시 시도하세요.';
        setTimeout(() => { predError.value = ''; }, 3000);
      } finally {
        predSubmitting.value = false;
      }
    }

    // Live "airdrop pool remaining" = on-chain KIMP balance of the payout wallet.
    const KIMP_CONTRACT_ADDR = '0xe27Cf321234e5De9c1aBB985532fE308E37BC9e2';
    const KIMP_PAYOUT_WALLET = '0xAf6b4f06D6a3174B60cB3C2EAa6B0820504c6ADc';
    const KAIA_RPCS = [
      'https://public-en.node.kaia.io',
      'https://kaia.drpc.org',
      'https://kaia.blockpi.network/v1/rpc/public',
    ];
    async function fetchKimpRemaining() {
      const data = '0x70a08231000000000000000000000000' + KIMP_PAYOUT_WALLET.slice(2).toLowerCase();
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: KIMP_CONTRACT_ADDR, data }, 'latest'] });
      for (const rpc of KAIA_RPCS) {
        try {
          const res = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
          const j = await res.json();
          if (j && j.result && j.result !== '0x') {
            kimpRemaining.value = Number(BigInt(j.result) / (10n ** 18n));
            console.info('[KIMP] remaining =', kimpRemaining.value, 'via', rpc);
            return; // got it — stop trying fallbacks
          }
          console.warn('[KIMP] unexpected response from', rpc, j);
        } catch (e) {
          console.warn('[KIMP] fetch failed at', rpc, '—', e && e.message);
        }
      }
      console.warn('[KIMP] all RPCs failed (likely an ad/privacy blocker, or page opened via file://).');
    }

    // Submit a request to convert points → KIMP. The payout (and points reset)
    // happens server-side (payout.py reads the real score, sends KIMP, resets).
    async function claimKimp() {
      const addr = kimpAddress.value.trim();
      // Like the chat/betting errors — show an inline message instead of hiding the button.
      if (predScore.points < 100000) {
        kimpError.value = `100,000p 이상 모아야 KIMP로 전환할 수 있어요. (현재 ${predScore.points.toLocaleString()}p)`;
        setTimeout(() => { kimpError.value = ''; }, 4000);
        return;
      }
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
        kimpError.value = '올바른 Kaia 지갑 주소를 입력하세요 (0x...).';
        setTimeout(() => { kimpError.value = ''; }, 4000);
        return;
      }
      kimpClaiming.value = true;
      try {
        const db = getDb();
        await db.ref(`claims/${_userId}`).set({
          address: addr,
          status: 'pending',
          points: predScore.points,
          ts: Date.now(),
        });
        kimpAddress.value = '';
        kimpError.value = '';
      } catch (e) {
        kimpError.value = '신청을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
        setTimeout(() => { kimpError.value = ''; }, 4000);
      } finally {
        kimpClaiming.value = false;
      }
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
    const chartInterval = ref('15');
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
        // CC 1-min bars: shown while no real Upbit data has arrived; refreshes every 30 s.
        function _fetchCCBars() {
          fetch(`https://min-api.cryptocompare.com/data/v2/histominute?fsym=${symbol}&tsym=KRW&limit=30&e=Upbit`)
            .then(r => r.json())
            .then(data => {
              if (tradeGeneration !== gen) return;
              if (recentTrades.value.length > 0 && recentTrades.value[0].qty > 0) return;
              const bars = parseCryptoCompareBars(data);
              if (bars.length) recentTrades.value = bars;
            })
            .catch(() => {});
        }
        _fetchCCBars();
        const _ccBarTimer = setInterval(() => {
          if (tradeGeneration !== gen) { clearInterval(_ccBarTimer); return; }
          if (recentTrades.value[0]?.qty > 0) { clearInterval(_ccBarTimer); return; }
          _fetchCCBars();
        }, 30000);

        // REST: initial load + refresh every 5 s until the WebSocket delivers its first
        // real-time trade. Stops when WS works; keeps panel fresh when WS is blocked.
        let _wsHasDelivered = false;
        function _fetchRestTrades() {
          fetch(`https://api.upbit.com/v1/trades/ticks?market=KRW-${symbol}&count=30`)
            .then(r => r.json())
            .then(list => {
              if (tradeGeneration !== gen || !Array.isArray(list)) return;
              recentTrades.value = parseUpbitRestTrades(list);
            })
            .catch(() => {});
        }
        _fetchRestTrades();
        const _restTimer = setInterval(() => {
          if (tradeGeneration !== gen || _wsHasDelivered) { clearInterval(_restTimer); return; }
          _fetchRestTrades();
        }, 5000);

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
            const buf = await e.data.arrayBuffer();
            if (tradeGeneration !== gen) return;
            const trade = parseUpbitWsTrade(JSON.parse(new TextDecoder().decode(buf)));
            if (!trade) return;
            _wsHasDelivered = true; // WS is live — stop the REST refresh loop
            _tradeBuf.push(trade);
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
            _tradeBuf.push(parseBinanceTrade(JSON.parse(e.data)));
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
      } else if (event === 'symbols-remove') {
        const toRemove = new Set(data);
        allSymbols.value = allSymbols.value.filter(s => !toRemove.has(s));
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
        // CC events (fromCC=true) may also expand allSymbols: CC e=Upbit only returns
        // coins on Upbit, so any symbol it emits is safe to add to the table.
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
        fillPredPriceIfEmpty();
      } else if (event === 'binance-prices') {
        Object.entries(data).forEach(([symbol, price]) => {
          if (!prices[symbol]) prices[symbol] = {};
          if (!prices[symbol].binancePrice) prices[symbol].binancePrice = price;
        });
        fillPredPriceIfEmpty();
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
      fetchKimpRemaining();                      // run immediately, independent of exchange init
      setInterval(fetchKimpRemaining, 60000);    // refresh the live "remaining" every 60s
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
      chatName, chatEmoji, chatDisplayName, chatEditingNick, chatInput, chatInputEl, chatMessages, chatSending, chatError, chatScrollEl, onlineCount, visitorCount,
      sendChatMessage, saveNickname, deleteMessage, resetAllPoints,
      predSymbol, predSymbols, predPrice, predBet, predSubmitting, predError, predPending, predCountdown, predScore, predRank, submitPrediction,
      kimpAddress, kimpClaiming, kimpClaim, claimKimp, kimpRemaining, kimpError, showKimpInfo, showWalletGuide,
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
