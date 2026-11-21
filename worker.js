export default {
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response(JSON.stringify({
        status: "AI Turnaround Radar API",
        live: true,
        endpoint: "/api/radar"
      }), { headers: cors });
    }

    if (url.pathname !== "/api/radar") {
      return new Response(JSON.stringify({
        error: "Endpoint not found"
      }), { status: 404, headers: cors });
    }

    const apiKey = env.ALPHA_VANTAGE_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({
        error: "Missing API key",
        message: "Add ALPHA_VANTAGE_API_KEY in Worker settings"
      }), { status: 500, headers: cors });
    }

    const symbols = ["NVDA", "AMD", "MU", "AVGO", "SOXX", "SMH"];

    try {
      const results = {};

      await Promise.all(symbols.map(async (symbol) => {
        const apiUrl =
          `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${apiKey}`;

        const response = await fetch(apiUrl);
        const json = await response.json();

        const series = json["Time Series (Daily)"];

        if (!series) {
          results[symbol] = {
            symbol,
            error: json["Note"] || json["Information"] || "No data"
          };
          return;
        }

        const dates = Object.keys(series).sort().reverse();
        const bars = dates.slice(0, 60).map(date => ({
          date,
          open: Number(series[date]["1. open"]),
          high: Number(series[date]["2. high"]),
          low: Number(series[date]["3. low"]),
          close: Number(series[date]["4. close"]),
          volume: Number(series[date]["5. volume"])
        }));

        const closes = bars.map(b => b.close);
        const latest = closes[0];
        const prev = closes[1];

        const changePct = prev
          ? ((latest - prev) / prev) * 100
          : 0;

        function average(values) {
          if (!values.length) return null;
          return values.reduce((a, b) => a + b, 0) / values.length;
        }

        const ma20 = closes.length >= 20
          ? average(closes.slice(0, 20))
          : null;

        const ma50 = closes.length >= 50
          ? average(closes.slice(0, 50))
          : null;

        function calculateRSI(values, period = 14) {
          if (values.length < period + 1) return null;

          let gains = 0;
          let losses = 0;

          for (let i = 0; i < period; i++) {
            const diff = values[i] - values[i + 1];

            if (diff > 0) gains += diff;
            else losses += Math.abs(diff);
          }

          const avgGain = gains / period;
          const avgLoss = losses / period;

          if (avgLoss === 0) return 100;

          const rs = avgGain / avgLoss;
          return 100 - (100 / (1 + rs));
        }

        const rsi = calculateRSI(closes);

        let score = 0;

        if (changePct > 0) score++;
        if (ma20 && latest > ma20) score++;
        if (ma50 && latest > ma50) score++;
        if (ma20 && ma50 && ma20 > ma50) score++;
        if (rsi !== null && rsi > 40 && rsi < 70) score++;

        results[symbol] = {
          symbol,
          latest,
          prev,
          changePct,
          MA20: ma20,
          MA50: ma50,
          RSI: rsi,
          score,
          bars: bars.reverse()
        };
      }));

      return new Response(JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        results
      }), { headers: cors });

    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), { status: 500, headers: cors });
    }
  }
};
