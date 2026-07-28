/*
  LeiteFácil — Service Worker
  Estratégia: "network-first" para o app (sempre busca a versão mais nova
  quando há internet) com fallback para o cache quando estiver offline.
  Isso garante que o produtor sempre veja a versão mais atual do app quando
  conectado, mas ainda consiga abrir o app no curral sem sinal.

  IMPORTANTE: sempre que uma nova versão do index.html for publicada,
  aumente o número de CACHE_NAME abaixo (ex.: 'leitefacil-v2') para que os
  celulares dos produtores substituam o cache antigo automaticamente.
*/

const CACHE_NAME = 'leitefacil-v3';

const ARQUIVOS_ESSENCIAIS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', (evento) => {
  self.skipWaiting();
  evento.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ARQUIVOS_ESSENCIAIS))
      .catch(() => {}) // se algum arquivo não existir ainda, não trava a instalação
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes
          .filter((nome) => nome !== CACHE_NAME)
          .map((nome) => caches.delete(nome))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;

  // Só cuidamos de requisições GET.
  if (requisicao.method !== 'GET') return;

  // Nunca interceptar chamadas ao Supabase (login, dados, etc.) nem a
  // serviços externos — essas sempre precisam ir direto para a rede.
  const url = requisicao.url;
  if (
    url.includes('supabase.co') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com')
  ) {
    return;
  }

  evento.respondWith(
    fetch(requisicao)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(requisicao, copia));
        return resposta;
      })
      .catch(() =>
        caches.match(requisicao).then((respostaCache) =>
          respostaCache || caches.match('./index.html')
        )
      )
  );
});

// Recebe uma notificação push enviada pelo servidor (Edge Function) e exibe
// na tela do celular, mesmo com o app fechado.
self.addEventListener('push', (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch (e) {
    dados = { title: 'LeiteFácil', body: evento.data ? evento.data.text() : '' };
  }

  const titulo = dados.title || 'LeiteFácil';
  const opcoes = {
    body: dados.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: dados.url || './index.html' }
  };

  evento.waitUntil(self.registration.showNotification(titulo, opcoes));
});

// Quando a pessoa toca na notificação, abre o app (ou foca a aba já aberta).
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const urlAlvo = (evento.notification.data && evento.notification.data.url) || './index.html';

  evento.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((listaJanelas) => {
      for (const janela of listaJanelas) {
        if (janela.url.includes('index.html') && 'focus' in janela) return janela.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlAlvo);
    })
  );
});
