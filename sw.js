const CACHE = 'tropikind-camera-v18';
const CORE = ['./', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './maskable-512.png'];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(CORE); }).catch(function(){}));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){ if(k!==CACHE) return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  // Refresh app documents online; retain the cached app for offline use.
  var url = new URL(e.request.url);
  if(url.origin === self.location.origin &&
     (e.request.mode === 'navigate' || url.pathname === new URL('./index.html', self.registration.scope).pathname)){
    e.respondWith(fetch(e.request, {cache:'no-cache'}).then(function(res){
      if(!res.ok) throw new Error('App document unavailable');
      var copy=res.clone();
      e.waitUntil(caches.open(CACHE).then(function(c){ return c.put(e.request,copy); }).catch(function(){}));
      return res;
    }).catch(function(){
      return caches.match(e.request).then(function(cached){
        return cached || caches.match('./index.html');
      });
    }));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function(cached){
      return cached || fetch(e.request).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(e.request, copy); }).catch(function(){});
        return res;
      }).catch(function(){ return cached; });
    })
  );
});
