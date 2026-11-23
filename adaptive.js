/* Regimes e estratégias CANDIDATAS, não probabilidades de WIN. Usa apenas velas fechadas. */
(function(root,factory){const api=factory(); if(typeof module!=='undefined'&&module.exports)module.exports=api;root.M5Adaptive=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const E=(typeof window!=='undefined'?window.M5Engine:null)||(typeof require==='function'?require('./engine.js'):null);
 const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN;
 const sd=a=>{const m=avg(a);return Math.sqrt(avg(a.map(v=>(v-m)**2)))};
 const pct=(x,y)=>y?x/y:NaN;
 function m15fromM5(bars){
  const buckets=new Map();for(const b of bars){const t=Math.floor(b.t/900000)*900000;
   if(!buckets.has(t))buckets.set(t,[]);buckets.get(t).push(b);}
  return [...buckets.entries()].sort((a,b)=>a[0]-b[0]).filter(([t,x])=>x.length===3&&x[0].t===t&&x[1].t===t+300000&&x[2].t===t+600000).map(([t,x])=>({t,open:x[0].open,high:Math.max(...x.map(b=>b.high)),low:Math.min(...x.map(b=>b.low)),close:x[2].close,volume:x.reduce((s,b)=>s+b.volume,0)}));
 }
 function bands(bars,offset=0){const arr=bars.slice(0,bars.length-offset).slice(-20).map(b=>b.close);if(arr.length<20)return null;const center=avg(arr),dev=sd(arr);return {mid:center,top:center+2*dev,bottom:center-2*dev,width:pct(4*dev,center)};}
 function extract(bars){if(!bars||bars.length<170)return null;
  const f=E.buildFeatures(bars),prev=E.buildFeatures(bars.slice(0,-1)),m15=m15fromM5(bars),ema20=E.emaSeries(m15.map(x=>x.close),20).at(-1),ema50=E.emaSeries(m15.map(x=>x.close),50).at(-1);
  if(!f||!prev||!Number.isFinite(ema20)||!Number.isFinite(ema50))return null;
  const b=bands(bars),previousB=bands(bars,1),recentWidths=[];
  for(let back=2;back<=65;back++){const bb=bands(bars,back);if(bb)recentWidths.push(bb.width);}
  const squeeze=recentWidths.length>40 && recentWidths.filter(w=>w<=previousB.width).length/recentWidths.length<=.25;
  const last=bars.at(-1),prevHigh=Math.max(...bars.slice(-21,-1).map(b=>b.high)),prevLow=Math.min(...bars.slice(-21,-1).map(b=>b.low));
  return {f,prev,ema20,ema50,b,previousB,squeeze,last,prevHigh,prevLow,atrPct:f.atrPct};
 }
 function decide(bars,threshold=80){const x=extract(bars);if(!x)return {side:'AGUARDAR',score:0,regime:'SEM DADOS',strategy:'Nenhuma',reasons:['É necessário histórico M5 suficiente para confirmar M15'],indicators:[]};
  const {f,prev,ema20,ema50,last,b,squeeze,prevHigh,prevLow}=x;
  if(!Number.isFinite(f.buyPressure)||!Number.isFinite(f.atrPct)||!Number.isFinite(f.adx))return wait('DADOS INCOMPLETOS','Volume agressor, ADX ou volatilidade indisponíveis');
  if(f.atrPct<.045||f.atrPct>4.5||Math.abs(f.close-f.ema21)>2.8*f.atr)return wait('VOLATILIDADE FORA DO FILTRO','ATR muito baixo/alto ou preço muito distante da EMA');
  let regime=f.adx>=23?'TENDÊNCIA':f.adx<=18?'LATERAL':squeeze?'ROMPIMENTO':'TRANSIÇÃO';
  if(squeeze && f.volumeRatio>=1.35 && (last.close>prevHigh||last.close<prevLow))regime='ROMPIMENTO';
  const strategies=[];
  for(const up of [true,false]){
   const side=up?'COMPRA':'VENDA';
   const m15dir=up?ema20>ema50:ema20<ema50;
   const emadir=up?f.ema21>f.ema50&&f.close>f.ema21:f.ema21<f.ema50&&f.close<f.ema21;
   const di=up?f.plusDI>f.minusDI:f.minusDI>f.plusDI;
   const pressure=up?f.buyPressure>=.55:f.buyPressure<=.45;
   const candle=up?last.close>last.open:last.close<last.open;
   const nearEMA=Math.abs(f.close-f.ema21)<=1.65*f.atr;
   const rsiFollow=up?f.rsi>=50&&f.rsi<=70&&f.rsi>=prev.rsi:f.rsi<=50&&f.rsi>=30&&f.rsi<=prev.rsi;
   const volume=f.volumeRatio>=.8;
   const trendScore=(m15dir&&emadir?25:0)+(f.adx>=23&&di?20:0)+(pressure?20:0)+(rsiFollow?15:0)+(nearEMA&&volume?15:0)+(candle&&f.candleBody>.4?5:0);
   if(regime==='TENDÊNCIA'&&m15dir&&emadir&&di&&nearEMA){
     strategies.push({side,score:trendScore,regime,strategy:'Continuação de tendência',indicators:['EMA 20/50 M15','EMA 21/50 M5','ADX/DMI','RSI','Pressão agressora','ATR'],reasons:['Tendência alinhada M5/M15','ADX e DMI favoráveis','Pressão e momentum avaliados','ATR controla esticamento']});}
   const breakout=up?last.close>prevHigh:last.close<prevLow;
   const squeezeScore=(squeeze?25:0)+(breakout?20:0)+(pressure?20:0)+(f.volumeRatio>=1.5?15:0)+(f.atrPct>=.07&&f.atrPct<=2.5?15:0)+(candle?5:0);
   if(regime==='ROMPIMENTO'&&breakout&&squeeze&&f.volumeRatio>=1.5&&pressure){strategies.push({side,score:squeezeScore,regime,strategy:'Rompimento após contração',indicators:['Bandas de Bollinger','Rompimento de faixa','Volume relativo','Pressão agressora','ATR'],reasons:['Rompimento após contração','Volume acima da média','Pressão no sentido do rompimento']});}
   const lowTouch=last.low<=b.bottom+0.12*(b.top-b.bottom),topTouch=last.high>=b.top-0.12*(b.top-b.bottom);
   const reversion=up?(lowTouch&&f.rsi>prev.rsi&&f.rsi<49):(topTouch&&f.rsi<prev.rsi&&f.rsi>51);
   const lateralScore=(f.adx<18?25:0)+(reversion?20:0)+(pressure?20:0)+(candle?15:0)+(f.volumeRatio>=.6&&f.volumeRatio<=1.8?15:0)+(f.atrPct>=.045&&f.atrPct<=2.5?5:0);
   if(regime==='LATERAL'&&reversion&&candle&&pressure){strategies.push({side,score:lateralScore,regime,strategy:'Reversão em faixa',indicators:['Bandas de Bollinger','RSI','Suporte/resistência','Pressão agressora','ATR'],reasons:['Mercado sem tendência forte','Teste de extremo da faixa','RSI e pressão confirmam reação']});}
  }
  strategies.sort((a,b)=>b.score-a.score);
  const best=strategies[0];if(!best||best.score<Number(threshold))return wait(regime,`Nenhuma configuração atingiu ${threshold}/100 com filtros essenciais`);
  if(strategies[1]&&strategies[1].side!==best.side&&strategies[1].score>=best.score-15)return wait(regime,'Direções conflitantes');
  return best;
 }
 function wait(regime,why){return {side:'AGUARDAR',score:0,regime,strategy:'Nenhuma',indicators:[],reasons:[why]};}
 return {m15fromM5,bands,extract,decide};
});
