const { createApp, ref, computed, reactive, onMounted, watch } = Vue;

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
    const showCharts = ref(false);
    const showAlarm = ref(false);
    const status = reactive({ upbit: 'disconnected', binance: 'disconnected', bithumb: 'disconnected' });
    const favCoins = ref(new Set(JSON.parse(localStorage.getItem('favCoins') || '[]')));
    const showFavOnly = ref(false);
    const alarms = ref(JSON.parse(localStorage.getItem('alarms') || '[]'));

    // Sorting
    const sortKey = ref('pct');
    const sortDir = ref(-1); // -1 = desc

    // Active tab: which exchange pair to show
    const activePair = ref('upbit-binance'); // upbit-binance | bithumb-binance | upbit-coinbase

    // Price data keyed by symbol
    const prices = reactive({});
    // All known symbols (union of upbit + binance)
    const allSymbols = ref([]);

    // --- Night mode ---
    watch(nightMode, (v) => {
      document.body.classList.toggle('night', v);
      localStorage.setItem('nightMode', v ? '1' : '0');
    }, { immediate: true });

    // --- Computed coin rows ---
    const rows = computed(() => {
      let syms = allSymbols.value.filter(s => {
        const p = prices[s];
        if (!p) return false;
        const hasUpbit = p.upbitPrice > 0;
        const hasBinance = p.binancePrice > 0;
        if (activePair.value === 'upbit-binance') return hasUpbit && hasBinance;
        if (activePair.value === 'bithumb-binance') return p.bithumbPrice > 0 && hasBinance;
        if (activePair.value === 'upbit-coinbase') return hasUpbit && p.coinbasePrice > 0;
        return hasUpbit && hasBinance;
      });

      if (showFavOnly.value) syms = syms.filter(s => favCoins.value.has(s));
      if (searchStr.value) {
        const q = searchStr.value.toUpperCase();
        syms = syms.filter(s => s.includes(q));
      }

      return syms.map(s => {
        const p = prices[s];
        let krwPrice = 0, usdPrice = 0, altKrwPrice = 0;

        if (activePair.value === 'upbit-binance') {
          krwPrice = p.upbitPrice;
          usdPrice = p.binancePrice;
        } else if (activePair.value === 'bithumb-binance') {
          krwPrice = p.bithumbPrice;
          usdPrice = p.binancePrice;
        } else {
          krwPrice = p.upbitPrice;
          usdPrice = p.coinbasePrice;
        }

        const binanceKrw = usdKrw.value ? usdPrice * usdKrw.value : 0;
        const gap = binanceKrw ? krwPrice - binanceKrw : 0;
        const pct = binanceKrw ? gap / binanceKrw * 100 : 0;

        return {
          symbol: s,
          krwPrice,
          usdPrice,
          binanceKrw,
          upbitPrice: p.upbitPrice,
          bithumbPrice: p.bithumbPrice,
          binancePrice: p.binancePrice,
          coinbasePrice: p.coinbasePrice,
          gap,
          pct,
          change: p.upbitChange ?? p.bithumbChange ?? 0,
          binanceChange: p.binanceChange ?? 0,
          volume: p.upbitVolume ?? 0,
          upDown: p.upDown,
          binanceUpDown: p.binanceUpDown,
          isFav: favCoins.value.has(s),
        };
      }).sort((a, b) => {
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

    // --- Number formatting ---
    function fmtKrw(n) {
      if (!n) return '--';
      return Math.round(n).toLocaleString();
    }
    function fmtUsd(n) {
      if (!n) return '--';
      if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
      if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
      return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
    }
    function fmtPct(n) {
      if (n == null || isNaN(n)) return '--';
      return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
    }
    function fmtPremium(n) {
      if (n == null || isNaN(n)) return '--';
      return (n >= 0 ? '+' : '') + n.toFixed(3) + '%';
    }
    function pctClass(n) {
      if (!n || n === 0) return 'td-neutral';
      return n > 0 ? 'td-up' : 'td-down';
    }
    function premiumClass(n) {
      if (!n || n === 0) return 'neutral';
      return n > 0 ? 'pos' : 'neg';
    }
    function fmtVolume(n) {
      if (!n) return '--';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'T';
      if (n >= 1) return n.toFixed(0) + 'B';
      return (n * 100).toFixed(0) + 'M';
    }
    function coinIcon(symbol) {
      const sym = symbol.toLowerCase();
      return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${sym}.png`;
    }
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
      } else if (event === 'bithumb') {
        const { symbol, data: d } = data;
        if (!prices[symbol]) prices[symbol] = {};
        Object.assign(prices[symbol], {
          bithumbPrice: d.price,
          bithumbChange: d.change,
        });
        if (!allSymbols.value.includes(symbol)) allSymbols.value.push(symbol);
      } else if (event === 'coinbase') {
        const { symbol, price } = data;
        if (!prices[symbol]) prices[symbol] = {};
        prices[symbol].coinbasePrice = price;
        if (!allSymbols.value.includes(symbol)) allSymbols.value.push(symbol);
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

    onMounted(async () => {
      ExchangeManager.on(handleExchangeEvent);
      await ExchangeManager.init();
      setInterval(checkAlarms, 5000);
    });

    return {
      usdKrw, jpyKrw, btcDominance, coinbaseUsdPremium, usdtKrwPrice,
      nightMode, searchStr, showFilter, showCharts, showAlarm,
      status, favCoins, showFavOnly, alarms,
      sortKey, sortDir, activePair,
      rows, btcRow,
      setSort, sortIcon,
      toggleFav,
      fmtKrw, fmtUsd, fmtPct, fmtPremium, pctClass, premiumClass, fmtVolume,
      coinIcon, onImgError,
      addAlarm, removeAlarm,
    };
  }
}).mount('#app');
