<div align="center">

# OPEN-HFT
### Institutional High-Frequency Backtest & TCA Terminal

[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.80+-orange.svg)](https://www.rust-lang.org/)
[![Performance](https://img.shields.io/badge/Latency-Sub--Microsecond-emerald.svg)]()

Nanosecond-accurate market microstructure simulation, L2 order book replay, and execution forensics built on [hftbacktest](https://github.com/nkaz001/hftbacktest).

<br />

![OPEN-HFT Terminal](docs/shots/open_hft_terminal.png)

</div>

---

## Highlights

- **24-Level L2 Depth Ladder**: Tick-by-tick order book reconstruction directly from packet streams.
- **Microsecond Queue Dynamics**: Real-time queue priority modeling (`ahead | ours | behind`) with power-law fill probabilities (`PowerProbQueueModel3`).
- **Hardware Latency Forensics**: Ingress feed jitter ($p_{50}, p_{95}, p_{99}$), NIC transit, and DMA round-trip execution breakdowns.
- **800+ Asset Dynamic Scaling**: Instant simulation across Crypto, Equities, ETFs, Commodities, and FX with dynamic tick/lot scaling.
- **Built-in Market Recorder**: One-click in-browser live recording (`[● REC]`), simulation, and instant replay.
- **Institutional TCA Tear Sheet (`F7`)**: Implementation Shortfall (IS), adverse selection markouts (+100ms to +30s), and SEC 605/606 & MiFID II reports.

---

## Quickstart

Launch the web terminal locally:

```bash
cd dashboard
npm install
npm run dev
```

Open **`http://localhost:5180`**. Preloaded historical market data launches instantly.

---

## Terminal Navigation (Keys `0`–`9`)

| Key | Tile | Function |
|:---:|:---:|---|
| **`0`** | **ALL TILES** | Full 9-panel terminal overview |
| **`1`** | **BOOK** | 24-level depth ladder with centered price column and queue bars |
| **`2`** | **QUEUE** | Queue position (`ahead \| ours \| behind`), hits, and resting wait times |
| **`3`** | **LATENCY** | Hardware receipt sparkline, jitter percentiles, and wire transit breakdown |
| **`4`** | **TRADES** | Strategy blotter with fill prices, resting times, counterparty tags, and notional |
| **`5`** | **MARKET** | Mid-price trajectory canvas with reference gridlines and volume profile |
| **`6`** | **TAPE** | Full Time & Sales stream with timestamps, side, size, and DMA venues |
| **`7`** | **ORDER LOG** | Order lifecycle audit stream (`SUBMIT`, `ACK`, `FILL`, `CXL`) |
| **`8`** | **ENGINE** | Kernel throughput, tick rate, fill ratio, and memory footprint |
| **`9`** | **COLLECTOR** | Ingress packet rates, message throughput, and payload telemetry |

### Shortcuts
`SPACE` Play / Pause &nbsp;|&nbsp; `←` / `→` Step 5s &nbsp;|&nbsp; `↑` / `↓` Speed (`0.25x`–`MAX`) &nbsp;|&nbsp; `F8` Security Profile &nbsp;|&nbsp; `F7` TCA Report &nbsp;|&nbsp; `ESC` Close Modals

---

## Recording & Backtesting Data

### Option 1: In-Browser Recorder (Zero CLI)
1. Click **`[● REC]`** in the top navigation bar.
2. Select target symbol (e.g. `BTC`, `ETH`, `SOL`, `NVDA`), duration, and strategy model.
3. Click **`START RECORDING`** — live HUD captures depth deltas and matching events into memory.
4. Click **`REPLAY IN TERMINAL`** or **`EXPORT .HBR`** to save your binary session.

### Option 2: CLI Batch Pipeline
```bash
# 1. Capture live L2 WebSocket stream
python tools/collect.py start --symbols BTCUSDT ETHUSDT

# 2. Build and run strategy backtest in 1 command
python tools/session.py --raw data/raw/btcusdt_20260915.gz --name my_backtest --symbol BTCUSDT
```
Output archive is saved to `dashboard/public/sessions/my_backtest.hbr` for instant replay.

---

## Regulatory TCA Analytics (`F7`)

- **Implementation Shortfall (IS)**:
  $$\text{IS}_{\text{bps}} = \text{Side} \times \left( \frac{P_{\text{fill}} - P_{\text{arrival}}}{P_{\text{arrival}}} \right) \times 10{,}000$$

- **Adverse Selection Markouts (+100ms, +1s, +5s, +30s)**:
  $$\text{Markout}_\tau = \text{Side} \times \left( \frac{P_{\text{mid}}(t + \tau) - P_{\text{fill}}}{P_{\text{fill}}} \right) \times 10{,}000$$

---

## Architecture

```
├── dashboard/       # TypeScript web terminal & canvas graphics
├── runner/          # Native Rust backtest runner & HFTREC01 serializer
├── tools/           # Python feed collectors & normalization pipeline
└── data/            # Local data directory (.hbr, .npz, .gz)
```

---

## License

OPEN-HFT is open-source software released under the [MIT License](LICENSE).
