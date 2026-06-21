import axios from "axios";
import fs from "fs";

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const STATE_FILE = "./state.json";
const COOLDOWN = 8 * 60 * 60 * 1000;

// ===== STATE =====

function loadState() {
try {
return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
} catch {
return {};
}
}

function saveState(state) {
fs.writeFileSync(
STATE_FILE,
JSON.stringify(state, null, 2)
);
}

// ===== TELEGRAM =====

async function sendTelegram(text) {
await axios.post(
`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
{
chat_id: CHAT_ID,
text,
parse_mode: "Markdown"
}
);
}

// ===== COOLDOWN =====

function canSend(lastTime) {
if (!lastTime) return true;

return (
Date.now() - lastTime >
COOLDOWN
);
}

// ===== OKX =====

async function getTickers() {
const res = await axios.get(
"https://www.okx.com/api/v5/market/tickers?instType=SPOT"
);

return res.data.data || [];
}

// ===== CHANGE =====

async function getChange(instId, bar) {
const res = await axios.get(
`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=2`
);

const data = res.data.data;

if (!data || data.length < 2) {
return null;
}

const open = Number(data[1][1]);
const close = Number(data[0][4]);

return ((close - open) / open) * 100;
}

// ===== MAIN =====

async function run() {
const state = loadState();

const tickers = await getTickers();

// BƯỚC 1
// TOP 5 tăng mạnh nhất 24h

const top5 = tickers
.map(t => ({
instId: t.instId,
change24h:
Number(t.change24h || 0) * 100
}))
.sort(
(a, b) =>
b.change24h - a.change24h
)
.slice(0, 5);

const alerts = [];

for (const coin of top5) {
const symbol = coin.instId;

```
try {

  // BƯỚC 2
  // 15m > 3%

  const chg15m =
    await getChange(symbol, "15m");

  if (
    chg15m === null ||
    chg15m <= 3
  ) {
    continue;
  }

  // BƯỚC 3
  // -5% < 4h < +5%

  const chg4h =
    await getChange(symbol, "4H");

  if (chg4h === null) {
    continue;
  }

  if (
    chg4h <= -5 ||
    chg4h >= 5
  ) {
    continue;
  }

  // COOLDOWN 8h

  if (
    !canSend(state[symbol])
  ) {
    continue;
  }

  alerts.push({
    symbol,
    change24h:
      coin.change24h,
    chg15m,
    chg4h
  });

  state[symbol] =
    Date.now();

} catch (err) {
  console.log(
    `Skip ${symbol}`
  );
}
```

}

saveState(state);

if (alerts.length === 0) {
console.log(
"No matching coins"
);
return;
}

let msg =
"🚨 *OKX ALERT* 🚨\n\n";

for (const a of alerts) {
msg +=
`🪙 ${a.symbol}\n` +
`24h: ${a.change24h.toFixed(2)}%\n` +
`15m: ${a.chg15m.toFixed(2)}%\n` +
`4h: ${a.chg4h.toFixed(2)}%\n\n`;
}

await sendTelegram(msg);

console.log(
`Sent ${alerts.length} alerts`
);
}

run();
