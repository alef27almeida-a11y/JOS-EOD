/* Radar M5: classificador incremental local, sem rede nem API de IA. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;root.M5Learner=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const N=12, LIMIT=3, zero=()=>Array(N).fill(0);
 const clip=(v,a=-LIMIT,b=LIMIT)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
 const sigmoid=z=>z>=0?1/(1+Math.exp(-z)):Math.exp(z)/(1+Math.exp(z));
 function vector(f){
  if(!f||!Number.isFinite(f.atr)||f.atr<=0)return null;
  const z=(a,b,s=1)=>clip((a-b)/(f.atr*s));
  return [1,z(f.ema9,f.ema21,1.5),z(f.ema21,f.ema50,2.5),z(f.close,f.ema21,2),
    clip((f.rsi-50)/22),clip((f.adx-22)/20),clip((f.plusDI-f.minusDI)/24),
    clip(f.macdHist/(f.atr*.45)),clip((f.buyPressure-.5)*5),
    clip((f.volumeRatio-1)/1.2),clip((f.upClose?1:f.downClose?-1:0)*f.candleBody*2),
    clip((f.atrPct-.4)/1.2)];
 }
 class OnlineModel{
  constructor(saved){this.w=zero();this.learned=0;this.historical=0;this.live=0;this.seen={};
    if(saved&&Array.isArray(saved.w)&&saved.w.length===N&&saved.w.every(Number.isFinite)){
      this.w=saved.w.map(x=>clip(x,-8,8));this.learned=Math.max(0,Number(saved.learned)||0);
      this.historical=Math.max(0,Number(saved.historical)||0);this.live=Math.max(0,Number(saved.live)||0);
      if(saved.seen&&typeof saved.seen==='object')this.seen=Object.fromEntries(Object.entries(saved.seen).filter(([k,v])=>/^[A-Z0-9]{3,20}$/.test(k)&&Number.isFinite(v)).slice(0,2000));
    }
  }
  probability(x){if(!x||x.length!==N)return null;return sigmoid(this.w.reduce((a,w,i)=>a+w*x[i],0));}
  train(x,y,{symbol,time,source='historical'}={}){
    if(!x||x.length!==N||x.some(v=>!Number.isFinite(v))||y!==0&&y!==1)return false;
    if(symbol&&Number.isFinite(time)&&Number.isFinite(this.seen[symbol])&&time<=this.seen[symbol])return false;
    const p=this.probability(x);const learningRate=Math.max(.007,.045/Math.sqrt(1+this.learned/400));
    const diff=y-p;
    for(let i=0;i<N;i++){
      const reg=i===0?0:0.0007*this.w[i];
      this.w[i]=clip(this.w[i]+learningRate*(diff*x[i]-reg),-8,8);
    }
    this.learned++;if(source==='live')this.live++;else this.historical++;
    if(symbol&&Number.isFinite(time))this.seen[symbol]=time;
    return true;
  }
  toJSON(){return {w:this.w,learned:this.learned,historical:this.historical,live:this.live,seen:this.seen};}
 }
 function outcome(direction,open,close){if(!Number.isFinite(open)||!Number.isFinite(close)||open===close)return 'EMPATE';return (direction==='COMPRA')===(close>open)?'WIN':'LOSS';}
 return {OnlineModel,vector,outcome};
});
