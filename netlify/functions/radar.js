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
      error: 'API-nyckel saknas: ALPHA_VANTAGE_API_KEY'
    });
  }

  // Fyra aktier + halvledar-ETF
  const symbols = ['NVDA', 'MU', 'AMD', 'AVGO', 'SOXX'];

  const sma = (values, period) =>
    values.length >= period
      ? values.slice(-period).reduce((a, b) => a + b, 0) / period
      : null;

  const calcRsi = (closes, period = 14) => {
    if (closes.length <= period) return null;

    let gains = 0;
    let losses = 0;

    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }

    if (losses === 0) return gains === 0 ? 50 : 100;

    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
  };

  try {
    const results = [];

    for (const symbol of symbols) {
      const url =
        `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY` +
        `&symbol=${encodeURIComponent(symbol)}` +
        `&outputsize=compact` +
        `&apikey=${encodeURIComponent(key)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(`HTTP-fel från Alpha Vantage (${symbol})`);
      }

      const series = data['Time Series (Daily)'];

      if (!series) {
        const message =
          data.Note ||
          data.Information ||
          data['Error Message'] ||
          'Ingen tidsserie mottogs';

        throw new Error(`${symbol}: ${message}`);
      }

      const bars = Object.entries(series)
        .map(([date, v]) => ({
          date,
          close: Number(v['4. close']),
          volume: Number(v['5. volume']) || 0
        }))
        .filter(b => Number.isFinite(b.close))
        .sort((a, b) => a.date.localeCompare(b.date));

      const closes = bars.map(b => b.close);
      const volumes = bars.map(b => b.volume);

      if (closes.length < 50) {
        throw new Error(`${symbol}: För lite kursdata för analys`);
      }

      const latest = closes.at(-1);
      const prev = closes.at(-2);
      const ma20 = sma(closes, 20);
      const ma50 = sma(closes, 50);
      const rsi = calcRsi(closes);

      const latestVolume = volumes.at(-1);
      const avgVolume20 = sma(volumes, 20);
      const volumeRatio = avgVolume20
        ? latestVolume / avgVolume20
        : null;

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
          ? ((latest - prev) / prev) * 100
          : null,
        ma20,
        ma50,
        rsi,
        latestVolume,
        avgVolume20,
        volumeRatio,
        score,
        scoreMax: 5,
        date: bars.at(-1)?.date,
        bars: bars.slice(-30).map(b => ({
          date: b.date,
          close: b.close,
          volume: b.volume
        }))
      });
    }

    return json(200, {
      updatedAt: new Date().toISOString(),
      provider: 'Alpha Vantage',
      live: true,
      results
    });

  } catch (e) {
    return json(502, {
      live: false,
      error: e.message || 'Datafel vid hämtning från Alpha Vantage'
    });
  }
};
