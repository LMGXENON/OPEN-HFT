import { WebSocketServer, WebSocket } from 'ws';
import axios from 'axios';
import protobuf from 'protobufjs';
import http from 'http';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('HFT Data Hub Running');
});

const wss = new WebSocketServer({ server });

let Yaticker: any;
protobuf.load("Yaticker.proto", (err, root) => {
  if (err) throw err;
  Yaticker = root?.lookupType("yahoo.Yaticker");
});

// Store upstream connections per symbol
const activeStreams = new Map<string, {
  type: 'crypto' | 'yahoo',
  ws: WebSocket,
  subscribers: Set<WebSocket>
}>();

wss.on('connection', (client) => {
  console.log('Dashboard connected');
  
  // Track which symbols this client is subscribed to
  const clientSubscriptions = new Set<string>();

  client.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.action === 'subscribe') {
        const symbol = data.symbol.toUpperCase();
        const assetClass = data.assetClass;
        clientSubscriptions.add(symbol);

        // Fetch REST Snapshot first
        if (assetClass === 'CRYPTO' || assetClass === 'MEME') {
          let binanceSym = symbol.toLowerCase();
          if (binanceSym === "pepe" || binanceSym === "pepeusdt") binanceSym = "1000pepeusdt";
          else if (!binanceSym.endsWith("usdt") && !binanceSym.endsWith("usdc")) binanceSym += "usdt";

          try {
            const [depth, trades, ticker] = await Promise.all([
              axios.get(`https://fapi.binance.com/fapi/v1/depth?symbol=${binanceSym.toUpperCase()}&limit=20`),
              axios.get(`https://fapi.binance.com/fapi/v1/trades?symbol=${binanceSym.toUpperCase()}&limit=30`),
              axios.get(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${binanceSym.toUpperCase()}`)
            ]);
            client.send(JSON.stringify({
              type: 'snapshot',
              symbol,
              bids: depth.data.bids || depth.data.b || [],
              asks: depth.data.asks || depth.data.a || [],
              trades: trades.data || [],
              ticker: ticker.data || {}
            }));
          } catch (e: any) {
            console.error("Binance REST Error:", e.message);
          }
          
          subscribeUpstreamCrypto(binanceSym, symbol, client);

        } else {
          // Yahoo Finance
          let yahooSym = symbol;
          if (assetClass === 'FX' && symbol === 'GBPUSD') yahooSym = 'GBPUSD=X';
          else if (assetClass === 'FX' && !symbol.includes('=')) yahooSym = symbol + '=X';

          try {
            const chartRes = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1m&range=1d`, {
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
              history: quote.close.filter((c: any) => c !== null)
            }));
          } catch (e: any) {
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
    } catch (e) {
      console.error(e);
    }
  });

  client.on('close', () => {
    console.log('Dashboard disconnected');
    for (const sym of clientSubscriptions) {
      unsubscribeUpstream(sym, client);
    }
  });
});

function subscribeUpstreamCrypto(binanceSym: string, displaySym: string, client: WebSocket) {
  let streamData = activeStreams.get(displaySym);
  if (!streamData) {
    const streams = `${binanceSym}@depth20@100ms/${binanceSym}@trade/${binanceSym}@ticker`;
    const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
    
    streamData = { type: 'crypto', ws, subscribers: new Set() };
    activeStreams.set(displaySym, streamData);

    ws.on('message', (data) => {
      const msg = data.toString();
      for (const sub of streamData!.subscribers) {
        if (sub.readyState === WebSocket.OPEN) {
          sub.send(JSON.stringify({ type: 'live_crypto', symbol: displaySym, data: JSON.parse(msg) }));
        }
      }
    });

    ws.on('error', (err) => console.error('Binance WS Error:', err));
  }
  streamData.subscribers.add(client);
}

function subscribeUpstreamYahoo(yahooSym: string, displaySym: string, client: WebSocket) {
  let streamData = activeStreams.get(displaySym);
  if (!streamData) {
    const ws = new WebSocket('wss://streamer.finance.yahoo.com/');
    
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

        for (const sub of streamData!.subscribers) {
          if (sub.readyState === WebSocket.OPEN) {
            sub.send(JSON.stringify({ type: 'live_yahoo', symbol: displaySym, data: obj }));
          }
        }
      } catch (e) {
        // Parse error
      }
    });

    ws.on('error', (err) => console.error('Yahoo WS Error:', err));
  }
  streamData.subscribers.add(client);
}

function unsubscribeUpstream(symbol: string, client: WebSocket) {
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
