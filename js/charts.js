// Market overview charts (BTC Dominance + USDT/KRW) — mounted once on first visibility
let tvDomi = null, tvKimchi = null;

function mountCharts() {
  if (!tvDomi && document.getElementById('domichart')) {
    tvDomi = new TradingView.widget({
      autosize: true,
      symbol: 'CRYPTOCAP:BTC.D',
      interval: '1D',
      timezone: 'Asia/Seoul',
      theme: document.body.classList.contains('night') ? 'Dark' : 'Light',
      style: '1',
      locale: 'en',
      toolbar_bg: '#f1f3f6',
      enable_publishing: false,
      container_id: 'domichart',
    });
  }
  if (!tvKimchi && document.getElementById('kimchichart')) {
    tvKimchi = new TradingView.widget({
      autosize: true,
      symbol: 'UPBIT:USDTKRW',
      interval: '1D',
      timezone: 'Asia/Seoul',
      theme: document.body.classList.contains('night') ? 'Dark' : 'Light',
      style: '1',
      locale: 'en',
      toolbar_bg: '#f1f3f6',
      enable_publishing: false,
      container_id: 'kimchichart',
    });
  }
}

const _chartObs = new MutationObserver(() => {
  if (document.getElementById('domichart')?.offsetParent) mountCharts();
});
_chartObs.observe(document.body, { attributes: true, childList: true, subtree: true });
