# Open-HFT

### Institutional Market Microstructure & High-Frequency Trading Terminal

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen?style=flat-square)](https://github.com/LMGXENON/OPEN-HRT)
[![TypeScript 5.6](https://img.shields.io/badge/typescript-5.6-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Vite 6](https://img.shields.io/badge/vite-6.4-purple?style=flat-square&logo=vite)](https://vitejs.dev)
[![Rust 1.80+](https://img.shields.io/badge/rust-1.80%2B-orange?style=flat-square&logo=rust)](https://www.rust-lang.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)](LICENSE)
[![Zero Config](https://img.shields.io/badge/data-zero--api--keys-emerald?style=flat-square)](https://github.com/LMGXENON/OPEN-HRT)
[![Compliance](https://img.shields.io/badge/compliance-SEC%20605%2F606%20%7C%20MiFID%20II-purple?style=flat-square)](docs/ARCHITECTURE.md)

An open-source institutional market microstructure and execution forensics terminal built on top of [hftbacktest](https://github.com/nkaz001/hftbacktest) and direct market data feeds. It provides real-time Level 2 depth streaming across 800+ digital assets (including memecoins), US equities, commodities, ETFs, and FX, alongside nanosecond-accurate historical backtest replays.

The terminal visualizes what high-frequency market-making algorithms see and decide frame by frame: the local order book ladder, resting orders with exchange-side queue estimates (`ahead | ours | behind`), feed and wire latencies, executions, order lifecycle logs, raw collector ingress, and kernel throughput statistics.

![Open-HFT Terminal](docs/shots/open_hft_terminal.png)

## Before you trade this

This repository contains an execution simulation engine, backtester, and real-time microstructure terminal. It does not place live capital orders. Key microstructure realities to keep in mind:

1. **Fees and Rebates.** High-frequency quoting at the touch requires maker fee rebates. A standard retail account pays a taker or maker fee rather than receiving a rebate. If a spread is 1 tick (e.g. 0.013 bps on BTC), retail fees exceed the entire spread. Quoting passively at the touch is viable primarily within institutional fee-tier and market-maker rebate programs.
2. **Latency and Colocation.** Live feeds running over residential or commercial WAN connections typically observe 20 ms to 150 ms of network transit time. In production prop environments, quoting engines are colocated inside the exchange data center (e.g. Equinix LD4, NY4, or AWS Tokyo) with sub-millisecond round trips. Over WAN connections, resting limit orders face higher adverse selection and post-only rejection rates as quotes are canceled after the market has already moved.
3. **Queue Modeling and Market Impact.** In backtest and simulation mode, queue positions are modeled using calibrated probabilistic queue models (e.g. power-law queue estimates based on Level 2 depth). In live production, exchange queues follow strict FIFO matching where queue priority depends on microsecond timestamp precedence. Real-world child orders also generate market impact and adverse selection that historical replays estimate passively.
4. **Markouts over P&L.** The terminal focuses on adverse selection markouts (+100ms, +1s, +5s, +30s) and execution quality rather than unhedged theoretical P&L. Markouts isolate whether resting limit orders were filled by uninformed retail flow (capturing spread) or by informed aggressive traders (suffering toxic pick-off).

```
open-hft/
  hftbacktest/      core market simulation engine (Rust crate, Python package, data collector)
  patches/          queue-position getters exposed on exchange-side order structures
  runner/           Rust binary: strategy runner and HFTREC01 nanosecond binary frame recorder
  dashboard/        Vite + TypeScript terminal UI (text-mode look, IBM VGA bitmap fonts)
  tools/            collector, data preparation, session conversion, and forensic inspection
  data/             raw feeds, npz caches, latency models, and binary session recordings
```

## What is real and what is modelled

| On screen | Mode: Real-Time Live | Mode: Historical Replay |
| --- | --- | --- |
| **Order Book (Tile 1)** | Live Level 2 order book constructed from direct exchange WebSocket streams | Reconstructed from nanosecond `.hbr` recording frames |
| **Queue Position (Tile 2)** | Synthetic resting orders placed at the touch with real-time FIFO queue priority | Probabilistic queue model (`PowerProbQueueFunc3`, n=3) evaluated by the Rust engine |
| **Feed & Wire Latency (Tile 3)** | Direct exchange round-trip and local socket receipt telemetry | Recorded exchange timestamp to local receipt offset (`feedMean`, `feedMax`) |
| **Executions (Tile 4)** | Executions matched as market trades cross our resting limit price | Recorded simulated strategy fills with touch-to-fill and queue wait times |
| **Market Chart (Tile 5)** | Rolling price trajectory, VWAP, 24h high/low, and live spread | Mid price, resting bid/ask bounds, fills, and strategy position strip |
| **Time & Sales (Tile 6)** | Live executed trade tape with counterparty tags and notional size | Replayed market trades with local receipt delay (`rx`) |
| **Order Log (Tile 7)** | Real-time order lifecycle events (`NEW`, `ACK`, `FILL`, `CXL`) | Event stream as observed by the local trading strategy |
| **Engine Stats (Tile 8)** | Live kernel throughput, tick rate, and memory footprint | Rust runner process statistics, wall-clock time, and event rate |
| **Collector (Tile 9)** | Ingress network packet rates, socket throughput, and dropped packet audit | Raw recorded stream message rates and sampled payload messages |

## Terminal layout and navigation (0 to 9)

Every tile in the terminal is assigned an individual number. Clicking the tile number on the navbar or pressing `1` through `9` on your keyboard isolates and expands that panel into an edge-to-edge view with zero distortion:

| Key / # | Panel | Description |
|:---:|---|---|
| **`0`** | **ALL TILES** | Displays the full 9-panel terminal grid showing all microstructure telemetry simultaneously. |
| **`1`** | **BOOK** | High-resolution Level 2 order book ladder with centered price column, split queue bars, and live spread. |
| **`2`** | **QUEUE** | Real-time queue breakdown showing our order position (`1st`, `2nd`, `3rd`, `%`), hits, wait time, and split bar (`ahead \| ours \| behind`). |
| **`3`** | **LATENCY** | Feed latency sparkline ($p_{50}, p_{95}, p_{99}$), order round-trip canvas (entry in cyan, response in magenta), and hardware telemetry audit. |
| **`4`** | **EXECUTIONS** | Execution blotter recording child order fills, queue rest duration, counterparty tags, and notional values. |
| **`5`** | **MARKET** | Clean canvas mid price curve with dashed reference gridlines, volume histogram, and 24h market metrics. |
| **`6`** | **TRADES** | Institutional Time & Sales tape with trade timestamps, counterparty tags, price, size, and execution venue. |
| **`7`** | **LOG** | Complete order lifecycle audit log tracking order submissions, exchange acknowledgments, queue updates, and fills. |
| **`8`** | **ENGINE** | Execution kernel metrics: throughput ticks per second, fill ratios, and memory footprint. |
| **`9`** | **COLLECTOR** | Ingress telemetry: packet ingress rates, total payload bytes received, and sequence continuity. |

## Quantitative Forensics Mathematics

### Implementation Shortfall (IS)
$$\text{IS}_{\text{bps}} = \text{Side} \times \left( \frac{P_{\text{fill}} - P_{\text{arrival}}}{P_{\text{arrival}}} \right) \times 10{,}000$$
* $\text{Side} = +1$ for BUY, $-1$ for SELL.
* Measures the true execution slippage relative to the prevailing mid-market price when the trading decision was originated.

### Adverse Selection Markouts (+100ms, +1s, +5s, +30s)
$$\text{Markout}_\tau = \text{Side} \times \left( \frac{P_{\text{mid}}(t + \tau) - P_{\text{fill}}}{P_{\text{fill}}} \right) \times 10{,}000$$
* **Positive Markout**: Clean execution. The order captured spread, and the market drifted favorably after fill.
* **Negative Markout**: Toxic fill. The order suffered the winner's curse where aggressive flow picked off passive quotes before an adverse market move.

### Order Flow Imbalance (OFI)
Following the Cont, Kukanov, and Stoikov microstructure framework:
$$e_t = I(\Delta P_{b,t} \ge 0) \cdot q_{b,t} - I(\Delta P_{b,t} \le 0) \cdot q_{b,t-1} - \left[ I(\Delta P_{a,t} \le 0) \cdot q_{a,t} - I(\Delta P_{a,t} \ge 0) \cdot q_{a,t-1} \right]$$
* Normalizes microsecond book dynamics into an institutional flow conviction indicator from `-100` (heavy sell pressure) to `+100` (heavy buy pressure).

## Quickstart

### Prerequisites
* **Node.js** (v18 or newer)
* Modern web browser (Chrome, Safari, Edge, or Firefox)

### 1. Clone the repository
```bash
git clone --recursive https://github.com/LMGXENON/OPEN-HRT.git
cd OPEN-HRT
```

### 2. Launch the terminal
```bash
cd dashboard
npm install
npm run dev
```

Open **`http://127.0.0.1:5180`** in your browser.

The terminal connects immediately to live market data with zero API keys required. You can search across 800+ assets (all crypto pairs, memecoins, US equities, commodities, ETFs, and FX) using the top command bar or pressing `Enter`.

## Setup (Rust Simulation Runner & Data Tools)

To run custom backtests and record binary session archives:

```bash
# Prerequisites: Rust toolchain (https://rustup.rs) and Python 3.11+
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install hftbacktest numpy polars numba

# Build the Rust simulation runner and collector
(cd hftbacktest && cargo build --release -p collector)
(cd runner && cargo build --release)
```

### Record market data and generate sessions
```bash
# Start background collector for target symbols
python tools/collect.py start --symbols BTCUSDT ETHUSDT
python tools/collect.py status
python tools/collect.py stop

# Convert raw feed into an optimized session archive and replay it
python tools/session.py --raw data/raw/btcusdt_20260915.gz --name btcusdt_session
cd dashboard && npm run dev
```

## Dashboard parameters and shortcuts

### URL Parameters

| Parameter | Meaning |
| --- | --- |
| `symbol=<ticker>` | Active instrument (e.g. `BTCUSDT`, `PEPEUSDT`, `NVDA`, `GOLD`, `SPY`, `JPM`) |
| `mode=live\|replay` | Toggle between live streaming and historical session playback |
| `session=<name>` | Which `.hbr` backtest session archive to load in replay mode |
| `tile=<0-9>` | Isolate an individual tile full-screen (`0` for all tiles) |
| `t=<ns>` | Playback timestamp in session nanoseconds |
| `speed=<x>` | Replay playback velocity multiplier (0.5x, 1x, 2x, 5x, 20x) |
| `ladder=levels\|ticks` | Ladder view: populated levels only, or classical tick ladder |

### Keyboard Shortcuts

| Key | Action |
|:---:|:---|
| **`0`** | View all 9 tiles in full grid |
| **`1` – `9`** | Focus individual tile edge-to-edge |
| **`F8`** or **`D`** | Open Security Description Profile (`DES`) modal |
| **`M`** | Toggle between Real-Time Live mode and Replay mode |
| **`SPACE`** | Play / Pause playback (Replay mode) |
| **`←` / `→`** | Step 5 seconds backward / forward (`Shift` for 30s) |
| **`↑` / `↓`** | Increase / decrease replay playback speed |
| **`ESC`** | Close security profile modal |

## Regulatory Compliance Standards

Open-HFT computes transaction cost benchmarks aligned with institutional execution mandates:
* **SEC Rule 605/606**: Order routing quality, effective spread, and price improvement analysis.
* **MiFID II RTS 27/28**: Best-Execution verification for trading desks and asset managers.
* **SEC Rule 10b-18**: Safe Harbor volume caps and timing guardrails for corporate share repurchases.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=LMGXENON/OPEN-HRT&type=Date)](https://star-history.com/#LMGXENON/OPEN-HRT&Date)

## Fonts and Licenses

* Typography: The Ultimate Oldschool PC Font Pack (`WebPlus_IBM_VGA_9x16`, `WebPlus_IBM_EGA_8x8`) licensed under CC BY-SA 4.0; Departure Mono licensed under SIL Open Font License.
* Open-HFT is open-source software released under the [MIT License](LICENSE).
