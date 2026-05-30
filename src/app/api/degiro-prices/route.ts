import { NextResponse } from "next/server";

type YahooQuoteResponse = {
  quoteResponse?: {
    result?: Array<{
      symbol?: string;
      regularMarketPrice?: number;
    }>;
  };
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tickers = normalizeTickers(searchParams.get("tickers"));
  const prices: Record<string, number | null> = Object.fromEntries(
    tickers.map((ticker) => [ticker, null]),
  );

  if (tickers.length === 0) {
    return NextResponse.json(prices);
  }

  await fillYahooPrices(tickers, prices);

  const unresolvedTickers = tickers.filter((ticker) => prices[ticker] === null);
  await fillFallbackPrices(unresolvedTickers, prices);

  return NextResponse.json(prices);
}

async function fillYahooPrices(
  tickers: string[],
  prices: Record<string, number | null>,
) {
  try {
    const yahooUrl = new URL("https://query1.finance.yahoo.com/v7/finance/quote");
    yahooUrl.searchParams.set("symbols", tickers.join(","));
    yahooUrl.searchParams.set("lang", "nl");
    yahooUrl.searchParams.set("region", "NL");

    const response = await fetch(yahooUrl, { cache: "no-store" });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as YahooQuoteResponse;

    for (const quote of data.quoteResponse?.result ?? []) {
      const symbol = normalizeTicker(quote.symbol);

      if (!symbol || !(symbol in prices)) continue;

      prices[symbol] =
        typeof quote.regularMarketPrice === "number" &&
        Number.isFinite(quote.regularMarketPrice)
          ? quote.regularMarketPrice
          : null;
    }
  } catch {
    return;
  }
}

function normalizeTickers(value: string | null) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map(normalizeTicker)
        .filter((ticker): ticker is string => Boolean(ticker)),
    ),
  );
}

function normalizeTicker(value: string | undefined | null) {
  return value?.trim().replace(/\s+/g, "").toUpperCase() ?? "";
}

async function fillFallbackPrices(
  tickers: string[],
  prices: Record<string, number | null>,
) {
  await Promise.all(
    tickers.map(async (ticker) => {
      const price = await fetchStooqPrice(ticker);

      if (typeof price === "number") {
        prices[ticker] = price;
      }
    }),
  );
}

async function fetchStooqPrice(ticker: string) {
  for (const symbol of stooqSymbolsForTicker(ticker)) {
    try {
      const url = new URL("https://stooq.com/q/l/");
      url.searchParams.set("s", symbol);
      url.searchParams.set("f", "sd2t2ohlcv");
      url.searchParams.set("h", "");
      url.searchParams.set("e", "csv");

      const response = await fetch(url, { cache: "no-store" });

      if (!response.ok) continue;

      const csv = await response.text();
      const price = parseStooqPrice(csv);

      if (typeof price === "number") {
        return price;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function stooqSymbolsForTicker(ticker: string) {
  const [base, exchange] = ticker.split(".");
  const symbols = new Set<string>();

  if (base && exchange === "AS") {
    symbols.add(`${base}.NL`);
  }

  if (base && exchange === "L") {
    symbols.add(`${base}.UK`);
  }

  if (!exchange && base) {
    symbols.add(`${base}.US`);
  }

  symbols.add(ticker);
  return Array.from(symbols);
}

function parseStooqPrice(csv: string) {
  const lines = csv.trim().split(/\r?\n/);
  const row = lines[1]?.split(",");
  const close = row?.[6];
  const price = close ? Number(close) : Number.NaN;

  return Number.isFinite(price) ? price : null;
}
