// Market overview charts (BTC Dominance + USDT/KRW)
let tvDomi = null, tvKimchi = null;

function _chartTheme() {
  return document.body.classList.contains('night') ? 'Dark' : 'Light';
}

function mountCharts() {
  if (!tvDomi && document.getElementById('domichart')) {
    tvDomi = new TradingView.widget({
      autosize: true, symbol: 'CRYPTOCAP:BTC.D', interval: '15',
      timezone: 'Asia/Seoul', theme: _chartTheme(), style: '1', locale: 'en',
      enable_publishing: false, container_id: 'domichart',
    });
  }
  if (!tvKimchi && document.getElementById('kimchichart')) {
    tvKimchi = new TradingView.widget({
      autosize: true, symbol: 'UPBIT:USDTKRW', interval: '15',
      timezone: 'Asia/Seoul', theme: _chartTheme(), style: '1', locale: 'en',
      enable_publishing: false, container_id: 'kimchichart',
    });
  }
}

function remountCharts() {
  // Pause observer so clearing innerHTML doesn't trigger a double-mount race
  _chartObs.disconnect();
  const domiEl   = document.getElementById('domichart');
  const kimchiEl = document.getElementById('kimchichart');
  if (domiEl)   { domiEl.innerHTML   = ''; tvDomi   = null; }
  if (kimchiEl) { kimchiEl.innerHTML = ''; tvKimchi = null; }
  mountCharts();
  _chartObs.observe(document.body, { attributes: true, childList: true, subtree: true });
}

const _chartObs = new MutationObserver(() => {
  if (document.getElementById('domichart')?.offsetParent) mountCharts();
});
_chartObs.observe(document.body, { attributes: true, childList: true, subtree: true });
