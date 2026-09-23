# OPEN-HFT // Quantitative Backtest Terminal

> **Nanosecond-Accurate Market Microstructure Backtesting, Replay & Execution Forensics**

OPEN-HFT is an institutional market microstructure backtesting engine and execution forensics terminal built on top of [hftbacktest](https://github.com/nkaz001/hftbacktest). Designed for quantitative researchers, high-frequency market makers, and algorithmic execution desks, it records, replays, and stress-tests trading strategies with full visibility into the exchange order book, order queue dynamics, wire latency, and fill quality.

---

## Key Features

- **Nanosecond Level 2 Replay**: Reconstructs the full 24-level order book ladder tick by tick from raw exchange packet captures.
- **Microstructure Queue Modeling**: Simulates exchange-side queue priority (`ahead | ours | behind`) using calibrated power-law probability models (`PowerProbQueueModel3`, n=3).
- **Latency & Wire Forensics**: Tracks hardware receipt jitter ($p_{50}, p_{95}, p_{99}$), DMA round trips, and dual-phase wire transit times (entry request in cyan, wire confirmation in magenta).
- **Synchronized Blotters**: Tabular Execution Blotter (Tile 4) and Time & Sales Tape (Tile 6) with counterparty tagging, resting wait times, notional sizing, and venue routes.
- **Dynamic Multi-Asset Engine**: Test strategies across 800+ assets (crypto, US equities, commodities, FX) with automatic scaling of price physics, tick sizes, and lot sizes.
- **Zero-Setup Web Terminal**: High-performance canvas-accelerated text-mode UI running locally in any browser with instant keyboard navigation (0–9).
- **Regulatory TCA Export**: One-click generation (`F7`) of Transaction Cost Analysis reports covering Implementation Shortfall (IS), adverse selection markouts (+100ms to +30s), and SEC 605/606 & MiFID II compliance benchmarks.

---

## Quick Start (Dashboard)

Run the visual backtest terminal in under a minute:

```bash
# 1. Navigate to the dashboard
cd dashboard

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

Open **`http://localhost:5180`** in your browser. The terminal launches immediately in backtest mode with the bundled high-resolution session.

---

## Complete Guide: Recording & Generating Backtest Data

The OPEN-HFT pipeline converts real-world exchange data into high-speed binary `.hbr` (`HFTREC01`) session recordings that can be replayed and audited in the terminal.

```
┌────────────────────────┐      ┌─────────────────────────┐      ┌────────────────────────┐      ┌─────────────────────────┐
│ 1. Capture Raw Market  │ ───> │ 2. Normalize Data       │ ───> │ 3. Execute Strategy    │ ───> │ 4. Replay in Terminal   │
│    (tools/collect.py)  │      │    (tools/prepare.py)   │      │    (runner / session)  │      │    (dashboard / UI)     │
└────────────────────────┘      └─────────────────────────┘      └────────────────────────┘      └─────────────────────────┘
  WebSockets / L2 Feeds            .npz Depth & Latency             .hbr Binary Archive              Interactive Visualizer
```

### Stage 1: Capture Raw Market Feeds

Record live WebSocket depth diffs and market trades directly from exchange endpoints:

```bash
# Start background recording for target instruments
python tools/collect.py start --symbols BTCUSDT ETHUSDT

# Monitor ingress packet rates and file sizes
python tools/collect.py status

# Stop recording when done
python tools/collect.py stop
```

Raw data is saved to `data/raw/<symbol>_<timestamp>.gz`.

Alternatively, build and run the high-throughput native Rust collector:
```bash
cargo run --release -p collector -- --symbols BTCUSDT,ETHUSDT --output data/raw/
```

---

### Stage 2: Normalize Feeds & Calibrate Latency Models

Convert raw `.gz` streams into normalized numerical arrays (`.npz`) and empirical latency profiles:

```bash
python tools/prepare.py \
  --raw data/raw/btcusdt_20260915.gz \
  --tick-size 0.1 \
  --lot-size 0.001 \
  --mul-entry 1.0 \
  --mul-resp 1.0
```

This step generates:
1. `data/npz/<stem>.npz`: Structured Level 2 book updates and public trade prints.
2. `data/latency/<stem>.npz`: Feed-latency-derived order entry and acknowledgment timing models.
3. `data/npz/<stem>.collector.json`: Network packet counts, payload bytes, and ingress telemetry.

---

### Stage 3: Run the Strategy & Record the Backtest (`.hbr`)

The simulation runner (`runner/src/main.rs`) steps through the normalized market data, evaluates strategy order placement, updates exchange queue estimates, and writes every decision frame into a `.hbr` binary archive:

#### Automated 1-Command Workflow (Recommended)
```bash
python tools/session.py \
  --raw data/raw/btcusdt_20260915.gz \
  --name my_backtest \
  --symbol BTCUSDT \
  --tick-size 0.1 \
  --lot-size 0.001
```

#### Manual Rust Execution
Compile and execute the simulation runner directly:

```bash
# Build the native simulation runner
cd runner && cargo build --release && cd ..

# Run backtest simulation with power-law queue model
./runner/target/release/stratum-runner \
  --data data/npz/btcusdt_20260915.npz \
  --latency data/latency/btcusdt_20260915.npz \
  --symbol BTCUSDT \
  --tick_size 0.1 \
  --lot_size 0.001 \
  --queue-model power3 \
  --frame_ms 100 \
  --levels 24 \
  --out dashboard/public/sessions/my_backtest.hbr
```

#### Key Simulation Options
| Flag | Description | Default |
|---|---|---|
| `--queue-model` | Queue priority model: `power3`, `power2`, `log2`, or `risk_adverse` | `power3` |
| `--frame_ms` | Decision and recording frame interval in milliseconds | `100` |
| `--levels` | Number of book levels recorded per side per frame | `24` |
| `--const_latency_us` | Override with fixed round-trip microseconds (e.g. `500,500`) | Measured |
| `--grid-num` | Number of quoting levels per side for grid strategies | `5` |
| `--order-qty` | Quoting order lot size per level | `0.002` |

---

### Understanding the `.hbr` Binary Format (`HFTREC01`)

The generated `.hbr` file is a zero-copy, compact binary recording containing:
- **Magic Header**: `HFTREC01` (8 bytes).
- **Metadata Chunk**: JSON string declaring instrument symbol, tick size, lot size, exchange name, queue model parameters, and total event counts.
- **Time Index**: Lookup index mapping timestamps to frame byte offsets for instantaneous seeking.
- **Binary Frames**:
  - Exchange timestamp and local arrival timestamp.
  - 24-level Bid/Ask book ladder with resting quantities.
  - Active child order state: price, leaves quantity, and queue position (`front` / `ahead` / `behind`).
  - Strategy executions, fills, and order cancellation timestamps.
  - Hardware feed latency samples ($p_{50}, p_{95}, p_{99}$, message rates).

---

## Loading & Replaying Backtest Data in the Dashboard

Once your `.hbr` file is created, you can load and inspect it using any of three methods:

### Method 1: Mount as Default Session
Copy the file to `dashboard/public/sessions/<name>.hbr` and pass the session name in the URL:
```
http://localhost:5180/?session=my_backtest
```

### Method 2: Drag and Drop HUD
Drag any `.hbr` file from your desktop and drop it directly onto the browser window. The terminal HUD highlights with:
```
RELEASE TO INGEST HBR BINARY ARCHIVE
```
The recording parses in-memory and starts replaying immediately.

### Method 3: File Picker Button
Click **`[⊕ LOAD .HBR]`** in the top navigation bar to select and open any `.hbr` file from your local disk.

---

## Dynamic Multi-Asset Simulation (800+ Assets)

The terminal includes a dynamic microstructure physics engine (`session_factory.ts`). When you switch symbols using the search bar (`SEC>`), quick pills, or the asset catalog (`F8` / `[DES PROFILE]`):

- The engine dynamically maps the base price trajectory to the target asset's current market price.
- Tick sizes, lot sizes, spread physics, and depth queues scale automatically (e.g., ETH at $2,650 with 0.01 tick size; SOL at $145; NVDA at $120; GOLD at $2,600).
- Order book ladders, trade blotters, and execution logs re-anchor seamlessly to the target asset.

---

## Terminal Navigation & Keyboard Shortcuts

Click any tile button on the header bar or use keyboard hotkeys for instant full-screen inspection:

| Key | Target | Function |
|:---:|:---:|---|
| **`0`** | **ALL TILES** | Restores the complete 9-panel terminal overview grid. |
| **`1`** | **BOOK** | Level 2 order book ladder with centered price column and split queue bars. |
| **`2`** | **QUEUE** | Real-time queue breakdown (`ahead \| ours \| behind`), hits, and resting wait times. |
| **`3`** | **LATENCY** | Feed receipt latency sparkline, jitter percentiles, and dual-phase wire transit bars. |
| **`4`** | **EXECUTIONS** | Tabular execution blotter with fill prices, resting times, and notional sizes. |
| **`5`** | **MARKET** | Rolling mid-price canvas with dashed reference lines and volume bars. |
| **`6`** | **TRADES** | Tabular Time & Sales tape with trade timestamps, side, price, size, and counterparty. |
| **`7`** | **ORDER LOG** | Lifecycle audit stream (`SUBMIT`, `ACK`, `FILL`, `CXL`). |
| **`8`** | **ENGINE** | Kernel execution throughput, tick rate, fill ratio, and memory footprint. |
| **`9`** | **COLLECTOR** | Network ingress telemetry, packet counts, and payload integrity. |

### Playback Controls
| Shortcut | Action |
|---|---|
| **`SPACE`** | Play / Pause replay backtest execution |
| **`←` / `→`** | Step 5 seconds backward / forward (`Shift` for 30s) |
| **`↑` / `↓`** | Increase / decrease playback speed (`0.25x` to `MAX`) |
| **`F8`** or **`D`** | Open Security Description Profile (`[DES PROFILE]`) |
| **`F7`** | Export Transaction Cost Analysis (`[EXPORT]` TCA report) |
| **`ESC`** | Close open modal overlays |

---

## Regulatory TCA & Execution Quality Analysis (`F7`)

Click **`[EXPORT]`** or press **`F7`** to export a Transaction Cost Analysis report formatted for institutional and regulatory compliance:

- **Implementation Shortfall (IS)**:
  $$\text{IS}_{\text{bps}} = \text{Side} \times \left( \frac{P_{\text{fill}} - P_{\text{arrival}}}{P_{\text{arrival}}} \right) \times 10{,}000$$
  Measures true execution slippage against the mid-market price at decision arrival.

- **Adverse Selection Markouts (+100ms, +1s, +5s, +30s)**:
  $$\text{Markout}_\tau = \text{Side} \times \left( \frac{P_{\text{mid}}(t + \tau) - P_{\text{fill}}}{P_{\text{fill}}} \right) \times 10{,}000$$
  Identifies whether passive fills captured spread from retail flow or suffered toxic adverse selection from aggressive informed flow.

- **Regulatory Compliance Standards**:
  - **SEC Rule 605/606**: Effective vs. quoted spread, price improvement, and venue routing quality.
  - **MiFID II RTS 27/28**: Best-Execution validation for trading desks and asset managers.

---

## Repository Structure

```
├── dashboard/              # Vite + TypeScript web terminal UI
│   ├── src/
│   │   ├── main.ts         # Application entry point & tile manager
│   │   ├── nav_bar.ts      # Top navigation, playback scrubber, and asset search
│   │   ├── session.ts      # Binary .hbr parser and playback clock
│   │   ├── session_factory.ts # Multi-asset dynamic scaling engine
│   │   ├── tca_engine.ts   # Implementation shortfall & markout calculation
│   │   └── panels/         # Individual panel renderers (Tiles 1 to 9)
│   └── public/sessions/    # Preloaded .hbr binary recordings
├── runner/                 # Native Rust backtest executor & binary frame recorder
│   └── src/
│       ├── main.rs         # CLI runner and strategy execution loop
│       ├── queue.rs        # Queue position model instrumentation
│       └── record.rs       # HFTREC01 binary serializer
├── tools/                  # Python data preparation and collector utilities
│   ├── collect.py          # Real-time WebSocket L2 depth & trade collector
│   ├── prepare.py          # Raw feed to normalized NPZ & latency generator
│   └── session.py          # 1-command pipeline: raw feed -> .hbr session
└── data/                   # Data directory (raw feeds, npz caches, session files)
```

---

## License

Open-HFT is open-source software licensed under the [MIT License](LICENSE).
Bitmap fonts from The Ultimate Oldschool PC Font Pack (`WebPlus_IBM_VGA_9x16`, `WebPlus_IBM_EGA_8x8`) licensed under CC BY-SA 4.0; Departure Mono licensed under SIL Open Font License.
