exports.handler = async () => {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) return { statusCode: 503, headers: { 'Content-Type':'application/json' }, body: JSON.stringify({error:'API-nyckel saknas. Lägg TWELVE_DATA_API_KEY i Netlify Environment Variables.'}) };
  try {
    const symbols = ['MU','SOXX'];
    const results = await Promise.all(symbols.map(async symbol => {
      const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=70&apikey=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || data.status === 'error' || !data.values) throw new Error(data.message || `Kunde inte hämta ${symbol}`);
      const bars = data.values.slice().reverse().map(v => ({date:v.datetime, close:Number(v.close), volume:Number(v.volume||0)})).filter(v=>Number.isFinite(v.close));
      const closes = bars.map(b=>b.close);
      const sma = n => closes.length >= n ? closes.slice(-n).reduce((a,b)=>a+b,0)/n : null;
      const rsi = (period=14) => {
        if(closes.length<period+1) return null;
        let gain=0,loss=0;
        for(let i=closes.length-period;i<closes.length;i++){const d=closes[i]-closes[i-1]; if(d>0)gain+=d; else loss-=d;}
        if(loss===0) return 100;
        return 100-(100/(1+(gain/period)/(loss/period)));
      };
      const latest=closes.at(-1), prev=closes.at(-2), ma20=sma(20), ma50=sma(50), rs=rsi();
      const score=[latest>ma20,latest>ma50,ma20>ma50,rs!==null&&rs>50,latest>prev].filter(Boolean).length;
      return {symbol, latest, prev, changePct:prev?((latest-prev)/prev*100):null, ma20, ma50, rsi:rs, score, scoreMax:5, date:bars.at(-1)?.date, bars:bars.slice(-30).map(b=>({date:b.date,close:b.close}))};
    }));
    return {statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=900'},body:JSON.stringify({updatedAt:new Date().toISOString(),results})};
  } catch(e) { return {statusCode:502,headers:{'Content-Type':'application/json'},body:JSON.stringify({error:e.message||'Datafel'})}; }
};
