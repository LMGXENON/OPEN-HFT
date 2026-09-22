# Stratum Technical Architecture & System Design

This document details the underlying engineering, memory layout, binary container specification, and algorithmic formulations powering **Stratum**.

---

## 1. High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATA INGESTION LAYER                             │
│  Live: Public WebSockets (100ms L2)  │  Historical: Raw Gzip PCAP / Tick DB │
└───────────────────────┬─────────────────────────────────────┬───────────────┘
                        │                                     │
                        ▼                                     ▼
        ┌───────────────────────────────┐     ┌───────────────────────────────┐
        │     LIVE BROWSER ENGINE       │     │      RUST SIMULATION CORE     │
        │  • In-Memory L2 Depth Book    │     │  • Microsecond Order Book     │
        │  • Cont-Kukanov-Stoikov OFI   │     │  • Probabilistic Queue Model  │
        │  • Live Queue Simulation      │     │  • WAN Latency Interpolator   │
        └───────────────┬───────────────┘     └───────────────┬───────────────┘
                        │                                     │
                        │                                     ▼
                        │                      ┌──────────────────────────────┐
                        │                      │     ZERO-COPY .HBR FILE      │
                        │                      │  Fixed 8-byte aligned binary │
                        │                      └──────────────┬───────────────┘
                        │                                     │
                        ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STRATUM VISUALIZATION CORE                          │
│                                                                             │
│  [Universal Search Prompt]    [Ticker Quick Chips]   [Security Quote Strip] │
│                                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────────┐  │
│  │     TCA SCORECARD    │  │   MARKOUT FORENSICS  │  │   ORDER BLOTTER   │  │
│  │ Implementation       │  │ +100ms, +1s, +5s,    │  │ Child Order Audit │  │
│  │ Shortfall & Best-Ex  │  │ Adverse Selection    │  │ Quality Ratings   │  │
│  └──────────────────────┘  └──────────────────────┘  └───────────────────┘  │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────────┐  │
│  │     L2 DEPTH BOOK    │  │   LIVE TRADES TAPE   │  │   QUEUE TRACKER   │  │
│  │ Cumulative Pressure  │  │ Aggressor Flags      │  │ Ahead vs Behind   │  │
│  └──────────────────────┘  └──────────────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Zero-Copy `.hbr` Binary Container Specification

Historical sessions are packed into a high-performance, memory-mappable binary layout (`HFTREC01`) designed to allow instantaneous scrubbing and zero-garbage collection overhead in the browser:

```text
+------------------+------------------+------------------------------------+
| Magic: "HFTREC01"| Header Len (u32) | JSON Header (Arrays & Metadata)   |
| (8 bytes)        | (4 bytes LE)     | (Variable length UTF-8 JSON)       |
+------------------+------------------+------------------------------------+
| Padding (0..7 B) | Data Segment (Raw Little-Endian Typed Arrays)         |
| 8-byte alignment | Float64 / Int64 / UInt32 Arrays (Zero-Copy)           |
+------------------+-------------------------------------------------------+
```

### Typed Array Alignment
Every typed array inside the `.hbr` file starts on a strict 8-byte boundary relative to the data segment offset:
- `frame_t` (`f64`): Nanosecond epoch timestamps for each simulation frame.
- `bid_tick` / `ask_tick` (`i32`): Multi-level price ticks (normalized to asset `tick_size`).
- `bid_qty` / `ask_qty` (`f64`): Level quantities.
- `e_kind`, `e_t`, `e_id`, `e_side`: Order lifecycle events (`SUBMIT`, `ACK`, `FILL`, `CANCEL`).
- `e_front`, `e_level`: Exchange-side queue depth ahead and total level volume.

---

## 3. Microstructure & Mathematical Formulations

### 3.1 Implementation Shortfall (IS)
Implementation Shortfall measures the total execution drag compared to the prevailing mid-market price at order decision time ($P_{\text{arrival}}$):

$$\text{IS}_{\text{bps}} = \text{Side} \times \left( \frac{P_{\text{fill}} - P_{\text{arrival}}}{P_{\text{arrival}}} \right) \times 10{,}000$$

Where $\text{Side} = +1$ for BUY orders and $-1$ for SELL orders.
* Passive maker fills that capture half the spread frequently achieve negative IS (price improvement relative to arrival price).
* Aggressive taker fills incur positive IS (cost paid to cross the spread plus adverse market impact).

### 3.2 Order Flow Imbalance (OFI)
Following the Cont, Kukanov, and Stoikov (2014) framework, OFI quantifies net cross-sectional volume demand at the touch:

$$e_t = I(\Delta P_{b,t} \ge 0) \cdot q_{b,t} - I(\Delta P_{b,t} \le 0) \cdot q_{b,t-1} - \left[ I(\Delta P_{a,t} \le 0) \cdot q_{a,t} - I(\Delta P_{a,t} \ge 0) \cdot q_{a,t-1} \right]$$

Stratum exponentially smooths $e_t$ into an indexed gauge bounded in $[-100, +100]$, providing immediate directional flow conviction.

### 3.3 Post-Trade Markout & Adverse Selection
To assess whether executions were toxic (i.e. picked off by informed latency arbitrageurs), Stratum evaluates post-fill price drift across multiple lookahead horizons ($\tau \in \{100\text{ms}, 1\text{s}, 5\text{s}, 30\text{s}\}$):

$$\text{Markout}_\tau = \text{Side} \times \left( \frac{P_{\text{mid}}(t + \tau) - P_{\text{fill}}}{P_{\text{fill}}} \right) \times 10{,}000$$

* **Positive Markout**: Asset price moves in your favor after execution (favorable liquidity provision).
* **Negative Markout**: Asset price drops immediately after a buy or spikes after a sell (toxic adverse selection / winner's curse).

---

## 4. Probabilistic Queue Estimator

Because public exchange feeds do not reveal individual order identifiers in Level 2 depth, Stratum wraps `ProbQueueModel` using a power-law probability distribution:

$$P(\text{fill}) = \left( \frac{Q_{\text{traded}}}{Q_{\text{ahead}} + Q_{\text{order}}} \right)^\alpha$$

Where $\alpha \approx 3$ reflects the empirically observed clustering of order cancellations near the queue front. As market trades hit the resting tick level, $Q_{\text{ahead}}$ decrements deterministically while tracking cancellation rates at the price level.

