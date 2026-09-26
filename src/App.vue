<script setup>
import { onMounted } from "vue";
import InstallBar from "./components/InstallBar.vue";
import { pullLib } from "./cloud.js";
import { applyLibOnly } from "./store.js";

/* 启动自动从云端读取价格库（云端为共享数据空间，云端优先；
   云端暂无数据或网络不可用时静默降级为本机缓存） */
onMounted(async () => {
  try {
    const { payload, time } = await pullLib();
    if (applyLibOnly(payload)) {
      window.dispatchEvent(new CustomEvent("lib-cloud-loaded", { detail: { time } }));
    }
  } catch (e) { /* 静默：无云端数据 / 离线，继续用本机数据 */ }
});
</script>

<template>
  <div class="container">
    <InstallBar />
    <header class="app-head">
      <h1><span class="icon">🔥</span>暖气片销售利润计算器</h1>
      <div class="formula">
        组数 = 填了片数的房间数（一个房间 1 组）｜ 阀门 = 组数 × 2 ｜ 赠送项不计报价、成本照计 ｜ 配送费不计入报价合计，楼层 2 层及以上计入成本
      </div>
    </header>

    <nav class="topnav">
      <router-link to="/">🧮 计算器</router-link>
      <router-link to="/admin">🗂 后台管理</router-link>
    </nav>

    <router-view />

    <footer style="text-align:center;color:#a5aebc;font-size:12px;margin-top:10px;">
      价格库自动从云端读取（共享数据空间，免登录）；修改后请点「保存价格库到云端」同步给所有设备
    </footer>
  </div>
</template>
