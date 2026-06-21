import axios from "axios";
import fs from "fs";

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const STATE_FILE = "./state.json";
const COOLDOWN = 8 * 60 * 60 * 1000; // 8h

// ===== STATE =====
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ===== TELEGRAM =====
async function sendTelegram(msg) {
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: CHAT_ID,
    text: msg,
    parse_mode: "Markdown"
  });
}

// ===== COOLDOWN =====
function canSend(last) {
  if (!last) return true;
  return Date.now() - last > COOLDOWN;
}

// ===== OKX TICKER =====
async function getTickers() {
  const res = await axios.get(
    "https://www.okx.com/api/v5/market/tickers?instType=SPOT"
  );
  return res.data.data || [];
}

// ===== CANDLE CHANGE =====
async function getChange(instId, bar) {
  const res = await axios.get(
    `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=2`
  );

  const d = res.data.data;
  if (!d || d.length < 2) return null;

  const open = Number(d[1][1]);
  const close = Number(d[0][4]);

  return ((close - open) / open) * 100;
}

// ===== MAIN =====
async function run() {
  const state = loadState();

  // =========================
  // STEP 1: TOP 5 24H GAINERS
  // =========================
  const tickers = await getTickers();

  const sorted = tickers
    .map(t => ({
      instId: t.instId,
      change24h: Number(t.sodUtc8) || 0
    }))
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, 5);

  let alerts = [];

  for (const coin of sorted) {
    const symbol = coin.instId;

    try {
      // =========================
      // STEP 2: 15m > 3%
      // =========================
      const chg15m = await getChange(symbol, "15m");
      if (chg15m === null || chg15m <= 3) continue;

      // =========================
      // STEP 3: 4h filter
      // =========================
      const chg4h = await getChange(symbol, "4H");
      if (chg4h === null) continue;

      if (chg4h <= -5 || chg4h >= 5) continue;

      // =========================
      // COOLDOWN 8H
      // =========================
      if (!canSend(state[symbol])) continue;

      alerts.push({
        symbol,
        chg15m,
        chg4h,
        change24h: coin.change24h
      });

      state[symbol] = Date.now();
    } catch (e) {
      continue;
    }
  }

  saveState(state);

  // =========================
  // NO SIGNAL
  // =========================
  if (alerts.length === 0) return;

  // =========================
  // SEND MESSAGE
  // =========================
  let msg = `🚨 *OKX ALERT*\n\n`;

  for (const a of alerts) {
    msg += `🪙 ${a.symbol}\n`;
    msg += `24h: +${a.change24h.toFixed(2)}%\n`;
    msg += `15m: +${a.chg15m.toFixed(2)}%\n`;
    msg += `4h: ${a.chg4h.toFixed(2)}%\n\n`;
  }

  await sendTelegram(msg);
}

run();
