<div align="center">

# OPEN-HFT

**Institutional High-Frequency Trading Terminal & Backtest Engine**

[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.80+-orange.svg)](https://www.rust-lang.org/)

Nanosecond L2 order book replay, microsecond queue modeling, and execution forensics built on [hftbacktest](https://github.com/nkaz001/hftbacktest).

<br />

![OPEN-HFT Terminal](docs/shots/open_hft_terminal.png)

</div>

---

### Quickstart

```bash
cd dashboard && npm install && npm run dev
```

Open **`http://localhost:5180`** for immediate interactive backtest replay.

---

### Features

- **24-Level L2 Depth Ladder**: Tick-by-tick order book reconstruction from raw exchange packet streams.
- **Queue Priority Simulation**: Realistic queue modeling (`PowerProbQueueModel3`, n=3) with power-law fill probabilities.
- **Latency & Market Dynamics**: Hardware feed jitter ($p_{50}, p_{95}, p_{99}$), DMA round trips, and smooth trajectory canvas.
- **800+ Assets**: Instant scaling across Crypto (including memecoins), Equities, ETFs, Commodities, and FX.
- **In-Browser Recorder**: Click **`[● REC]`** to record live exchange depth, simulate execution, and replay instantly.
- **Institutional TCA (`F7`)**: One-click Implementation Shortfall, adverse selection markouts (+100ms to +30s), and SEC 605/606 reports.

---

### Tile Navigation (Keys `0`–`9`)

| Key | Tile | Description |
|:---:|---|---|
| **`0`** | **ALL TILES** | Full 9-panel terminal overview |
| **`1`** | **BOOK** | 24-level depth ladder with centered price column and queue bars |
| **`2`** | **QUEUE** | Queue position (`ahead \| ours \| behind`), hits, and resting wait times |
| **`3`** | **LATENCY** | Hardware receipt sparkline, jitter percentiles, and wire transit breakdown |
| **`4`** | **TRADES** | Strategy blotter with fill prices, resting times, counterparty tags, and notional |
| **`5`** | **MARKET** | Mid-price trajectory canvas with reference gridlines and volume profile |
| **`6`** | **TAPE** | Full Time & Sales stream with timestamps, side, size, and DMA venues |
| **`7`** | **ORDER LOG** | Order lifecycle audit stream (`SUBMIT`, `ACK`, `FILL`, `CXL`) |
| **`8`** | **ENGINE** | Kernel throughput, tick rate, fill ratio, and memory footprint |
| **`9`** | **COLLECTOR** | Network ingress packet rates, message throughput, and payload telemetry |

**Controls:** `SPACE` Play/Pause &nbsp;|&nbsp; `←`/`→` Step &nbsp;|&nbsp; `↑`/`↓` Speed (`0.25x`–`MAX`) &nbsp;|&nbsp; `F8` Security Profile &nbsp;|&nbsp; `F7` TCA Report &nbsp;|&nbsp; `ESC` Close Modals

---

### Architecture

```
├── dashboard/       # TypeScript terminal & high-performance canvas visualizers
├── runner/          # Native Rust backtest runner & HFTREC01 binary serializer
├── tools/           # Python feed collectors & data normalization pipeline
└── data/            # Session data archives (.hbr, .npz, .gz)
```

---

### License

MIT © OPEN-HFT
