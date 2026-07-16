import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, "data");
const stocksPath = path.join(dataDir, "stocks.json");
const outputPath = path.join(dataDir, "prices.json");
const rangeDays = Number(process.env.RANGE_DAYS || 45);

function asDate(value) {
  const date = new Date(value * 1000);
  return date.toISOString().slice(0, 10);
}

async function fetchSymbol(symbol) {
  const clean = symbol.trim().toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(clean)}?range=2mo&interval=1d`;
  const response = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`${clean}: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const closes = quote.close || [];
  const rows = timestamps.map((time, index) => ({
    date: asDate(time),
    close: Number(closes[index])
  })).filter((row) => row.date && Number.isFinite(row.close) && row.close > 0);

  return rows.slice(-rangeDays);
}

async function main() {
  const symbols = JSON.parse(await fs.readFile(stocksPath, "utf8"))
    .map((symbol) => String(symbol).trim().toUpperCase())
    .filter(Boolean);

  const output = {
    updatedAt: new Date().toISOString(),
    source: "Yahoo Finance chart API via GitHub Actions",
    rangeDays,
    symbols: {}
  };

  for (const symbol of symbols) {
    try {
      output.symbols[symbol] = {
        ok: true,
        rows: await fetchSymbol(symbol)
      };
      console.log(`${symbol}: ${output.symbols[symbol].rows.length} rows`);
    } catch (error) {
      output.symbols[symbol] = {
        ok: false,
        error: error.message,
        rows: []
      };
      console.warn(`${symbol}: ${error.message}`);
    }
  }

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
