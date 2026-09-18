const CACHE='montenegro-shell-v1';
const BASE=new URL('./',self.location.href);
const INDEX=new URL('index.html',BASE).href;
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([BASE.href,INDEX])).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('montenegro-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==BASE.origin||event.request.mode!=='navigate'||![BASE.pathname,new URL(INDEX).pathname].includes(url.pathname))return;
  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request,{signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw new Error('Unavailable');
      const cache=await caches.open(CACHE);await cache.put(INDEX,response.clone());return response;
    }catch(e){return (await caches.match(INDEX))||Response.error();}
  })());
});
