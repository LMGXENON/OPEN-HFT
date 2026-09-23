// Full-resolution screenshots of the dashboard with Playwright's Chromium.
//   node shot.mjs <url> <width> <height> <out.png> [waitMs]
import { chromium } from "playwright";

const [url, w, h, out, wait] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
page.on("pageerror", (err) => console.log("PAGE ERROR:", err));
await page.goto(url, { waitUntil: "domcontentloaded" });
try {
  await page.waitForSelector(".loading", { state: "detached", timeout: 8000 });
} catch (e) {}
await page.waitForTimeout(Number(wait ?? 2000));
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
