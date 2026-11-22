/* Radar M5 — análise técnica local. Não é previsão garantida ou recomendação financeira. */
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.M5Engine = api;
})(typeof window !== 'undefined' ? window : globalThis, function(){
  const PERIOD_MS = 300000;
  const round = (n, digits=1) => Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
  const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : NaN;
  function emaSeries(values, period) {
    if(values.length < period) return [];
    const out = new Array(values.length).fill(null);
    let current = avg(values.slice(0,period));
    out[period-1]=current;
    const alpha = 2/(period+1);
    for(let i=period;i<values.length;i++) {
      current = values[i]*alpha + current*(1-alpha);
      out[i]=current;
    }
    return out;
  }
  function rsi(values, period=14) {
    if(values.length < period+2) return NaN;
    let gains=0,losses=0;
    for(let i=1;i<=period;i++) {const d=values[i]-values[i-1];gains+=Math.max(d,0);losses+=Math.max(-d,0)}
    gains/=period; losses/=period;
    for(let i=period+1;i<values.length;i++) {
      const d=values[i]-values[i-1];
      gains=(gains*(period-1)+Math.max(d,0))/period;
      losses=(losses*(period-1)+Math.max(-d,0))/period;
    }
    if(losses===0) return gains===0 ? 50 : 100;
    return 100 - 100/(1+gains/losses);
  }
  function atr(bars,period=14){
    if(bars.length < period+2) return NaN;
    const tr=[];
    for(let i=1;i<bars.length;i++){
      const b=bars[i], p=bars[i-1];
      tr.push(Math.max(b.high-b.low,Math.abs(b.high-p.close),Math.abs(b.low-p.close)));
    }
    let value=avg(tr.slice(0,period));
    for(let i=period;i<tr.length;i++) value=(value*(period-1)+tr[i])/period;
    return value;
  }
  function macd(values){
    const e12=emaSeries(values,12),e26=emaSeries(values,26);
    const diffs=[];
    for(let i=25;i<values.length;i++) diffs.push(e12[i]-e26[i]);
    if(diffs.length<9) return {hist:NaN,line:NaN,signal:NaN};
    const sig=emaSeries(diffs,9);
    const line=diffs[diffs.length-1],signal=sig[sig.length-1];
    return {hist:line-signal,line,signal};
  }
  function dmi(bars,period=14) {
    if(bars.length<2*period+2) return {adx:NaN,plus:NaN,minus:NaN};
    const tr=[],plus=[],minus=[];
    for(let i=1;i<bars.length;i++){
      const b=bars[i],p=bars[i-1];
      const up=b.high-p.high,down=p.low-b.low;
      plus.push(up>down && up>0 ? up : 0);
      minus.push(down>up && down>0 ? down : 0);
      tr.push(Math.max(b.high-b.low,Math.abs(b.high-p.close),Math.abs(b.low-p.close)));
    }
    let trs=tr.slice(0,period).reduce((a,b)=>a+b,0),ps=plus.slice(0,period).reduce((a,b)=>a+b,0),ms=minus.slice(0,period).reduce((a,b)=>a+b,0);
    let currentPlus=100*ps/(trs||1),currentMinus=100*ms/(trs||1);
    const dx=[100*Math.abs(currentPlus-currentMinus)/(currentPlus+currentMinus||1)];
    for(let i=period;i<tr.length;i++){
      trs=trs-trs/period+tr[i]; ps=ps-ps/period+plus[i];ms=ms-ms/period+minus[i];
      currentPlus=100*ps/(trs||1);currentMinus=100*ms/(trs||1);
      dx.push(100*Math.abs(currentPlus-currentMinus)/(currentPlus+currentMinus||1));
    }
    if(dx.length<period) return {adx:NaN,plus:currentPlus,minus:currentMinus};
    let adx=avg(dx.slice(0,period));
    for(let i=period;i<dx.length;i++) adx=(adx*(period-1)+dx[i])/period;
    return {adx,plus:currentPlus,minus:currentMinus};
  }
  function buildFeatures(bars) {
    if(!Array.isArray(bars) || bars.length<65) return null;
    const last=bars[bars.length-1], closes=bars.map(b=>b.close);
    const em9=emaSeries(closes,9),em21=emaSeries(closes,21),em50=emaSeries(closes,50);
    const dm=dmi(bars), m=macd(closes),r=rsi(closes),a=atr(bars);
    const recent=bars.slice(-3),vol=bars.slice(-21,-1);
    const traded=recent.reduce((s,b)=>s+b.volume,0);
    const takerBuy=recent.reduce((s,b)=>s+(b.takerBuy||0),0);
    return {
      close:last.close,
      ema9:em9.at(-1),ema21:em21.at(-1),ema50:em50.at(-1),
      rsi:r,adx:dm.adx,plusDI:dm.plus,minusDI:dm.minus,macdHist:m.hist,
      atr:a,atrPct:100*a/(last.close||1),
      buyPressure:traded>0 ? takerBuy/traded : NaN,
      volumeRatio:last.volume/(avg(vol.map(b=>b.volume))||1),
      candleBody:Math.abs(last.close-last.open)/(Math.max(last.high-last.low,1e-16)),
      upClose:last.close>last.open, downClose:last.close<last.open
    };
  }
  function scoreSignal(features,threshold=78) {
    if(!features || !Number.isFinite(features.atrPct) || !Number.isFinite(features.rsi)) return null;
    // Índices baseados em regras transparentes. Score NÃO é probabilidade de acerto.
    const f=features;
    const dirs=[{side:'COMPRA',sign:1},{side:'VENDA',sign:-1}];
    const options=dirs.map(({side,sign})=>{
      let points=0;const reasons=[];
      function add(ok,pts,txt) {if(ok){points+=pts;reasons.push(txt)}}
      const up=sign===1;
      add(up ? (f.ema9>f.ema21 && f.close>f.ema21 && f.ema21>f.ema50) : (f.ema9<f.ema21 && f.close<f.ema21 && f.ema21<f.ema50),25,'EMAs 9/21/50 alinhadas');
      add(f.adx>=20 && (up ? f.plusDI>f.minusDI : f.minusDI>f.plusDI),20,'ADX e DMI concordam');
      add(up ? (f.rsi>=52 && f.rsi<=68) : (f.rsi>=32 && f.rsi<=48),15,'RSI em faixa favorável');
      add(up ? f.macdHist>0 : f.macdHist<0,15,'MACD confirma direção');
      add(up ? f.buyPressure>=.54 : f.buyPressure<=.46,15,'Fluxo agressor favorece lado');
      add((up?f.upClose:f.downClose) && f.candleBody>=.4 && f.volumeRatio>=.75,10,'Candle fechado confirma');
      return {side,score:points,reasons};
    });
    options.sort((a,b)=>b.score-a.score);
    const top=options[0],second=options[1];
    const risky = f.atrPct < 0.045 || f.atrPct>4.5 || f.rsi>=75 || f.rsi<=25 || Math.abs(f.close-f.ema21)>2.8*f.atr;
    if(risky || top.score<threshold || top.score-second.score<20) return {
      side:'AGUARDAR',score:top.score,reasons:risky?['Volatilidade ou esticamento fora do filtro']:['Confluência insuficiente'],
      altSide:top.side,features:compact(f)
    };
    return {side:top.side,score:top.score,reasons:top.reasons,altSide:second.side,features:compact(f)};
  }
  function compact(f) {return {rsi:round(f.rsi),adx:round(f.adx),plusDI:round(f.plusDI),minusDI:round(f.minusDI),buyPct:round(f.buyPressure*100),atrPct:round(f.atrPct,2),volumeRatio:round(f.volumeRatio,2)};}
  function classifyCandle(direction,open,close) {
    if(!Number.isFinite(open)||!Number.isFinite(close)) return 'INDEFINIDO';
    if(open===close) return 'EMPATE';
    return (direction==='COMPRA')===(close>open) ? 'ACERTO TÉCNICO' : 'ERRO TÉCNICO';
  }
  return {PERIOD_MS,emaSeries,rsi,atr,dmi,macd,buildFeatures,scoreSignal,classifyCandle};
});
