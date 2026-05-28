// Pure formatting utilities — used by app.js (browser global) and tests (CJS require)

function fmtKrw(n) {
  if (!n) return '--';
  return Math.round(n).toLocaleString('en-US');
}

function fmtUsd(n) {
  if (!n) return '--';
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '--';
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

function fmtPremium(n) {
  if (n == null || isNaN(n)) return '--';
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
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
  if (n >= 1)    return n.toFixed(0) + 'B';
  return (n * 100).toFixed(0) + 'M';
}

function fmtTradePrice(n) {
  if (!n) return '--';
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 100)  return n.toFixed(3);
  if (n >= 1)    return n.toFixed(4);
  if (n >= 0.1)  return n.toFixed(5);
  if (n >= 0.01) return n.toFixed(6);
  return n.toFixed(8);
}

function fmtTradeQty(n) {
  if (n >= 100) return n.toFixed(1);
  if (n >= 1)   return n.toFixed(3);
  return n.toFixed(5);
}

function fmtLiqUsd(n) {
  if (!n) return '$0';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

function fmtLiqPrice(n) {
  if (!n) return '--';
  if (n >= 10000) return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (n >= 100)   return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1)     return n.toFixed(4);
  return n.toFixed(6);
}

function newsAge(ts) {
  const mins = Math.floor((Date.now() / 1000 - ts) / 60);
  if (mins < 60) return mins + 'm';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h';
  return Math.floor(hrs / 24) + 'd';
}

function coinIcon(symbol) {
  return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${symbol.toLowerCase()}.png`;
}

// Sliding-window rate limiter.
// limit=4 → 4 sends allowed per window; 5th send within the window is blocked.
function createRateLimiter({ limit = 4, window: win = 15_000, block = 60_000 } = {}) {
  const ts = [];
  let blockedUntil = 0;
  return {
    try(now = Date.now()) {
      if (now < blockedUntil)
        return { ok: false, retryAfter: Math.ceil((blockedUntil - now) / 1000) };
      while (ts.length && now - ts[0] > win) ts.shift();
      if (ts.length >= limit) {
        blockedUntil = now + block;
        return { ok: false, retryAfter: Math.ceil(block / 1000) };
      }
      ts.push(now);
      return { ok: true };
    },
  };
}

// Export for Node.js (tests); in browser these are already globals
if (typeof module !== 'undefined') {
  module.exports = {
    fmtKrw, fmtUsd, fmtPct, fmtPremium,
    pctClass, premiumClass, fmtVolume,
    fmtTradePrice, fmtTradeQty,
    fmtLiqUsd, fmtLiqPrice,
    newsAge, coinIcon,
    createRateLimiter,
  };
}
