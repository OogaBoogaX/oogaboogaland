// Kraken's complete BTC/USD series sets a silent baseline. Subsequent queries ask only for
// the current 15-day candle, whose high includes any trade since the previous observation.
(() => {
  "use strict";
  const endpoint="https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=21600";
  const period=300000;
  // Retain the market baseline and request cooldown across visits. Each visit still observes once
  // in silence, so a record set while elsewhere never replays on walking through the mirror.
  let record=0, since=0, due=0;
  const create=onRecord=>{
    const params=new URLSearchParams(location.search);
    const enabled=!params.has("nosim") && params.get("chain")!=="0";
    let last=0, request=null, disposed=false;
    const read=async now=>{
      const controller=new AbortController();request=controller;
      const timer=setTimeout(()=>controller.abort(),10000);
      due=now+period;
      try {
        const reply=await fetch(endpoint+(since?"&since="+since:""),{signal:controller.signal,credentials:"omit"});
        if(!reply.ok){
          const retry=Number(reply.headers.get("Retry-After"));
          due=now+Math.max(900000,Number.isFinite(retry)?retry*1000:0);return;
        }
        const data=await reply.json(), rows=data?.result?.XXBTZUSD;
        if(disposed || document.hidden || !Array.isArray(rows) || !rows.length || rows.length>720)return;
        // A truncated first series cannot establish a record for the entire market.
        if(!since && !(Number(rows[0][0])>0 && Number(rows[0][0])<=1380585600))return;
        let high=record;
        for(const row of rows){
          const n=Number(row[2]);if(!Number.isFinite(n) || n<=0)return;
          high=Math.max(high,n);
        }
        const candle=Number(rows[rows.length-1][0]);
        if(!Number.isSafeInteger(candle) || candle<=0 || candle>now/1000 || now/1000-candle>16*86400)return;
        if(record && high>record && last && now-last<=period*2)onRecord();
        record=high;since=candle;last=now;
      } catch { if(!disposed)due=now+900000; }
      finally {clearTimeout(timer);request=null;}
    };
    const update=now=>{
      if(enabled && !disposed && !request && !document.hidden && now>=due)void read(now);
    };
    return {update,dispose(){disposed=true;request?.abort();}};
  };
  window.BL.pokerMarket=Object.freeze({create});
})();
