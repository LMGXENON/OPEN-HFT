"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const axios_1 = __importDefault(require("axios"));
const protobufjs_1 = __importDefault(require("protobufjs"));
const http_1 = __importDefault(require("http"));
const server = http_1.default.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('HFT Data Hub Running');
});
const wss = new ws_1.WebSocketServer({ server });
let Yaticker;
protobufjs_1.default.load("Yaticker.proto", (err, root) => {
    if (err)
        throw err;
    Yaticker = root === null || root === void 0 ? void 0 : root.lookupType("yahoo.Yaticker");
});
// Store upstream connections per symbol
const activeStreams = new Map();
wss.on('connection', (client) => {
    console.log('Dashboard connected');
    // Track which symbols this client is subscribed to
    const clientSubscriptions = new Set();
    client.on('message', (message) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const data = JSON.parse(message.toString());
            if (data.action === 'subscribe') {
                const symbol = data.symbol.toUpperCase();
                const assetClass = data.assetClass;
                clientSubscriptions.add(symbol);
                // Fetch REST Snapshot first
                if (assetClass === 'CRYPTO' || assetClass === 'MEME') {
                    let binanceSym = symbol.toLowerCase();
                    if (binanceSym === "pepe" || binanceSym === "pepeusdt")
                        binanceSym = "1000pepeusdt";
                    else if (!binanceSym.endsWith("usdt") && !binanceSym.endsWith("usdc"))
                        binanceSym += "usdt";
                    try {
                        const [depth, trades, ticker] = yield Promise.all([
                            axios_1.default.get(`https://fapi.binance.com/fapi/v1/depth?symbol=${binanceSym.toUpperCase()}&limit=20`),
                            axios_1.default.get(`https://fapi.binance.com/fapi/v1/trades?symbol=${binanceSym.toUpperCase()}&limit=30`),
                            axios_1.default.get(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${binanceSym.toUpperCase()}`)
                        ]);
                        client.send(JSON.stringify({
                            type: 'snapshot',
                            symbol,
                            bids: depth.data.bids || depth.data.b || [],
                            asks: depth.data.asks || depth.data.a || [],
                            trades: trades.data || [],
                            ticker: ticker.data || {}
                        }));
                    }
                    catch (e) {
                        console.error("Binance REST Error:", e.message);
                    }
                    subscribeUpstreamCrypto(binanceSym, symbol, client);
                }
                else {
                    // Yahoo Finance
                    let yahooSym = symbol;
                    if (assetClass === 'FX' && symbol === 'GBPUSD')
                        yahooSym = 'GBPUSD=X';
                    else if (assetClass === 'FX' && !symbol.includes('='))
                        yahooSym = symbol + '=X';
                    try {
                        const chartRes = yield axios_1.default.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1m&range=1d`, {
                            headers: { 'User-Agent': 'Mozilla/5.0' }
                        });
                        const result = chartRes.data.chart.result[0];
                        const meta = result.meta;
                        const quote = result.indicators.quote[0];
                        client.send(JSON.stringify({
                            type: 'snapshot_yahoo',
                            symbol,
                            price: meta.regularMarketPrice,
                            previousClose: meta.previousClose,
                            history: quote.close.filter((c) => c !== null)
                        }));
                    }
                    catch (e) {
                        console.error("Yahoo REST Error:", e.message);
                        client.send(JSON.stringify({ type: 'error', symbol, message: `Yahoo API Error: ${e.message}` }));
                    }
                    subscribeUpstreamYahoo(yahooSym, symbol, client);
                }
            }
            else if (data.action === 'unsubscribe') {
                const symbol = data.symbol.toUpperCase();
                clientSubscriptions.delete(symbol);
                unsubscribeUpstream(symbol, client);
            }
        }
        catch (e) {
            console.error(e);
        }
    }));
    client.on('close', () => {
        console.log('Dashboard disconnected');
        for (const sym of clientSubscriptions) {
            unsubscribeUpstream(sym, client);
        }
    });
});
function subscribeUpstreamCrypto(binanceSym, displaySym, client) {
    let streamData = activeStreams.get(displaySym);
    if (!streamData) {
        const streams = `${binanceSym}@depth20@100ms/${binanceSym}@trade/${binanceSym}@ticker`;
        const ws = new ws_1.WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
        streamData = { type: 'crypto', ws, subscribers: new Set() };
        activeStreams.set(displaySym, streamData);
        ws.on('message', (data) => {
            const msg = data.toString();
            for (const sub of streamData.subscribers) {
                if (sub.readyState === ws_1.WebSocket.OPEN) {
                    sub.send(JSON.stringify({ type: 'live_crypto', symbol: displaySym, data: JSON.parse(msg) }));
                }
            }
        });
        ws.on('error', (err) => console.error('Binance WS Error:', err));
    }
    streamData.subscribers.add(client);
}
function subscribeUpstreamYahoo(yahooSym, displaySym, client) {
    let streamData = activeStreams.get(displaySym);
    if (!streamData) {
        const ws = new ws_1.WebSocket('wss://streamer.finance.yahoo.com/');
        streamData = { type: 'yahoo', ws, subscribers: new Set() };
        activeStreams.set(displaySym, streamData);
        ws.on('open', () => {
            ws.send(JSON.stringify({ subscribe: [yahooSym] }));
        });
        ws.on('message', (data) => {
            try {
                const msgStr = data.toString();
                const buffer = Buffer.from(msgStr, 'base64');
                const decoded = Yaticker.decode(buffer);
                const obj = Yaticker.toObject(decoded, { enums: String, long: Number });
                for (const sub of streamData.subscribers) {
                    if (sub.readyState === ws_1.WebSocket.OPEN) {
                        sub.send(JSON.stringify({ type: 'live_yahoo', symbol: displaySym, data: obj }));
                    }
                }
            }
            catch (e) {
                // Parse error
            }
        });
        ws.on('error', (err) => console.error('Yahoo WS Error:', err));
    }
    streamData.subscribers.add(client);
}
function unsubscribeUpstream(symbol, client) {
    const streamData = activeStreams.get(symbol);
    if (streamData) {
        streamData.subscribers.delete(client);
        if (streamData.subscribers.size === 0) {
            streamData.ws.close();
            activeStreams.delete(symbol);
        }
    }
}
server.listen(8080, () => {
    console.log('HFT Data Hub listening on port 8080');
});
