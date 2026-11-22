const CACHE = 'radarm5-shell-v3';
const CORE = ['./','./index.html','./style.css','./app.js','./engine.js','./learner.js','./stats.js','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest'];
self.addEventListener('install',evt=>evt.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',evt=>evt.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',evt=>{
  const url=new URL(evt.request.url);
  if(url.origin!==self.location.origin||evt.request.method!=='GET')return;
  evt.respondWith(fetch(evt.request).then(r=>{if(r.ok){const clone=r.clone();caches.open(CACHE).then(c=>c.put(evt.request,clone));}return r;}).catch(()=>caches.match(evt.request)));
});
