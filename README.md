<div align="center">

# OPEN-HFT
### Quantitative High-Frequency Backtest & TCA Terminal

**Institutional High-Frequency Trading Terminal & Backtest Engine**

[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.80+-orange.svg)](https://www.rust-lang.org/)
[![Performance](https://img.shields.io/badge/Simulation-Sub--Microsecond-emerald.svg)]()

Nanosecond L2 order book replay, microsecond queue modeling, and execution forensics built on [hftbacktest](https://github.com/nkaz001/hftbacktest).
Nanosecond-accurate market microstructure simulation, L2 order book replay, and execution forensics built on [hftbacktest](https://github.com/nkaz001/hftbacktest).

<br />

![OPEN-HFT Terminal](docs/shots/open_hft_terminal.png)

</div>

---

### Quickstart
## Overview

**OPEN-HFT** is an institutional high-frequency trading backtesting platform and execution forensics terminal. It provides quants and algorithmic traders with complete frame-by-frame visibility into exchange matching engines:

- **24-Level Order Book Ladder**: Tick-by-tick order book reconstruction from raw exchange packet streams with split queue depth bars.
- **Probabilistic Queue Modeling**: Realistic exchange queue position simulation (`ahead | ours | behind`) with power-law fill probabilities (`PowerProbQueueModel3`, n=3).
- **Dual-Phase Latency Forensics**: Hardware feed jitter ($p_{50}, p_{95}, p_{99}$), DMA round trips, request transit, and wire acknowledgment breakdowns.
- **Dynamic Multi-Asset Scaling**: Instant backtesting across 800+ Crypto pairs (including memecoins), US Equities, Commodities, ETFs, and FX with automatic tick, lot, and price calibration.
- **In-Browser Market Recorder**: Capture live WebSocket depth, simulate execution, and replay `.hbr` archives directly in the browser with zero CLI setup.
- **Institutional TCA Tear Sheet (`F7`)**: Implementation Shortfall (IS), adverse selection markouts (+100ms to +30s), and SEC 605/606 & MiFID II compliance audits.

---

## Quickstart

Run the web terminal locally:

```bash
cd dashboard && npm install && npm run dev
cd dashboard
npm install
npm run dev
```

Open **`http://localhost:5180`** for immediate interactive backtest replay.
Open **`http://localhost:5180`** in your browser. Preloaded historical market sessions launch immediately.

---

### Features
## How to Record & Backtest Data

- **24-Level L2 Depth Ladder**: Tick-by-tick order book reconstruction from raw exchange packet streams.
- **Queue Priority Simulation**: Realistic queue modeling (`PowerProbQueueModel3`, n=3) with power-law fill probabilities.
- **Latency & Market Dynamics**: Hardware feed jitter ($p_{50}, p_{95}, p_{99}$), DMA round trips, and smooth trajectory canvas.
- **800+ Assets**: Instant scaling across Crypto (including memecoins), Equities, ETFs, Commodities, and FX.
- **In-Browser Recorder**: Click **`[● REC]`** to record live exchange depth, simulate execution, and replay instantly.
- **Institutional TCA (`F7`)**: One-click Implementation Shortfall, adverse selection markouts (+100ms to +30s), and SEC 605/606 reports.
OPEN-HFT uses `.hbr` (`HFTREC01`) binary archives containing nanosecond-timestamped order book states, order lifecycle events, trades, and latency telemetry.

### Method 1: In-Browser Market Recorder (Zero CLI)

Record live exchange market depth and generate backtests directly inside the terminal:

1. Click **`[● REC]`** in the top navigation bar.
2. Select your **Target Symbol** (e.g. `BTC`, `ETH`, `SOL`, `NVDA`, `DOGE`, `GOLD`), duration, and execution strategy model.
3. Click **`START RECORDING`** — the live HUD monitors real-time packets, depth deltas, trades, and buffer usage.
4. When finished, click **`REPLAY IN TERMINAL`** to immediately load your backtest, **`EXPORT .HBR`** to save to disk, or **`VIEW TCA TEAR SHEET`** for post-trade analytics.
5. All recordings are automatically persisted in your local **IndexedDB Session Library** for instant one-click switching.

### Method 2: Batch CLI Pipeline

For automated, scheduled, or high-throughput recording sessions:

```bash
# 1. Capture live L2 WebSocket depth & trade stream
python tools/collect.py start --symbols BTCUSDT ETHUSDT

# 2. Build and run backtest simulation in one command
python tools/session.py --raw data/raw/btcusdt_20260915.gz --name my_backtest --symbol BTCUSDT

# 3. (Optional) Run the native Rust simulation runner directly
./runner/target/release/open-hft-runner \
  --data data/npz/btcusdt_20260915.npz \
  --latency data/latency/btcusdt_20260915.npz \
  --symbol BTCUSDT \
  --queue-model power3 \
  --out dashboard/public/sessions/my_backtest.hbr
```

Output `.hbr` archives are staged directly to `dashboard/public/sessions/` for instant replay.

---

### Tile Navigation (Keys `0`–`9`)
## Terminal Navigation (Keys `0`–`9`)

Press numeric keys `0` through `9` to toggle between the 9-panel overview and individual full-screen panels:

| Key | Tile | Description |
|:---:|---|---|
| **`0`** | **ALL TILES** | Full 9-panel terminal overview |
| **`1`** | **BOOK** | 24-level depth ladder with centered price column and queue bars |
| **`2`** | **QUEUE** | Queue position (`ahead \| ours \| behind`), hits, and resting wait times |
| **`3`** | **LATENCY** | Hardware receipt sparkline, jitter percentiles, and wire transit breakdown |
| **`4`** | **TRADES** | Strategy blotter with fill prices, resting times, counterparty tags, and notional |
| **`3`** | **LATENCY** | Feed latency sparkline, jitter percentiles, and wire transit breakdown |
| **`4`** | **TRADES** | Strategy execution blotter with fill prices, resting times, and notionals |
| **`5`** | **MARKET** | Mid-price trajectory canvas with reference gridlines and volume profile |
| **`6`** | **TAPE** | Full Time & Sales stream with timestamps, side, size, and DMA venues |
| **`7`** | **ORDER LOG** | Order lifecycle audit stream (`SUBMIT`, `ACK`, `FILL`, `CXL`) |
| **`8`** | **ENGINE** | Kernel throughput, tick rate, fill ratio, and memory footprint |
| **`9`** | **COLLECTOR** | Network ingress packet rates, message throughput, and payload telemetry |

**Controls:** `SPACE` Play/Pause &nbsp;|&nbsp; `←`/`→` Step &nbsp;|&nbsp; `↑`/`↓` Speed (`0.25x`–`MAX`) &nbsp;|&nbsp; `F8` Security Profile &nbsp;|&nbsp; `F7` TCA Report &nbsp;|&nbsp; `ESC` Close Modals
### Controls & Shortcuts
| Key | Action |
|---|---|
| **`SPACE`** | Play / Pause replay backtest execution |
| **`←` / `→`** | Step 5 seconds backward / forward (`Shift` for 30s) |
| **`↑` / `↓`** | Adjust playback speed multiplier (`0.25x` to `MAX`) |
| **`F8`** or **`D`** | Open Security Description Profile modal (`[DES PROFILE]`) |
| **`F7`** | Export Transaction Cost Analysis report (`[EXPORT]` TCA) |
| **`ESC`** | Close open modals |

---

### Architecture
## Regulatory TCA Reports (`F7`)

Click **`[EXPORT]`** or press **`F7`** to export an institutional execution quality report:

- **Implementation Shortfall (IS)**:
  $$\text{IS}_{\text{bps}} = \text{Side} \times \left( \frac{P_{\text{fill}} - P_{\text{arrival}}}{P_{\text{arrival}}} \right) \times 10{,}000$$

- **Adverse Selection Markouts (+100ms, +1s, +5s, +30s)**:
  $$\text{Markout}_\tau = \text{Side} \times \left( \frac{P_{\text{mid}}(t + \tau) - P_{\text{fill}}}{P_{\text{fill}}} \right) \times 10{,}000$$

- **Regulatory Compliance Audits**: Effective vs. quoted spreads, price improvement rates, and order routing metrics adhering to **SEC Rule 605/606** and **MiFID II RTS 27/28**.

---

## Directory Architecture

```
├── dashboard/       # TypeScript terminal & high-performance canvas visualizers
├── runner/          # Native Rust backtest runner & HFTREC01 binary serializer
│   ├── src/
│   │   ├── main.ts         # App lifecycle & tile grid manager
│   │   ├── nav_bar.ts      # Top navigation, playback scrubber, & asset search
│   │   ├── session.ts      # Binary .hbr parser and replay clock
│   │   ├── session_factory.ts # Multi-asset dynamic scaling engine
│   │   ├── tca_engine.ts   # Implementation shortfall & markout analytics
│   │   └── panels/         # 9-tile layout renderers
│   └── public/sessions/    # Preloaded .hbr binary recordings
├── runner/          # Native Rust simulation engine & HFTREC01 binary serializer
├── tools/           # Python feed collectors & data normalization pipeline
└── data/            # Session data archives (.hbr, .npz, .gz)
```

---

### License
## License

MIT © OPEN-HFT
OPEN-HFT is open-source software released under the [MIT License](LICENSE).
