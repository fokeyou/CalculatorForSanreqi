/* 暖气片销售利润计算器（Vue 版）— Service Worker
   策略：导航请求网络优先（离线回退缓存页），静态资源缓存优先 + 后台更新。
   注意：构建产物文件名带 hash，无法预先枚举，故运行时按请求逐个缓存。 */
const CACHE = "radiator-profit-vue-v27";
const CORE = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // CDN 等跨域请求交给浏览器

  // 页面导航：网络优先，失败回退缓存的 index.html（SPA 离线可打开）
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put("./index.html", copy));
        return res;
      }).catch(() =>
        caches.match("./index.html").then(r => r || caches.match("./"))
      )
    );
    return;
  }

  // 静态资源：缓存优先 + 后台更新（stale-while-revalidate）
  e.respondWith(
    caches.match(req).then(cached => {
      const fetchP = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchP;
    })
  );
});
