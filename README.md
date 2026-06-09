# 실시간김프 — Kimchi Premium

Real-time tracker for the **Kimchi Premium (김치프리미엄)** — the price gap between Korean crypto exchange Upbit (KRW) and global exchange Binance (USDT).

🌐 **Live site:** [realtimekimp.com](https://realtimekimp.com)

---

## Features

- **Real-time prices** via WebSocket — Upbit and Binance stream simultaneously
- **Kimchi premium** (%) and KRW gap for BTC and all common coins
- **Exchange rates** — USD/KRW, JPY/KRW, USDT/KRW refreshed every minute
- **BTC dominance** from Coinlore (CoinGecko fallback)
- **Coinbase USD premium** vs Binance (BTC only)
- **Coin table** — sortable by price, change, volume, or premium; All / Favorites tabs; coin search
- **Coin detail panel** — price chart, liquidation heatmap, recent trades, 24h alarm
- **TradingView charts** — BTC Dominance and USDT/KRW
- **Live chat** — anonymous, rate-limited, powered by Firebase Realtime Database
- **News feed** and **liquidation feed**
- **Price prediction game** — bet on BTC direction in chat, with scoring and live leaderboard
- **Sticky info bar** — USD/KRW, JPY/KRW, USDT/KRW, BTC Dominance pinned below nav while scrolling
- **Night mode** with localStorage persistence
- Fully **responsive** — desktop sidebar layout and mobile-optimized 5-column table

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | Vue 3 (CDN, Composition API) |
| Styling | Vanilla CSS, custom properties for theming |
| Charts | TradingView Widget |
| Price data | Upbit WebSocket + REST (KRW), Binance WebSocket + REST (USD), Bithumb REST (temporary KRW fallback) |
| Exchange rate | Coinbase API (`/v2/exchange-rates`) |
| Market data | Coinlore `/api/global/` (CoinGecko fallback) |
| Chat / Presence | Firebase Realtime Database |
| Hosting | GitHub Pages (deployed via GitHub Actions) |

No build step. No bundler. Open `index.html` in a browser and it works.

---

## Project Structure

```
kimchi-premium/
├── index.html          # Single-page app entry point
├── css/
│   └── style.css       # All styles, responsive breakpoints at 768px / 1024px
├── js/
│   ├── exchanges.js    # Exchange data manager (Upbit list + prices, Binance, Coinbase, Bithumb price fallback, rates)
│   ├── app.js          # Vue app — state, table logic, chat, alarms, coin detail
│   ├── charts.js       # TradingView widget mount/unmount helpers
│   ├── tradeStream.js  # Coin detail real-time trade feed (Upbit WebSocket + REST, Bithumb fallback)
│   ├── prediction.js   # Price prediction game logic
│   └── utils.js        # Pure formatting helpers (fmtKrw, fmtPct, fmtPremium, …)
├── tests/              # Node built-in test runner (run with `npm test`)
│   ├── utils.test.mjs       # formatting helpers
│   ├── prediction.test.mjs  # prediction-game logic
│   └── tradeStream.test.mjs # trade-feed + Bithumb parsers
├── firebase/           # Firebase Realtime Database security rules
├── .github/workflows/  # CI: run tests, then deploy to GitHub Pages on push to main
└── package.json        # Only used for running tests (no dependencies)
```

---

## Running Locally

Just open `index.html` in any modern browser — no server required for the core tracker.

For the **live chat** to work you need a Firebase project:
1. Create a Firebase project with Realtime Database enabled
2. Fill in `FIREBASE_CONFIG` in `js/app.js` with your project credentials
3. Deploy the security rules in `firebase/`

---

## Tests

Unit tests cover the formatting utilities (`fmtKrw`, `fmtUsd`, `fmtPct`, `fmtPremium`, `fmtKrwGap`, `fmtVolume`, `fmtTradePrice`, `fmtLiqUsd`, `createRateLimiter`, …), the price-prediction game logic, and the trade-stream / Bithumb parsers. They run in CI on every push and gate the GitHub Pages deploy.

```bash
npm test
```

Requires Node 20+. No additional packages needed.

---

## Data Sources

| Data | Source | Refresh |
|---|---|---|
| Coin list | Upbit `/v1/market/all` | On load (retried until it succeeds) |
| Upbit KRW prices | Upbit WebSocket `wss://api.upbit.com/websocket/v1` + REST | Real-time |
| Temporary KRW prices | Bithumb `/public/ticker/ALL_KRW` | On load, until Upbit prices arrive |
| Binance USD prices | Binance WebSocket `wss://stream.binance.com:9443/ws/!miniTicker@arr` | Real-time |
| Coinbase BTC price | Coinbase REST API | Every 5 s |
| USD/KRW, JPY/KRW | Coinbase API `/v2/exchange-rates` | Every 60 s |
| BTC dominance | Coinlore `/api/global/` (CoinGecko fallback) | Every 2 min |

The coin list is always Upbit's; Bithumb only supplies placeholder KRW prices until live
Upbit data arrives (and as a fallback when Upbit is rate-limited). All data is fetched
client-side — no backend server.

---

## License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).

You are free to use, modify, and distribute this code, but any modified version — including one run as a web service — must also be released under AGPL-3.0 with its source code publicly available.
