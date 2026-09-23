# Contributing to Open-HRT

Thank you for your interest in contributing to **Open-HRT**! We are building an open-source, institutional-grade alternative to \$2,500/month proprietary financial terminals, specializing in nanosecond market microstructure, Transaction Cost Analysis (TCA), and execution quality forensics.

Whether you are a Quantitative Developer, Market Making Researcher, Front-End Engineer, or Capital Markets Specialist, your contributions are warmly welcomed.

---

## 🧭 Principles of the Project

1. **Performance Over Bloat**: Nanosecond precision matters. The simulation core and serialization logic must remain zero-allocation on hot paths.
2. **Deterministic Mathematics**: Every metric (Implementation Shortfall, OFI, Markouts, Queue Depth) must be mathematically rigorous, reproducible, and documented with formulas.
3. **Institutional Polish**: The user experience should feel like an elite terminal on an institutional trading floor. Clean dark themes, high information density, responsive hotkeys.
4. **Zero-Friction Adoption**: Keep the browser experience zero-setup (public WebSockets without API keys, zero-copy replay).

---

## 🛠️ Development Setup

Open-HRT is architected as a modular monorepo:

```
open-hrt/
├── runner/          # Rust simulation core & .hbr binary frame recorder
├── dashboard/       # Vite + TypeScript Institutional Terminal frontend
├── tools/           # Python ingestion, gzip recovery, and data converters
├── patches/         # Precision queue position getters
└── docs/            # Architecture specifications & math models
```

### Prerequisites
- **Node.js**: v18.0+ (v20+ recommended)
- **Rust**: 1.80+ (stable toolchain)
- **Python**: 3.11+ (recommended via [`uv`](https://docs.astral.sh/uv/))

### 1. Dashboard Development (Frontend)
```bash
cd dashboard
npm install
npm run dev
# Opens at http://127.0.0.1:5180
```

To run typecheck and production build:
```bash
npm run build
```

### 2. Rust Simulation Runner
```bash
cd runner
cargo check
cargo build --release
```

### 3. Python Telemetry & Ingestion Tools
```bash
uv venv .venv
source .venv/bin/activate  # Or .venv\Scripts\activate on Windows
uv pip install numpy polars hftbacktest
python tools/collect.py --help
```

---

## 🚀 Priority Roadmap & Contribution Areas

We actively welcome PRs in the following areas:

### 1. Multi-Asset & Equities Connectors
- [ ] **Databento Ingestion Connector**: Direct replay of NASDAQ TotalView-ITCH and CME MDP 3.0 L3 feeds.
- [ ] **Bybit / OKX / Coinbase WebSocket Connectors**: Expand public live crypto feeds beyond Binance Futures.

### 2. Advanced Microstructure Metrics
- [ ] **VPIN (Volume-Synchronized Probability of Toxicity)**: Real-time calculation of toxic vs uninformed order flow buckets.
- [ ] **Hawkes Process Burst Intensity**: Real-time detection of aggressive trade clustering (iceberg and predatory flow detection).
- [ ] **Cross-Impact Matrix**: Correlated asset order flow spillover (e.g. BTC lead-lag vs ETH).

### 3. Execution Algo Simulators
- [ ] **Almgren-Chriss Optimal Execution**: Trajectory plotting balancing market impact against timing risk.
- [ ] **Smart Order Router (SOR) Multi-Venue Crossing**: Lit exchange vs Dark Pool crossing simulation.

---

## 📋 Pull Request Guidelines

1. **Branch Naming**: Use descriptive prefixes:
   - `feat/live-vpin-calculator`
   - `fix/websocket-reconnect-backoff`
   - `docs/latex-ofi-derivation`
   - `perf/hbr-simd-deserializer`
2. **Commit Conventions**: We follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat(tca): add volume-weighted average spread calculation`
   - `fix(runner): correct queue position decrement on partial cancel`
   - `docs(readme): add comparison matrix vs legacy screens`
3. **Verify Before Opening**:
   - Ensure `npm run build` passes with zero TypeScript warnings.
   - Run `cargo fmt --check` and `cargo clippy` in `runner/`.

---

## 💬 Community & Discussions

- **GitHub Discussions**: Use the Discussions tab for algorithmic proposals, quantitative modeling ideas, and UX feedback.
- **Issue Tracker**: Use the structured issue templates for bug reports and feature requests.

Thank you for helping democratize institutional quantitative infrastructure!

