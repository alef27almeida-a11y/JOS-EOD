/* Radar M5 — Somente lista informada dos ativos Safirion; candles Binance de referência, sem enviar ordens. */
(()=>{'use strict';
const E=window.M5Engine, L=window.M5Learner, S=window.M5Stats, A=window.M5Adaptive, F=window.M5Safirion;
if(!E||!L||!S||!A||!F){document.body.insertAdjacentHTML('afterbegin','<p>Falha ao carregar o motor de análise.</p>');return;}
const $=id=>document.getElementById(id), FIVE=300000, KEY='radar_m5_safirion_v13';
const now=()=>Date.now();
const brTime=(ts,seconds=false)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit'}:{})}).format(new Date(ts));
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MODE='SAFIRION_MANUAL_ALLOWLIST_BINANCE_REFERENCE';
function restore(){try {const s=JSON.parse(localStorage.getItem(KEY)||'{}');return s && typeof s==='object'?s:{};}catch{return {}}}
const old=restore();
const state={run:false,generation:0,loading:false,universe:[],bars:new Map(),forming:new Map(),fresh:new Map(),sockets:[],socketCount:0,loadCount:0,alertCount:0,preSlot:0,confirmedSlot:0,previews:[],signals:[],pending:Array.isArray(old.pending)?old.pending.slice(-200):[],history:Array.isArray(old.history)?old.history.slice(-1200):[],preAlerts:Array.isArray(old.preAlerts)?old.preAlerts.slice(-500):[],model:new L.OnlineModel(old.model),evaluated:Number(old.evaluated)||0,correct:Number(old.correct)||0,beforeInstallPrompt:null,lastSync:0,lastData:0,lastVisible:now(),syncing:false,alertSeen:new Set(),lastTrainingSave:0};
const prefs={allowedText:String(old.prefs?.allowedText||''),threshold:['70','80','90'].includes(old.prefs?.threshold)?old.prefs.threshold:'80',lead:['30','60','120','180'].includes(String(old.prefs?.lead))?String(old.prefs.lead):'120',learning:old.prefs?.learning!==false,sound:old.prefs?.sound!==false,voice:!!old.prefs?.voice,notify:old.prefs?.notify!==false};
function setValue(id,v){if($(id))$(id).value=v}
$('safirionAssets').value=prefs.allowedText; setValue('threshold',prefs.threshold);setValue('lead',prefs.lead);
for(const [key,id] of [['learning','learningToggle'],['sound','sound'],['voice','voice'],['notify','notify']])$(id).checked=prefs[key];
function save(){try{localStorage.setItem(KEY,JSON.stringify({prefs,model:state.model.toJSON(),pending:state.pending.slice(-200),history:state.history.slice(-1200),preAlerts:state.preAlerts.slice(-500),evaluated:state.evaluated,correct:state.correct}));}catch(e){setMessage('Sem espaço para armazenar o histórico. Exporte a memória.','error')}}
let activeToast=null;
function setMessage(s,type=''){const e=$('connectionMessage');e.textContent=s;e.className='message '+type;}
function status(s,label){$('liveStatus').className='live-status '+s;$('liveLabel').textContent=label;}
function setProgress(p){$('loadProgress').style.width=Math.max(0,Math.min(100,p))+'%';}
function refreshSafirionList(){const r=F.parseList($('safirionAssets').value);$('safirionCount').textContent=`${r.approved.length} pares USDT de referência cadastrados`;$('unsupportedNames').textContent=r.unmapped.length?'Sem cotação compatível no radar: '+r.unmapped.join(', '):'Outras classes, como EUR/USD, ouro e OTC, dependem de fonte específica.'; return r;}

function formatDuration(ms){const sec=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`}
function updateClock(){const t=now(),next=Math.floor(t/FIVE)*FIVE+FIVE;$('clock').textContent=brTime(t,true);$('countdown').textContent=formatDuration(next-t);$('leadHint').textContent=`Pré-alerta ${Number(prefs.lead)/60} min antes • ${brTime(next-Number(prefs.lead)*1000)} para vela ${brTime(next)}`;}
function speak(txt){if(!prefs.voice||!('speechSynthesis' in window))return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(txt);u.lang='pt-BR';u.rate=1.1;speechSynthesis.speak(u);}catch{}}
function beep(){if(!prefs.sound)return;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=760;g.gain.value=.03;o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.16);o.onended=()=>c.close();}catch{}}
async function showNotification(title,body){
 if(!prefs.notify||!('Notification' in window)||Notification.permission!=='granted'||location.protocol==='file:')return;
 try{
   const registration=('serviceWorker' in navigator)?await navigator.serviceWorker.ready:null;
   if(registration){await registration.showNotification(title,{body,tag:`radar-${Date.now()}`,icon:'icon.svg',silent:false});return;}
   const n=new Notification(title,{body,icon:'icon.svg'});setTimeout(()=>n.close(),10000);
 }catch(e){console.warn('Notificação indisponível neste dispositivo:',e);}
}
function alertUser(title,body){beep();speak(`${title}. ${body}`);showNotification(title,body);}
function setHero(statusClass,title,sub,meta,marker='◉'){$('heroSignal').className='hero-signal '+statusClass;$('signalTitle').textContent=title;$('signalSub').textContent=sub;$('heroMeta').textContent=meta;$('signalMarker').textContent=marker;}
function refreshStats(){const pending=state.pending.filter(p=>p.status==='PENDENTE');const wins=state.history.filter(p=>p.result==='ACERTO TÉCNICO').length,losses=state.history.filter(p=>p.result==='ERRO TÉCNICO').length;
 $('assetsCount').textContent=state.bars.size;$('universeCount').textContent=state.universe.length;$('alertsCount').textContent=state.alertCount;$('lastUpdate').textContent=state.lastData?brTime(state.lastData):'—';
 $('learnTotal').textContent=state.model.learned;$('learnLive').textContent=state.model.live;$('learnObservations').textContent=state.evaluated;$('learnRate').textContent=state.evaluated?Math.round(100*state.correct/state.evaluated)+'%':'—';
 $('learningBadge').textContent=state.model.live>=100&&state.evaluated>=30?'Filtro adaptativo ativo':'Modelo em treinamento';$('learningMessage').textContent=`Exemplos históricos: ${state.model.historical}. Ao vivo: ${state.model.live}. Precisão ao vivo é medida separadamente do treino e não é chance de lucro.`;
 $('technicalWins').textContent=wins;$('technicalLosses').textContent=losses;$('technicalPending').textContent=pending.length;$('technicalRate').textContent=wins+losses?Math.round(wins*100/(wins+losses))+'%':'—';
}
function renderHistory(){const h=state.history.slice(-12).reverse();$('historyList').innerHTML=h.length?h.map(x=>`<div class="history-row"><span><b>${escapeHtml(x.symbol.slice(0,-4))}/USDT</b> • ${escapeHtml(x.side||x.direction||'—')}<small>${brTime(x.time)} • fechamento ${brTime(x.time+FIVE)} • score ${x.score}/100 • ${escapeHtml(x.strategy||'')}</small></span><span class="right ${x.result==='ACERTO TÉCNICO'?'win':x.result==='ERRO TÉCNICO'?'loss':'pending'}">${escapeHtml(x.result)}</span></div>`).join(''):'<div class="empty">Ainda não há previsões avaliadas ao vivo.</div>';}
function renderDetailedStats(){
 const range=$('statsPeriod').value;
 const subset=$('statsScope').value==='main'?state.history.filter(x=>x.notified===true):state.history;
 const a=S.compute(subset,range),p=S.previewStats(state.preAlerts,range);
 $('statsSeen').textContent=a.overall.decided;
 $('statsPct').textContent=a.overall.rate===null?'—':a.overall.rate.toFixed(1)+'%';
 $('statsLast20').textContent=a.last20.rate===null?'—':a.last20.rate.toFixed(1)+'%';
 $('statsTie').textContent=a.overall.ties;
 $('statsWarning').textContent=a.overall.decided===0?'Ainda não há sinais finalizados. O radar só mede a direção quando a vela fecha.':a.overall.decided<30?`Amostra pequena: ${a.overall.decided} sinais com direção definida. Ainda não estime probabilidade confiável de acerto.`:`Resultados observados de ${a.overall.decided} sinais; o histórico é do mercado spot e não comprova ganho financeiro. Resultados passados não garantem resultados futuros.`;
 $('previewPerformance').textContent=`Pré-alertas enviados: ${p.sent} • confirmados na abertura: ${p.confirmed} • cancelados/mudaram: ${p.canceled} • sem monitoramento no fechamento: ${p.notObserved} • aguardando: ${p.awaiting}. Apenas sinais confirmados contam como oportunidades avaliadas.`;
 function show(target,rows,limit=8){
  const parts=rows.slice(0,limit).map(x=>`<div class="stats-item ${x.decided<30?'low-sample':''}"><strong>${escapeHtml(x.name)}</strong><span class="stats-percent">${x.rate===null?'—':x.rate.toFixed(1)+'%'}</span><small>${x.wins} acertos · ${x.losses} erros · ${x.ties} empates · ${x.decided} avaliados${x.decided<30?' · amostra pequena':''}</small></div>`);
  $(target).innerHTML=parts.join('')||'<div class="empty">Ainda sem observações nesse grupo.</div>';
 }
 show('byStrategy',a.byStrategy||[],8);show('byAsset',a.byAsset,10);show('byHour',a.byHour,24);show('byDirection',a.byDirection);show('byScore',a.byScore);show('byIndicator',a.byIndicator);
}
function markPreAlerts(target,confirmed){let changed=false;
 const matched=new Set(confirmed.map(x=>x.symbol+'|'+x.side));
 for(const a of state.preAlerts){if(a.time===target&&a.status==='AGUARDANDO'){a.status=matched.has(a.symbol+'|'+a.side)?'CONFIRMADO':'CANCELADO';changed=true;}}
 if(changed)renderDetailedStats();
}
function finalizePreviousPending(barsOnly=false){let changed=false;const remain=[];for(const a of state.preAlerts){if(a.status==='AGUARDANDO'&&now()>a.time+15000){a.status='NÃO OBSERVADO';changed=true;}}
 for(const p of state.pending){
  const bars=state.bars.get(p.symbol)||[],bar=bars.find(x=>x.t===p.time);
  if(bar){finishSignal(p,bar);changed=true;}
  else if(!barsOnly && now()>p.time+FIVE+30*60000){state.history.push({...p,result:'NÃO AVALIADO',status:'SEM DADOS'});changed=true;}
  else remain.push(p);
 }
 state.pending=remain;
 if(changed){state.history=state.history.slice(-1200);save();renderHistory();refreshStats();renderDetailedStats();}
}
function finishSignal(p,k){
 const result=E.classifyCandle(p.side,k.open,k.close);
 const changePct=k.open>0?100*(k.close-k.open)/k.open:null;
 const favorablePct=Number.isFinite(changePct)?(p.side==='COMPRA'?changePct:-changePct):null;
 state.history.push({...p,result,status:'AVALIADO',closed:now(),open:k.open,close:k.close,favorablePct});
 if(result!=='EMPATE'&&result!=='INDEFINIDO'){state.evaluated++;if(result==='ACERTO TÉCNICO')state.correct++;}
}
function symbolLink(symbol){return 'https://www.binance.com/pt-BR/trade/'+encodeURIComponent(symbol.replace(/USDT$/,''))+'_USDT?type=spot'}
function renderSignals(){const t=now();state.signals=state.signals.filter(s=>s.time+15000>t);const active=state.signals.slice(0,8);$('freshBadge').textContent=active.length?`${active.length} sinal(is) recente(s)`:'Sem sinais novos';$('signalList').innerHTML=active.length?active.map(s=>`<div class="signal-card ${s.side==='COMPRA'?'buy':'sell'} ${t>s.time+10000?'expired':''}"><div class="signal-top"><div><span class="symbol">${escapeHtml(s.symbol.replace(/USDT$/,''))}/USDT</span><div class="direction">${s.side==='COMPRA'?'▲ COMPRA':'▼ VENDA'}</div></div><span class="score">${s.score}/100</span></div><div class="signal-sub">Vela ${brTime(s.time)} a ${brTime(s.time+FIVE)} • ${t>s.time+10000?'VENCIDO':'ABERTURA RECENTE'}</div><div class="reasons"><b>${escapeHtml(s.regime||'')} · ${escapeHtml(s.strategy||'')}</b> · ${escapeHtml(s.reasons.join(' · '))}</div><div class="signal-actions"><span class="valid">Direção técnica, não lucro garantido</span><span class="valid">Fonte: Binance referência</span></div></div>`).join(''):'<div class="empty">Nenhum sinal confirmado nesta abertura. O radar não força entradas.</div>';}
function renderPreviews(){const ps=state.previews.slice(0,5);$('previewList').innerHTML=ps.length?ps.map(s=>`<div class="preview-item"><b>${escapeHtml(s.symbol.replace('USDT',''))}/USDT</b><span class="${s.side==='COMPRA'?'green':'red'}">${s.side}</span><span>${s.score}/100</span><small>${escapeHtml(s.regime||'')} · ${brTime(s.time)} • provisório</small></div>`).join(''):'<div class="empty">Aguardando o horário de pré-alerta.</div>';}
function validSymbol(t){const s=t.symbol||t.s||'';return typeof s==='string'&&/^[A-Z0-9]{3,25}USDT$/.test(s)&&Number(t.quoteVolume||t.q)>0&&!/(UP|DOWN|BULL|BEAR)USDT$/.test(s)&&!(/^(USDC|TUSD|FDUSD|USDP|DAI|EUR|BRL|USDE|USD1|PYUSD|EURI|RLUSD)USDT$/.test(s));}
const HOSTS=['https://data-api.binance.vision','https://api.binance.com'];
let activeBase=HOSTS[0];
async function reqJSON(path,ms=12000){const urls=[activeBase,...HOSTS.filter(x=>x!==activeBase)];let err;
 for(const base of urls){let controller=new AbortController();let timeout=setTimeout(()=>controller.abort(),ms);
 try{const r=await fetch(base+path,{signal:controller.signal,cache:'no-store'});if(!r.ok)throw Error(`HTTP ${r.status}`);const data=await r.json();activeBase=base;return data;}catch(e){err=e;}finally{clearTimeout(timeout)}}throw err||Error('API indisponível');}
function parseBar(k){return {t:Number(k[0]),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]),takerBuy:Number(k[9]||0)};}
async function getUniverse(gen){
 const listed=F.parseList(prefs.allowedText);
 if(!listed.approved.length)throw Error('Cadastre os ativos exibidos na Safirion com símbolo USDT exatamente correspondente. Não há lista oficial de ativos carregada.');
 setMessage('Validando os ativos digitados contra a fonte de referência Binance...');
 const info=await reqJSON('/api/v3/exchangeInfo',16000);
 if(gen!==state.generation)throw Error('Cancelado');
 const {active,notAvailable}=F.intersect(listed.approved,info);
 const unavailable=[...listed.unmapped,...notAvailable];
 $('unsupportedNames').textContent=unavailable.length?'Não monitorados (sem preço compatível): '+unavailable.join(', '):'Todos os símbolos cadastrados têm candles de referência Binance. Não são preços da Safirion.';
 if(!active.length)throw Error('Nenhum símbolo cadastrado possui um par Spot USDT equivalente na Binance. Precisamos de outra fonte de dados para esses ativos.');
 return active.slice(0,75);
}
async function loadBars(symbol,gen,limit=235){const rows=await reqJSON(`/api/v3/klines?symbol=${symbol}&interval=5m&limit=${limit}`,15000);if(gen!==state.generation)return false;
 if(!Array.isArray(rows))return false;const t=now();const valid=rows.filter(k=>Number(k[6])<t-250).map(parseBar).filter(b=>Number.isFinite(b.close)&&Number.isFinite(b.t));if(valid.length<172)return false;
 state.bars.set(symbol,valid.slice(-225));const current=rows.find(k=>Number(k[0])===Math.floor(t/FIVE)*FIVE);if(current){state.forming.set(symbol,parseBar(current));state.fresh.set(symbol,t);}return true;}
function trainHistory(symbol){if(!prefs.learning)return;const bars=state.bars.get(symbol)||[];
 // Usa só candles fechados, nunca o candle em formação. Limite intencional por ativo.
 for(let i=Math.max(66,bars.length-28);i<bars.length;i++){
  const next=bars[i],features=E.buildFeatures(bars.slice(0,i)),vec=L.vector(features);
  if(vec&&next.close!==next.open)state.model.train(vec,next.close>next.open?1:0,{symbol,time:next.t,source:'historical'});
 }}
async function seedUniverse(gen){const symbols=await getUniverse(gen);state.universe=symbols;setMessage(`Baixando velas fechadas de ${symbols.length} ativos...`);
 let pointer=0,done=0,errors=0;const workers=Array.from({length:Math.min(7,symbols.length)},async()=>{
 while(state.run&&gen===state.generation){const i=pointer++;if(i>=symbols.length)break;
 try{const ok=await loadBars(symbols[i],gen);if(ok)trainHistory(symbols[i]);else errors++;}catch{errors++;}
 done++;state.loadCount=done;setProgress(Math.round(100*done/symbols.length));if(done%8===0||done===symbols.length){setMessage(`Preparando análise: ${done}/${symbols.length} ativos; ${state.bars.size} prontos${errors?' • '+errors+' indisponíveis':''}`);refreshStats();}
 await sleep(30);
 }});await Promise.all(workers);if(gen!==state.generation)return;
 if(state.bars.size<1)throw Error('Não foi possível carregar histórico suficiente. Verifique internet, acesso da Binance e permissões do navegador.');
 state.universe=state.universe.filter(s=>state.bars.has(s));save();}
function currentSnapshot(symbol,includePartial,slot){const bars=state.bars.get(symbol);if(!bars||bars.length<170)return null;
 if(!includePartial)return E.buildFeatures(bars);
 const k=state.forming.get(symbol);if(!k||k.t!==slot||now()-(state.fresh.get(symbol)||0)>20000)return null;
 return E.buildFeatures([...bars.filter(b=>b.t<slot),k]);}
function candidateFor(symbol,target,stage){const slot=target-FIVE;const ready=state.bars.get(symbol);
 if(!ready)return null;
 if(stage==='final'&&ready.at(-1)?.t!==slot)return null;
 if(stage==='pre'&&ready.at(-1)?.t!==slot-FIVE)return null;
 const features=currentSnapshot(symbol,stage==='pre',slot);if(!features)return null;
 const signal=A.decide(stage==='pre'?[...ready.filter(b=>b.t<slot),state.forming.get(symbol)].filter(Boolean):ready,Number(prefs.threshold));if(!signal||signal.side==='AGUARDAR')return null;
 const vec=L.vector(features);let ml=null;
 if(state.model.live>=100&&state.evaluated>=30&&vec){const p=state.model.probability(vec);ml=signal.side==='COMPRA'?p:1-p;
 // Modelo não calibrado: usado somente como veto suave quando contradiz muito os filtros.
 if(ml!==null&&ml<.38)return null;}
 return {symbol,side:signal.side,score:signal.score,reasons:signal.reasons,regime:signal.regime,strategy:signal.strategy,indicators:signal.indicators,features:signal.features,time:target,vector:vec,ml};}
function scan(target,stage){const candidates=[];
 for(const symbol of state.universe){const s=candidateFor(symbol,target,stage);if(s)candidates.push(s);}
 return candidates.sort((a,b)=>b.score-a.score+(Number(b.ml||0)-Number(a.ml||0))*12).slice(0,stage==='pre'?5:3);}
function doPreview(target){state.preSlot=target;state.previews=scan(target,'pre');renderPreviews();
 if(!state.previews.length){$('preStatus').textContent=`${brTime(now())}: nenhum candidato confiável para ${brTime(target)}.`;return;}
 const s=state.previews[0];const id=`${MODE}:pre:${s.symbol}:${target}:${s.side}`;
 if(!state.preAlerts.some(x=>x.id===id)){
  state.preAlerts.push({id,symbol:s.symbol,side:s.side,score:s.score,time:target,issuedAt:now(),status:'AGUARDANDO'});
  state.preAlerts=state.preAlerts.slice(-500);save();renderDetailedStats();
 }
 const text=`${s.symbol.replace('USDT','')}/USDT • ${s.side} • nota ${s.score}/100. Abertura ${brTime(target)}. Requer confirmação.`;
 $('preStatus').textContent=`Pré-alerta enviado • ${brTime(now())} • abertura ${brTime(target)} • ${state.previews.length} candidato(s).`;
 setHero(s.side==='COMPRA'?'buy':'sell',`PRÉ-ALERTA • ${s.side}`,`${s.symbol.replace('USDT','')}/USDT — preparar para ${brTime(target)}`,`Provisório; indicadores recalculados na abertura. Nota ${s.score}/100.`,s.side==='COMPRA'?'▲':'▼');
 alertUser('Radar M5: pré-alerta provisório',text);}
async function doConfirm(target,gen){state.confirmedSlot=target;const deadline=target+9000;await sleep(1350);
 while(state.run&&gen===state.generation&&now()<deadline){const sufficient=state.universe.filter(s=>state.bars.get(s)?.at(-1)?.t===target-FIVE).length;
 if(sufficient>=Math.min(5,state.universe.length)||now()>target+5600)break;await sleep(500);}
 if(!state.run||gen!==state.generation||now()>target+10000)return;
 const results=scan(target,'final');markPreAlerts(target,results);state.signals=results;state.previews=[];renderPreviews();$('preStatus').textContent='Pré-alerta encerrado. A decisão final é baseada no último candle fechado.';renderSignals();
 if(!results.length){save();setHero('neutral','AGUARDANDO',`Nenhum sinal técnico válido em ${brTime(target)}.`,'Não houve entrada sugerida; próximo ciclo em 5 minutos.');return;}
 for(const s of results){const id=`${MODE}:${s.symbol}:${target}:${s.side}`;
 if(state.alertSeen.has(id)||state.pending.some(p=>p.id===id)||state.history.some(p=>p.id===id))continue;
 state.alertSeen.add(id);state.pending.push({...s,id,status:'PENDENTE',notified:s===results[0]});state.alertCount++;}
 const best=results[0];setHero(best.side==='COMPRA'?'buy':'sell',`${best.side} • ${best.symbol.replace('USDT','')}/USDT`,`Vela M5 abriu ${brTime(target)} • nota técnica ${best.score}/100`,`${best.strategy||'Estratégia'}: `+best.reasons.join(' · '),best.side==='COMPRA'?'▲':'▼');
 alertUser(`Radar M5: ${best.side}`,`${best.symbol.replace('USDT','')}/USDT na abertura ${brTime(target)}. Pontuação ${best.score} de 100.`);
 save();refreshStats();}
function onClosed(symbol,k){let bars=state.bars.get(symbol);if(!bars)return;
 const last=bars.at(-1);
 if(last&&k.t<last.t)return;
 if(last&&k.t===last.t)bars[bars.length-1]=k;else bars.push(k);
 if(bars.length>225)bars.splice(0,bars.length-225);
 state.fresh.set(symbol,now());state.lastData=now();
 if(prefs.learning&&(!last||k.t>last.t)){
   const f=E.buildFeatures(bars.slice(0,-1)),v=L.vector(f);
   if(v&&k.close!==k.open)state.model.train(v,k.close>k.open?1:0,{symbol,time:k.t,source:'live'});
 }
 let resolved=false;for(const p of state.pending){if(p.symbol===symbol&&p.time===k.t&&p.status==='PENDENTE'){
  resolved=true;finishSignal(p,k);
 }}
 state.pending=state.pending.filter(p=>!(p.symbol===symbol&&p.time===k.t&&p.status==='PENDENTE'));
 if(state.history.length>1200)state.history.splice(0,state.history.length-1200);
 if(resolved || now()-state.lastTrainingSave>12000){save();state.lastTrainingSave=now();renderHistory();refreshStats();if(resolved)renderDetailedStats();}
}
function websocketFor(chunk,gen){const streams=chunk.map(s=>s.toLowerCase()+'@kline_5m').join('/');let closedByUser=false,ws=null,attempts=0;
 const holder={close(){closedByUser=true;try{ws?.close(1000,'Stop')}catch{}}};
 function connect(){if(!state.run||gen!==state.generation||closedByUser)return;
   try{ws=new WebSocket(`wss://data-stream.binance.vision/stream?streams=${streams}`);}catch{retry();return;}
   ws.onopen=()=>{attempts=0;state.socketCount++;if(state.run)status('on','Ao vivo');};
   ws.onmessage=e=>{if(!state.run||gen!==state.generation)return;try{const raw=JSON.parse(e.data),d=raw.data||raw;if(d.e!=='kline'||!d.k)return;const s=d.s,k=d.k;if(!state.bars.has(s))return;
     const bar={t:Number(k.t),open:Number(k.o),high:Number(k.h),low:Number(k.l),close:Number(k.c),volume:Number(k.v),takerBuy:Number(k.V||0)};
     state.lastData=now();state.fresh.set(s,now());if(k.x){state.forming.delete(s);onClosed(s,bar);}else state.forming.set(s,bar);
   }catch{}};
   ws.onerror=()=>{try{ws.close()}catch{}};
   ws.onclose=()=>{state.socketCount=Math.max(0,state.socketCount-1);if(state.run&&!closedByUser&&gen===state.generation){status('loading','Reconectando');retry();}};
 }
 function retry(){const delay=Math.min(30000,1400*Math.pow(1.7,attempts++));setTimeout(connect,delay);}
 connect();return holder;}
function openSockets(gen){for(let i=0;i<state.universe.length;i+=45)state.sockets.push(websocketFor(state.universe.slice(i,i+45),gen));}
function setButtons(running){$('startBtn').disabled=running;$('stopBtn').disabled=!running;}
function stop(silent=false){state.run=false;state.generation++;state.loading=false;state.sockets.forEach(s=>s.close());state.sockets=[];state.socketCount=0;setButtons(false);status('off','Desligado');if(!silent)setMessage('Scanner parado. O aprendizado foi salvo.');save();}
async function start(){if(state.run)return;state.run=true;state.loading=true;const gen=++state.generation;
 state.bars.clear();state.forming.clear();state.fresh.clear();state.universe=[];state.previews=[];state.signals=[];state.preSlot=0;state.confirmedSlot=0;state.alertCount=0;state.loadCount=0;state.lastData=0;state.lastVisible=now();
 setButtons(true);status('loading','Carregando');setProgress(0);setMessage('Validando lista Safirion informada • dados de referência Binance...');setHero('neutral','CARREGANDO','Carregando candles de referência Binance para os símbolos permitidos.','Os alertas começarão quando o mercado estiver sincronizado.');
 try{await seedUniverse(gen);if(!state.run||gen!==state.generation)return;openSockets(gen);state.loading=false;status('on','Ao vivo');setProgress(100);
  setMessage(`Monitorando ${state.universe.length} ativos da lista informada, com PREÇOS DE REFERÊNCIA da Binance, não da Safirion. Pré-alerta ${prefs.lead}s antes. Deixe a aba aberta.`);
  finalizePreviousPending();refreshStats();renderDetailedStats();save();
 }catch(e){if(gen!==state.generation)return;stop(true);setProgress(0);setMessage('Falha ao conectar: '+String(e.message||e)+'. Tente 50 ativos ou outra rede.','error');setHero('neutral','SEM CONEXÃO','Não há sinais sem dados recentes.','Verifique se a Binance é acessível pela sua rede.');}}
function tick(){updateClock();renderSignals();if(!state.run||state.loading)return;
 const t=now(),current=Math.floor(t/FIVE)*FIVE,next=current+FIVE,lead=Number(prefs.lead)*1000;
 if(t-state.lastData>60000&&state.lastData){status('loading','Dados parados');setMessage('Dados sem atualização recente; verificando conexão. Não emitir sinais sem velas recentes.','error');return;}
 if(t>=next-lead&&t<next-lead+15000&&state.preSlot!==next){doPreview(next);}
 // Nunca apresentar sinal antigo se o navegador retomou tardiamente.
 if(t>=current+900&&t<=current+7300&&state.confirmedSlot!==current&&state.lastData&&t-state.lastData<15000){doConfirm(current,state.generation);}
}
function prefsSave(){prefs.allowedText=$('safirionAssets').value;prefs.threshold=$('threshold').value;prefs.lead=$('lead').value;prefs.learning=$('learningToggle').checked;prefs.sound=$('sound').checked;prefs.voice=$('voice').checked;prefs.notify=$('notify').checked;save();updateClock();
 }
$('safirionAssets').addEventListener('input',()=>{refreshSafirionList();});
$('saveAssets').addEventListener('click',()=>{prefsSave();refreshSafirionList();setMessage('Lista informada salva localmente. Reinicie o Radar para aplicar. Ativos não listados não serão analisados.');});
$('threshold').addEventListener('change',prefsSave);$('lead').addEventListener('change',prefsSave);
for(const id of ['learningToggle','sound','voice','notify'])$(id).addEventListener('change',prefsSave);
$('startBtn').addEventListener('click',start);$('stopBtn').addEventListener('click',()=>stop());
$('testBtn').addEventListener('click',()=>{alertUser('Radar M5: teste de aviso','Este é apenas um teste. Não existe entrada recomendada.');setMessage('Aviso de teste emitido (som/notificação dependem das permissões do dispositivo).');});
$('permissionBtn').addEventListener('click',async()=>{if(!('Notification' in window)){setMessage('O navegador não oferece notificações neste contexto.','error');return;}
 if(!window.isSecureContext){setMessage('Notificações requerem HTTPS. Publique no GitHub Pages e abra pelo Chrome.','error');return;}
 try{const p=await Notification.requestPermission();setMessage(p==='granted'?'Notificações permitidas. Mantenha a página aberta para receber os avisos.':`Permissão: ${p}. Use som e alertas na própria página.`);}catch(e){setMessage('Falha ao pedir permissão: '+e.message,'error');}});
$('statsPeriod').addEventListener('change',renderDetailedStats);
$('statsScope').addEventListener('change',renderDetailedStats);
$('statsCsv').addEventListener('click',()=>{const blob=new Blob([S.csv(state.history)],{type:'text/csv;charset=utf-8;'});const u=URL.createObjectURL(blob);const link=document.createElement('a');link.href=u;link.download='Radar_M5_resultados_'+new Date().toISOString().slice(0,10)+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(u),3000);});
$('exportBtn').addEventListener('click',()=>{const data=JSON.stringify({exportedAt:new Date().toISOString(),source:'Binance SPOT USDT referência; catálogo Safirion manual',...restore()},null,2);const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));link.download='Radar_M5_memoria_'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),2000);});
$('clearHistory').addEventListener('click',()=>{if(!confirm('Apagar histórico e aprendizado deste navegador? Esta ação não tem volta sem backup.'))return;
 state.model=new L.OnlineModel();state.history=[];state.preAlerts=[];state.pending=[];state.evaluated=0;state.correct=0;save();refreshStats();renderHistory();renderDetailedStats();setMessage('Histórico e aprendizado locais apagados.');});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.beforeInstallPrompt=e;$('installBtn').hidden=false;});
$('installBtn').addEventListener('click',async()=>{if(!state.beforeInstallPrompt)return;state.beforeInstallPrompt.prompt();await state.beforeInstallPrompt.userChoice;state.beforeInstallPrompt=null;$('installBtn').hidden=true;});
window.addEventListener('pagehide',()=>save());
document.addEventListener('visibilitychange',()=>{if(document.hidden){state.lastVisible=now();if(state.run)setMessage('Em segundo plano: Android pode suspender a coleta. Retorne ao radar para garantir sinais atuais.');}
 else if(state.run){const slept=now()-state.lastVisible;if(slept>30000){setMessage('O radar ficou em segundo plano. Reconecte para atualizar o histórico antes de novos sinais.','error');stop(true);status('off','Reinicie');setMessage('Dados podem estar defasados. Pressione Iniciar radar para ressincronizar.','error');}else setMessage('Radar visível novamente.');}});
if('serviceWorker' in navigator&&location.protocol!=='file:'&&window.isSecureContext)navigator.serviceWorker.register('./sw.js').catch(()=>{});
refreshSafirionList();setInterval(tick,1000);updateClock();refreshStats();renderHistory();renderDetailedStats();renderPreviews();renderSignals();
if(state.pending.length)setMessage('Existem previsões pendentes de uma sessão antiga; elas não serão consideradas sem o dado de encerramento.');
})();
