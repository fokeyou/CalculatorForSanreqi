import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import { initSession } from "./session";
import "./style.css";

const app = createApp(App);
app.use(router);
app.mount("#app");

initSession();

// Service Worker：仅安全上下文（https / localhost）下注册；sw.js 位于部署根目录
if ("serviceWorker" in navigator && window.isSecureContext) {
  try {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
  } catch (e) {}
}
