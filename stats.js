/* Estatísticas dos avisos efetivamente confirmados — sem resultado de corretora. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;root.M5Stats=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const WIN='ACERTO TÉCNICO',LOSS='ERRO TÉCNICO';
 const pct=(n,d)=>d?Math.round(1000*n/d)/10:null;
 const groups=[['Tendência EMA','EMAs'],['ADX / DMI','ADX'],['RSI','RSI'],['MACD','MACD'],['Pressão compra/venda','Fluxo agressor'],['Candle + volume','Candle fechado']];
 function hourBR(time){const h=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(new Date(time));return `${h.padStart(2,'0')}:00`;}
 function asArray(x){return Array.isArray(x)?x:[];}
 function rangeFilter(items,range='all',reference=Date.now()){
   const days=range==='7'?7:range==='30'?30:Infinity;
   return asArray(items).filter(x=>x&&Number.isFinite(x.time)&&x.time<=reference&&(!Number.isFinite(days)||x.time>=reference-days*86400000));
 }
 function summary(items){let wins=0,losses=0,ties=0,unknown=0,favor=0,favorN=0;
   for(const p of asArray(items)){
     if(p.result===WIN){wins++}else if(p.result===LOSS){losses++}else if(p.result==='EMPATE'){ties++}else{unknown++}
     if((p.result===WIN||p.result===LOSS)&&Number.isFinite(p.favorablePct)){favor+=p.favorablePct;favorN++}
   }
   return {wins,losses,ties,unknown,decided:wins+losses,rate:pct(wins,wins+losses),total:asArray(items).length,avgFavorablePct:favorN?favor/favorN:null};
 }
 function group(items,key){const m=new Map();for(const x of asArray(items)){
   const keys=key(x);for(const name of (Array.isArray(keys)?keys:[keys])){if(!name)continue;if(!m.has(name))m.set(name,[]);m.get(name).push(x);}
   }
   return [...m.entries()].map(([name,records])=>({name,...summary(records)}));
 }
 function scoreGroup(s){const v=Number(s);if(!Number.isFinite(v))return 'Não informado';if(v<80)return '70–79';if(v<90)return '80–89';return '90–100';}
 function reasonGroup(p){if(Array.isArray(p.indicators)&&p.indicators.length)return p.indicators;const reasons=asArray(p.reasons).join(' | ');return groups.filter(([,token])=>reasons.includes(token)).map(([name])=>name);}
 function compute(history,range='all',reference=Date.now()){
   const items=rangeFilter(history,range,reference),done=items.filter(x=>[WIN,LOSS,'EMPATE'].includes(x.result));
   const rateSort=(a,b)=>b.decided-a.decided || (b.rate??-1)-(a.rate??-1);
   const byStrategy=group(done,x=>String(x.strategy||'Não informado')+' · '+String(x.regime||'Sem classificação')).sort(rateSort);
   const byAsset=group(done,x=>String(x.symbol||'').replace(/USDT$/,'')+'/USDT').sort(rateSort);
   const byHour=group(done,x=>hourBR(x.time)).sort((a,b)=>a.name.localeCompare(b.name));
   const byDirection=group(done,x=>x.side||x.direction||'?').sort(rateSort);
   const byIndicator=group(done,reasonGroup).sort(rateSort);
   const byScore=group(done,x=>scoreGroup(x.score)).sort((a,b)=>a.name.localeCompare(b.name));
   const recent=done.filter(x=>x.result!== 'EMPATE').slice(-20);
   return {overall:summary(done),last20:summary(recent),byStrategy,byAsset,byHour,byDirection,byIndicator,byScore,unresolved:items.length-done.length,observations:items.length};
 }
 function previewStats(previews,range='all',reference=Date.now()){
   const items=rangeFilter(asArray(previews).map(x=>({...x,time:Number.isFinite(x.issuedAt)?x.issuedAt:x.time})),range,reference);return {sent:items.length,confirmed:items.filter(x=>x.status==='CONFIRMADO').length,canceled:items.filter(x=>x.status==='CANCELADO').length,notObserved:items.filter(x=>x.status==='NÃO OBSERVADO').length,awaiting:items.filter(x=>x.status==='AGUARDANDO').length};
 }
 function csv(records){const rows=[['Ativo','Direção','Data e hora Brasília','Vela abre UTC','Vela fecha UTC','Nota técnica','Indicadores usados','Preço abertura','Preço fechamento','Variação favorável %','Resultado','Fonte','Notificação principal']];
   const fmt=x=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'medium'}).format(new Date(x));
   for(const r of asArray(records)){
     rows.push([r.symbol||'',r.side||r.direction||'',Number.isFinite(r.time)?fmt(r.time):'',Number.isFinite(r.time)?new Date(r.time).toISOString():'',Number.isFinite(r.time)?new Date(r.time+300000).toISOString():'',r.score??'',asArray(r.reasons).join(' | '),r.open??'',r.close??'',Number.isFinite(r.favorablePct)?r.favorablePct.toFixed(5):'',r.result||'NÃO AVALIADO','Binance referência; Safirion permitidos manualmente',r.notified===true?'Sim':r.notified===false?'Não':'Desconhecido']);
   }
   const cell=x=>'"'+String(x).replaceAll('"','""')+'"';return '\uFEFF'+rows.map(r=>r.map(cell).join(';')).join('\r\n');
 }
 return {compute,previewStats,summary,csv,hourBR,rangeFilter,reasonGroup};
});
