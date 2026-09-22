# Deploying Stratum

Stratum is designed for zero-overhead local execution, self-hosted institutional deployment, and web deployment.

## 1. Quick Local Execution
```bash
# 1. Install dashboard dependencies
cd dashboard && npm install

# 2. Launch Terminal UI
npm run dev
# Running at http://127.0.0.1:5180
```

## 2. Static Web Hosting (Cloudflare Pages / Vercel / AWS S3)
To deploy the Stratum terminal to a public web URL or institutional intranet:
```bash
cd dashboard
npm run build
# Generates production artifacts in dashboard/dist/
```
The resulting `dist/` directory can be deployed directly to Cloudflare Pages, Vercel, Netlify, or AWS S3 + CloudFront. Because live market data connects over browser WebSockets directly to exchange infrastructure, the web client requires **zero backend server or API keys**.

## 3. High-Performance Rust Runner (Optional for Custom Historical Simulations)
```bash
cd runner
cargo build --release
# Executable located at runner/target/release/stratum-runner
```
