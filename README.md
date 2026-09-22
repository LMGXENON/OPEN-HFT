<div align="center">

# ⚡ OPEN-HFT
### The Open-Source $25,000/yr Institutional Market Microstructure & High-Frequency Trading Terminal

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen?style=flat-square)](https://github.com/LMGXENON/OPEN-HRT)
[![TypeScript 5.6](https://img.shields.io/badge/typescript-5.6-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Vite 6](https://img.shields.io/badge/vite-6.4-purple?style=flat-square&logo=vite)](https://vitejs.dev)
[![Rust 1.80+](https://img.shields.io/badge/rust-1.80%2B-orange?style=flat-square&logo=rust)](https://www.rust-lang.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)](LICENSE)
[![Zero Config](https://img.shields.io/badge/data-zero--api--keys-emerald?style=flat-square)](https://github.com/LMGXENON/OPEN-HRT)
[![Compliance](https://img.shields.io/badge/compliance-SEC%20605%2F606%20%7C%20MiFID%20II-purple?style=flat-square)](docs/ARCHITECTURE.md)

<p align="center">
  <b>The open-source institutional execution forensics and market microstructure engine.</b><br>
  Nanosecond L2 order book telemetry, adverse selection markouts, Best-Execution (Best-Ex) auditing, and live multi-asset data across <b>800+ Crypto pairs (including all memecoins), US Equities, Commodities, ETFs, and FX</b>—directly in your browser with <b>zero API keys required</b>.
</p>

```
+---------------------------------------------------------------------------------------------------------------------+
| OPEN-HFT // ENGINE    [LIVE]   SEC> PEPEUSDT    [BTC] [ETH] [SOL] [DOGE] [PEPE] [WIF] [NVDA] [SPY]   [DES] [F7 EXPORT] |
| [0 ALL TILES]  [1 BOOK]  [2 QUEUE]  [3 LATENCY]  [4 EXECUTIONS]  [5 MARKET]  [6 TRADES]  [7 LOG]  [8 ENGINE]  [9 COL]   |
+---------------------------------------------------------------------------------------------------------------------+
| PEPEUSDT  $0.009852  +7.84%  │  SPREAD: 0.55 bps  │  24H HIGH: $0.0102  │  24H LOW: $0.0091  │  24H VOL: $1.45B     |
+---------------------------------------------------------------------------------------------------------------------+
```

</div>

---

## ⚡ Built for High-Frequency Quantitative Traders & Desks

Trading desks at top quantitative prop firms (Hudson River Trading, Jane Street, Jump Trading, Citadel Securities) and institutional execution arms rely on real-time microsecond forensics to optimize execution algorithms and eliminate toxic fills.

**Open-HFT** gives you direct visual access to the exchange matching engine and microstructure dynamics:

* **800+ Live Assets & Every Memecoin**: Streams real-time Level 2 depth and executed trades via institutional DMA feeds for **every single cryptocurrency and memecoin** (Bitcoin, Ethereum, Solana, Dogecoin, Shiba Inu, Pepe, Dogwifhat, Bonk, Floki, Popcat, Neiro, Trump, Sui, etc.), alongside real-time DMA simulation for US Equities (NVDA, AAPL, MSFT, TSLA, AMZN), Commodities (Gold, Silver, Crude Oil), ETFs (SPY, QQQ), and FX (EUR/USD, USD/JPY).
* **Numbered Tiles Navigation (`0` to `9`)**: Every tile on the screen is assigned an individual number. Clicking a number on the navbar or pressing `1` through `9` on your keyboard isolates and expands that single panel into a full-screen view with pixel-perfect alignment. Pressing `0` restores the complete 9-panel terminal grid.
* **Adverse Selection Markouts**: Post-trade price trajectory curves at $+100\text{ms}, +1\text{s}, +5\text{s}, +30\text{s}$ to diagnose whether resting orders captured spread or suffered toxic fill pick-offs (the winner's curse).
* **Implementation Shortfall (IS) Decomposition**: Mathematically breaks down execution performance into arrival price slippage, half-spread cost, and market impact in basis points (bps).
* **Order Flow Imbalance (OFI)**: Microsecond depth dynamics based on the Cont-Kukanov-Stoikov model to quantify buy/sell pressure conviction before price moves.
* **Dual-Engine Architecture**: Toggle instantly between **Zero-Config Live Exchange Streaming** and **Nanosecond-Accurate Historical Backtest Replay** (zero-copy memory-mapped `.hbr` archives).
* **SEC & MiFID II Best-Ex Compliance**: Automatically generates institutional execution audit scorecards conforming to SEC Rule 605/606 and MiFID II RTS 27/28 standards.

---

## 📖 Complete Guide: How Open-HFT Works & How to Use It

### 1. What Happens When You Launch the Terminal
1. **Instant Connection**: The terminal connects directly to high-throughput exchange feeds without requiring accounts or API keys.
2. **Nanosecond Order Book Construction**: In Live mode, Open-HFT maintains a full Level 2 limit order book with live bids and asks, calculating dynamic spread, micro-price, and depth imbalance.
3. **Execution Strategy Simulation**: As market orders hit the book, Open-HFT's execution engine places passive limit orders and liquidity-taking child orders, tracking execution latency, queue position, fill rate, and adverse selection markouts in real-time.
4. **All 9 Panels Synchronized**: Every panel in the terminal updates continuously with zero blank states, giving a 360-degree view of market dynamics.

### 2. Universal Asset Search (All Coins, Memecoins & Traditional Assets)
* Click the search bar at the top or press `Enter` to focus the search box.
* Type any ticker or coin name—such as `PEPE`, `DOGE`, `WIF`, `SOL`, `BTC`, `NVDA`, `Gold`, `SPY`, or `EURUSD`.
* Open-HFT automatically displays category tags (`[MEME]`, `[CRYPTO]`, `[EQUITY]`, `[COMMODITY]`, `[ETF]`, `[FX]`), live prices, 24-hour percentage changes, and 24-hour volume.
* Select an asset and press `Enter` (or click) to switch the active instrument immediately.

### 3. Numbered Tile Layout System (`0` to `9`)

Each tile has an assigned number displayed on its title bar and on the navbar:

| Key / Tile # | Tile Name | What It Shows in Plain English |
|:---:|---|---|
| **`0`** | **ALL TILES** | Displays the full 9-panel terminal grid showing all microstructure telemetry simultaneously. |
| **`1`** | **BOOK** | High-resolution Level 2 order book with bid/ask depth bars, cumulative volume, split queue bars, and real-time spread in bps. |
| **`2`** | **QUEUE** | Probabilistic queue model estimating your limit order's position in line and probability of being filled. |
| **`3`** | **LATENCY** | Microsecond wire-to-kernel network latency telemetry with sparkline and $p_{50}, p_{95}, p_{99}$ percentiles. |
| **`4`** | **EXECUTIONS** | Real-time execution blotter recording child order fills, arrival benchmarks, and slippage in basis points. |
| **`5`** | **MARKET** | High-frequency Canvas price chart with rolling VWAP and dynamic spread tracking. |
| **`6`** | **TRADES** | Millisecond time & sales tape displaying executed trades, counterparty brokers, execution prices, and trade sizes. |
| **`7`** | **LOG** | Complete order lifecycle audit log (order submission, exchange acknowledgment, queue updates, cancellations, and fills). |
| **`8`** | **ENGINE** | Kernel execution engine throughput metrics: ticks processed per second, fill ratios, and memory footprint. |
| **`9`** | **COLLECTOR** | Ingress network telemetry: incoming packet rates, total bytes received, and sequence continuity. |

> [!TIP]
> **Single-Tile Maximization**: Press any number `1` through `9` on your keyboard (or click the tile number button on the navbar) to expand that tile to 100% full-screen. Press `0` to instantly return to the full 9-tile grid. You can also click the number badge directly inside any panel header to toggle focus!

### 4. Security Description Profile (`DES`)
* Press `F8` or `D` on your keyboard, or click the **`[DES] PROFILE`** button on the top navigation bar.
* An institutional modal dialog opens displaying:
  * **Core Security Identifiers**: Ticker, Exchange, Sector, Asset Class, Base Currency.
  * **Fundamental Valuation**: Market Cap, P/E Ratio, EV/EBITDA, Price-to-Sales, EPS.
  * **Trading & Liquidity Telemetry**: 52-Week Range, Average Daily Volume (ADV), 30-Day Volatility, Tick Size, Lot Size.
  * **Microstructure SLA**: Target Adverse Selection Markout SLA, Target Spread, Queue SLA, and Benchmark Matching Engine.
* Press `ESC` or click `[CLOSE]` to dismiss the profile.

### 5. Switching Between Live Feed and Replay Archive
* Click the mode toggle button on the left of the navigation bar:
  * **`LIVE`**: Streams real-time exchange order books and trades via high-throughput WebSocket.
  * **`REPLAY`**: Switches to historical session backtest replay (`.hbr` binary archives). A dedicated replay control bar appears with:
    * **`[ ► PLAY ]` / `[ ❚❚ PAUSE ]`**: Interactive button to toggle playback at 60 fps.
    * **`[ ◄◄ -5s ]` / `[ +5s ►► ]`**: Rapid step buttons to jump backwards or forwards in 5-second intervals.
    * **Timeline Scrubber**: Interactive range slider to scrub through any millisecond of the recorded session.
    * **Speed Selectors**: Quick buttons for `0.5x`, `1x`, `2x`, `5x`, `10x`, and `20x` execution velocity.
    * **Keyboard Controls**: `SPACE` (play/pause), `←` / `→` (seek), `↑` / `↓` (speed).

---

## 🔬 Quantitative Forensics Mathematics

### 1. Implementation Shortfall (IS)
$$\text{IS}_{\text{bps}} = \text{Side} \times \left( \frac{P_{\text{fill}} - P_{\text{arrival}}}{P_{\text{arrival}}} \right) \times 10{,}000$$
* $\text{Side} = +1$ for BUY, $-1$ for SELL.
* Measures the true execution slippage relative to the prevailing mid-market price when the trading decision was originated.

### 2. Adverse Selection Markouts (+100ms, +1s, +5s, +30s)
$$\text{Markout}_\tau = \text{Side} \times \left( \frac{P_{\text{mid}}(t + \tau) - P_{\text{fill}}}{P_{\text{fill}}} \right) \times 10{,}000$$
* **Positive Markout**: Clean execution. You captured the spread, and the market drifted favorably after your trade.
* **Negative Markout**: Toxic fill. You suffered the "winner's curse"—informed high-frequency traders picked off your resting limit order right before an adverse market move.

### 3. Order Flow Imbalance (OFI)
Following the Cont, Kukanov, and Stoikov microstructure framework:
$$e_t = I(\Delta P_{b,t} \ge 0) \cdot q_{b,t} - I(\Delta P_{b,t} \le 0) \cdot q_{b,t-1} - \left[ I(\Delta P_{a,t} \le 0) \cdot q_{a,t} - I(\Delta P_{a,t} \ge 0) \cdot q_{a,t-1} \right]$$
* Open-HFT normalizes OFI into an institutional conviction meter from `-100` (heavy sell pressure) to `+100` (heavy buy pressure).

---

## 🚀 Quickstart (Running in Under 60 Seconds)

### Prerequisites
* **Node.js** (v18 or newer)
* Modern web browser (Chrome, Safari, Edge, or Firefox)

### Step 1: Clone the Repository
```bash
git clone https://github.com/LMGXENON/OPEN-HRT.git
cd OPEN-HRT/dashboard
```

### Step 2: Install Dependencies & Launch
```bash
npm install
npm run dev
```

### Step 3: Open in Browser
Open **`http://127.0.0.1:5180`** in your browser.

> [!TIP]
> **Zero configuration required.** The terminal immediately connects to live market feeds. Use the top search bar to search across any coin (e.g. `PEPE`, `DOGE`, `WIF`, `SOL`, `BTC`), stock (`NVDA`, `AAPL`), commodity (`GOLD`), or ETF (`SPY`).

---

## ⌨️ Complete Keyboard Shortcuts

| Key | Action |
|:---:|:---|
| **`0`** | **View All 9 Tiles** (Terminal Grid) |
| **`1`** | **Focus Tile 1: Order Book** (Full Screen) |
| **`2`** | **Focus Tile 2: Queue Position** (Full Screen) |
| **`3`** | **Focus Tile 3: Latency Telemetry** (Full Screen) |
| **`4`** | **Focus Tile 4: Executions Blotter** (Full Screen) |
| **`5`** | **Focus Tile 5: Market Dynamics Canvas** (Full Screen) |
| **`6`** | **Focus Tile 6: Time & Sales Tape** (Full Screen) |
| **`7`** | **Focus Tile 7: Order Lifecycle Log** (Full Screen) |
| **`8`** | **Focus Tile 8: Engine Kernel Stats** (Full Screen) |
| **`9`** | **Focus Tile 9: Collector Telemetry** (Full Screen) |
| **`F8`** or **`D`** | **Open Security Description Profile (`DES`)** |
| **`M`** | **Toggle Mode** (LIVE vs REPLAY) |
| **`SPACE`** | **Play / Pause** playback (Replay Mode) |
| **`←` / `→`** | **Seek 5 seconds backward / forward** (`Shift` for 30s) |
| **`↑` / `↓`** | **Adjust replay speed** (0.5x, 1x, 2x, 5x, 20x) |
| **`ESC`** | **Close Modal Dialog** |

---

## 🏛️ Regulatory Compliance Standards

Open-HFT computes transaction cost benchmarks aligned with global institutional regulatory mandates:
* **SEC Rule 605/606**: Public disclosure of order routing quality, effective spread, and price improvement.
* **MiFID II RTS 27/28**: Best-Execution verification for European investment managers and trading desks.
* **SEC Rule 10b-18**: Safe Harbor volume caps and timing guardrails for corporate share repurchases.

---

## 🏗️ Repository Architecture

```
open-hft/
├── dashboard/               # Vite + TypeScript Institutional Terminal frontend
│   ├── src/
│   │   ├── assets_directory.ts # Universal 800+ asset catalog (All Crypto & Memecoins, Equities, FX, Commodities)
│   │   ├── nav_bar.ts          # Numbered tile navigation (0-9), universal search, quote strip
│   │   ├── company_profile.ts  # Security Description Profile (DES) modal
│   │   ├── live_feed.ts        # Direct WebSocket stream & DMA matching engine
│   │   ├── tca_engine.ts       # Institutional TCA, markout curves & slippage engine
│   │   ├── panels/             # 9 Synchronized microstructure panels
│   │   └── style.css           # Institutional dark slate & obsidian design system
├── runner/                  # Rust simulation core & .hbr binary frame recorder
│   ├── src/queue.rs         # Probabilistic queue estimator (QueueModel wrapper)
│   ├── src/record.rs        # High-performance zero-copy binary serializer (HFTREC01)
│   └── src/main.rs          # Microsecond execution simulation loop
├── tools/                   # Python ingestion and forensic inspection tools
│   ├── collect.py           # Public WebSocket collector
│   ├── prepare.py           # Stream repair and .npz latency generator
│   └── hbr.py               # Forensic binary inspection & summary CLI
└── docs/                    # Architectural specifications and quantitative math
```

---

## ⭐ Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=LMGXENON/OPEN-HRT&type=Date)](https://star-history.com/#LMGXENON/OPEN-HRT&Date)

</div>

---

## 🤝 Contributing

We welcome contributions from quantitative researchers, software engineers, and financial analysts. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for code conventions, development setup, and roadmap goals.

---

## 📜 Academic Citation

If you use Open-HFT in quantitative finance research or academic publications, please cite it:

```bibtex
@software{open_hft_2026,
  author = {Open-HFT Contributors},
  title = {Open-HFT: Institutional Market Microstructure & High-Frequency Trading Engine Terminal},
  year = {2026},
  url = {https://github.com/LMGXENON/OPEN-HRT}
}
```

---

## 📄 License

Open-HFT is open-source software released under the [MIT License](LICENSE).
