<script setup>
/* 登录页 —— 未登录访问任何功能页都会被路由守卫重定向到这里 */
import { useRoute, useRouter } from "vue-router";
import LoginForm from "../components/LoginForm.vue";
import { cloudOriginOk } from "../cloud.js";

const route = useRoute();
const router = useRouter();

function onDone() {
  const r = route.query.redirect;
  router.push(typeof r === "string" && r.startsWith("/") ? r : "/");
}
</script>

<template>
  <div class="card" style="max-width:520px;margin:0 auto;">
    <h2>
      <span class="dot"></span>登录后使用
      <span class="spacer"></span>
      <span class="cloud-user on">☁ 必须登录</span>
    </h2>
    <div v-if="!cloudOriginOk()" class="cloud-msg bad" style="margin:0 0 12px;display:block;">
      当前是本地 / 局域网地址，无法登录；请通过应用线上域名（https://radiator-profit.app.workbuddy.host）访问。
    </div>
    <LoginForm @done="onDone" />
  </div>
</template>
