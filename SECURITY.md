# Security Policy

## Supported Versions

We release security patches and critical dependency fixes for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

The Open-HFT team takes security and execution integrity seriously. If you discover a security vulnerability, execution discrepancy, or denial-of-service issue in Open-HFT (including WebSocket handling or serialization logic), please do **NOT** open a public issue.

Instead, please report it via one of the following methods:

1. **GitHub Private Security Advisory**: Navigate to the **Security** tab of this repository and click **"Report a vulnerability"**.
2. **Email**: Send encrypted or plain details to `security@open-hfttca.org`.

### What to Include in Your Report
- A description of the issue and its potential impact.
- Step-by-step reproduction instructions or a minimal proof of concept (e.g., malformed WebSocket payload or `.hbr` byte alignment trigger).
- Any proposed fixes or mitigations.

### Response Timeline
- **Initial Acknowledgement**: Within 48 hours.
- **Triage & Assessment**: Within 5 business days.
- **Fix & Public Advisory**: Coordinated release following fix verification.

