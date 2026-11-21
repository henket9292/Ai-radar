export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const allowedPaths = [
      "/",
      "/api/radar",
      "/.netlify/functions/radar"
    ];

    if (!allowedPaths.includes(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (!env.ALPHA_VANTAGE_API_KEY) {
      return json({
        error: "API key saknas",
        message: "Lägg till ALPHA_VANTAGE_API_KEY i Worker Secrets."
      }, 500, corsHeaders);
    }

    const symbols = ["SOXX", "SMH", "NVDA", "AMD", "MU", "AVGO"];

    try {
      const results = {};

      for (const symbol of symbols) {
        const apiUrl =
          "https://www.alphavantage.co/query?" +
          "function=TIME_SERIES_DAILY" +
          "&symbol=" + encodeURIComponent(symbol) +
          "&outputsize=compact" +
          "&apikey=" + encodeURIComponent(env.ALPHA_VANTAGE_API_KEY);

        const response = await fetch(apiUrl);
        const data = await response.json();

        const series = data["Time Series (Daily)"];

        if (!series) {
          results[symbol] = {
            symbol,
            error: data.Note || data.Information || data["Error Message"] || "Ingen data"
          };
          continue;
        }

        const dates = Object.keys(series).sort().reverse();
        const closes = dates.map(d => Number(series[d]["4. close"]));
        const latest = closes[0];
        const previous = closes[1];

        const changePct = previous
          ? ((latest - previous) / previous) * 100
          : 0;

        const ma20 = average(closes.slice(0, 20));
        const ma50 = average(closes.slice(0, 50));

        const rsi = calculateRSI(closes);

        let score = 0;

        if (latest > ma20) score++;
        if (ma20 > ma50) score++;
        if (rsi > 40 && rsi < 70) score++;
        if (changePct > 0) score++;
        if (latest > previous) score++;

        results[symbol] = {
          symbol,
          latest,
          previous,
          changePct,
          ma20,
          ma50,
          rsi,
          score,
          dates: dates.slice(0, 30),
          prices: closes.slice(0, 30),
          lastUpdate: dates[0]
        };
      }

      return json({
        success: true,
        timestamp: new Date().toISOString(),
        results
      }, 200, corsHeaders);

    } catch (error) {
      return json({
        success: false,
        error: error.message
      }, 500, corsHeaders);
    }
  }
};

function average(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateRSI(closes, period = 14) {
  if (closes.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 0; i < period; i++) {
    const change = closes[i] - closes[i + 1];

    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function json(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders
    }
  });
}
