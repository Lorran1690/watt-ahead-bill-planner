/* Voltara PWA.
 * Armazena apenas identidade visual e recursos estáticos públicos.
 * NUNCA armazena documentos privados, páginas HTML autenticadas,
 * respostas do Supabase, tokens de sessão ou dados de usuário.
 * Versão do cache alterada a cada revisão para evitar recursos antigos.
 */
const CACHE_NAME = "voltara-static-v2";
const OFFLINE_URL = "/offline.html";
const PRE_CACHE = [
  "/offline.html",
  "/voltara-mark.svg",
  "/voltara-icon-192.png",
  "/voltara-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRE_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((names) =>
        Promise.all(names.filter((name) => name.startsWith("voltara-static-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name)))
      ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // O HTML de navegação nunca é colocado em cache, pois pode conter estado do aplicativo.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const fallback = await caches.match(OFFLINE_URL);
        return fallback || Response.error();
      })
    );
    return;
  }

  // Cache somente recursos visuais públicos declarados acima; nunca
  // interceptar outras requisições do servidor de aplicação.
  if (!PRE_CACHE.includes(url.pathname)) return;
  event.respondWith(
    caches.match(request).then((cached) =>
      cached || fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
    )
  );
});

// Push contains no message content. Only open the app's own conversation route.
self.addEventListener("push",event=>{
 let data;try{data=event.data?.json()}catch{return;}
 if(data?.type!=="voltara-connect")return;
 event.waitUntil(self.registration.showNotification("Voltara Connect",{body:"Você recebeu uma nova mensagem privada.",tag:"voltara-connect",icon:"/voltara-icon-192.png",data:{type:"voltara-connect"}}));
});
self.addEventListener("notificationclick",event=>{
 if(event.notification.data?.type!=="voltara-connect")return;
 event.notification.close();
 event.waitUntil((async()=>{
 const url=new URL("/connect",self.location.origin).href;
 const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
 const existing=clients.find(c=>c.url===url);
 if(existing){await existing.focus();return;}
 await self.clients.openWindow(url);
 })());
});
