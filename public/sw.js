const CACHE_VERSION = "v1";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.json",
  "/favicon.ico",
  "/pwa-icon-192.svg",
  "/pwa-icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
              .map((key) => caches.delete(key))
          )
        ),
      self.clients.claim(),
    ])
  );
});

function isApiRequest(requestUrl) {
  const url = new URL(requestUrl);
  if (url.origin !== self.location.origin) return true;
  return (
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/rest/v1/") ||
    url.pathname.startsWith("/auth/v1/") ||
    url.pathname.startsWith("/functions/v1/")
  );
}

function hasRangeHeader(request) {
  try {
    return request.headers.has("range");
  } catch {
    return false;
  }
}

function isMediaRequest(url, request) {
  const dest = request.destination;
  if (dest === "video" || dest === "audio") return true;
  return (
    url.pathname.endsWith(".mp4") ||
    url.pathname.endsWith(".webm") ||
    url.pathname.endsWith(".mov") ||
    url.pathname.endsWith(".mkv") ||
    url.pathname.endsWith(".avi") ||
    url.pathname.endsWith(".mp3") ||
    url.pathname.endsWith(".wav") ||
    url.pathname.endsWith(".ogg") ||
    url.pathname.endsWith(".m4a")
  );
}

function isStaticAssetRequest(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/assets/") ||
      url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".png") ||
      url.pathname.endsWith(".jpg") ||
      url.pathname.endsWith(".jpeg") ||
      url.pathname.endsWith(".webp") ||
      url.pathname.endsWith(".svg") ||
      url.pathname.endsWith(".ico") ||
      url.pathname.endsWith(".woff") ||
      url.pathname.endsWith(".woff2") ||
      url.pathname.endsWith(".ttf") ||
      url.pathname.endsWith(".otf") ||
      url.pathname.endsWith(".eot") ||
      url.pathname.endsWith(".json") ||
      url.pathname.endsWith(".txt"))
  );
}

function isCacheableResponse(response) {
  return !!response && response.status === 200;
}

function shouldSkipCaching(request, url, response) {
  if (hasRangeHeader(request)) return true;
  if (response && response.status === 206) return true;
  if (isMediaRequest(url, request)) return true;
  if (!isCacheableResponse(response)) return true;
  return false;
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    const url = new URL(request.url);

    if (!shouldSkipCaching(request, url, response)) {
      const cache = await caches.open(RUNTIME_CACHE);
      try {
        await cache.put(request, response.clone());
      } catch {
        // Ignore cache write errors (e.g., unsupported partial responses)
      }
    }

    return response;
  } catch {
    const fallbackCached = await caches.match(request);
    if (fallbackCached) return fallbackCached;
    return new Response("", { status: 503, statusText: "Offline" });
  }
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);

    const url = new URL(request.url);
    if (!shouldSkipCaching(request, url, response)) {
      try {
        await cache.put(request, response.clone());
      } catch {
        // Ignore cache write errors
      }
    }

    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return null;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (hasRangeHeader(request) || isMediaRequest(url, request)) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response("", { status: 503, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const response = await networkFirst(request);
        if (response) return response;

        const cached = await caches.match(request);
        if (cached) return cached;

        const cachedAppShell = await caches.match("/");
        if (cachedAppShell) return cachedAppShell;

        return caches.match("/offline.html");
      })()
    );
    return;
  }

  if (isApiRequest(request.url)) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response("", { status: 503, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  if (isStaticAssetRequest(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response("", { status: 503, statusText: "Offline" });
      }
    })()
  );
});
