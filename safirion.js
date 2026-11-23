/* Filtro de ativos informados pelo usuário. NENHUMA lista ou preço vem da Safirion. */
(function(root,factory){const api=factory(); if(typeof module!=='undefined'&&module.exports)module.exports=api;root.M5Safirion=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 function parseList(text){
  const raw=String(text||'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean);
  const seen=new Set(),approved=[],unmapped=[];
  for(const name of raw){const normalized=name.toUpperCase().replace(/[\s\/_-]/g,'');
   // Pares SPOT/USDT completos, digitados pelo usuário. BTC/USD NÃO vira BTC/USDT silenciosamente.
   if(/^[A-Z0-9]{2,18}USDT$/.test(normalized) && normalized!=='USDT' && !seen.has(normalized)){
     approved.push(normalized);seen.add(normalized);
   }else if(!seen.has(normalized)){unmapped.push(name);seen.add(normalized);}
  }
  return {approved,unmapped,entered:raw.length};
 }
 function intersect(approved,exInfo){
  const available=new Set((exInfo?.symbols||[]).filter(s=>s.status==='TRADING'&&s.quoteAsset==='USDT'&&s.isSpotTradingAllowed!==false).map(s=>s.symbol));
  return {active:approved.filter(s=>available.has(s)),notAvailable:approved.filter(s=>!available.has(s))};
 }
 return {parseList,intersect};
});
