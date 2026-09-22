const CACHE = 'tropikind-camera-v7';
const CORE = ['./', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './maskable-512.png'];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(CORE); })
      .catch(function(){})
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys()
      .then(function(keys){
        return Promise.all(
          keys.map(function(k){
            if(k !== CACHE) return caches.delete(k);
          })
        );
      })
      .then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;

  var req = e.request;
  var url = new URL(req.url);
  var isAppShell =
    req.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html');

  // Network-first for the app shell so deployed updates appear quickly.
  if(isAppShell){
    e.respondWith(
      fetch(req)
        .then(function(res){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); }).catch(function(){});
          return res;
        })
        .catch(function(){
          return caches.match(req).then(function(cached){
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // Cache-first for static assets.
  e.respondWith(
    caches.match(req).then(function(cached){
      return cached || fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); }).catch(function(){});
        return res;
      });
    })
  );
});
