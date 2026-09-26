<script setup>
import { ref, onMounted, onUnmounted } from "vue";

const show = ref(false);
const canInstall = ref(false);
let deferred = null;
const KEY = "radiator_pwa_install_dismissed";

function dismissed() { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } }
const standalone = () =>
  (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;

function onBip(e) {
  e.preventDefault();
  deferred = e;
  canInstall.value = true;
  if (!dismissed()) show.value = true;
}
function onInstalled() { show.value = false; canInstall.value = false; deferred = null; }

onMounted(() => {
  window.addEventListener("beforeinstallprompt", onBip);
  window.addEventListener("appinstalled", onInstalled);
  if (!standalone() && !dismissed()) show.value = true;
});
onUnmounted(() => {
  window.removeEventListener("beforeinstallprompt", onBip);
  window.removeEventListener("appinstalled", onInstalled);
});

async function install() {
  if (!deferred) return;
  deferred.prompt();
  await deferred.userChoice;
  deferred = null; canInstall.value = false; show.value = false;
}
function dismiss() {
  try { localStorage.setItem(KEY, "1"); } catch (e) {}
  show.value = false;
}
</script>

<template>
  <div class="install-bar" :class="{ show }">
    <div class="txt">
      <b>📲 安装到手机桌面</b>
      <span>安装后可全屏使用、离线打开，数据仍保存在本机</span>
    </div>
    <button v-if="canInstall" class="btn-primary" @click="install">立即安装</button>
    <button class="close-x" title="不再提示" @click="dismiss">✕</button>
  </div>
</template>
