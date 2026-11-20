exports.handler = async () => {
  const key = process.env.ALPHA_VANTAGE_API_KEY;

  const json = (statusCode, body) => ({
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=900'
    },
    body: JSON.stringify(body)
  });

  if (!key) {
    return json(503, {
      error: 'API-nyckel saknas. Lägg ALPHA_VANTAGE_API_KEY i Netlify Environment Variables.'
    });
  }

  const symbols = ['MU', 'SOXX'];

  try {
    const results = [];

    for (const symbol of symbols) {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${encodeURIComponent(key)}`;

      const res = await fetch(url);
      const data = await res.json();
      const series = data['Time Series (Daily)'];

      if (!res.ok) {
        throw new Error(`Alpha Vantage HTTP-fel (${symbol})`);
      }

      if (!series) {
        const providerMessage =
          data.Note ||
          data.Information ||
          data['Error Message'] ||
          `Ingen tidsserie för ${symbol}`;

        throw new Error(`${symbol}: ${providerMessage}`);
      }

      const bars = Object.entries(series)
        .map(([date, v]) => ({
          date,
          close: Number(v['4. close']),
          volume: Number(v['5. volume']) || 0
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .filter(b => Number.isFinite(b.close));

      const closes = bars.map(b => b.close);

      const sma = n =>
        closes.length >= n
          ? closes.slice(-n).reduce((a, b) => a + b, 0) / n
          : null;

      const calcRsi = (period = 14) => {
        if (closes.length < period + 1) return null;

        let gains = 0;
        let losses = 0;

        for (let i = closes.length - period; i < closes.length; i++) {
          const diff = closes[i] - closes[i - 1];

          if (diff > 0) {
            gains += diff;
          } else {
            losses -= diff;
          }
        }

        if (losses === 0) return 100;

        const rs = (gains / period) / (losses / period);
        return 100 - (100 / (1 + rs));
      };

      const latest = closes.at(-1);
      const prev = closes.at(-2);
      const ma20 = sma(20);
      const ma50 = sma(50);
      const rsi = calcRsi();

      const score = [
        latest > ma20,
        latest > ma50,
        ma20 > ma50,
        rsi !== null && rsi > 50,
        latest > prev
      ].filter(Boolean).length;

      results.push({
        symbol,
        latest,
        prev,
        changePct: prev
          ? ((latest - prev) / prev * 100)
          : null,
        ma20,
        ma50,
        rsi,
        score,
        scoreMax: 5,
        date: bars.at(-1)?.date,
        bars: bars.slice(-30).map(b => ({
          date: b.date,
          close: b.close
        }))
      });
    }

    return json(200, {
      updatedAt: new Date().toISOString(),
      provider: 'Alpha Vantage',
      results
    });

  } catch (e) {
    return json(502, {
      error: e.message || 'Datafel vid hämtning från Alpha Vantage.'
    });
  }
};
