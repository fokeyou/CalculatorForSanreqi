<script setup>
/* 后台管理：
   ① 价格库管理：品牌/规格/各分类价格完整增删改查（保存后计算器实时生效）
   ② 报价单管理：云端报价单存档列表、载入到计算器、删除
   ③ 系统设置：配送费、云同步、清空重置
   （登录已停用；云端为共享数据空间，免登录读写） */
import { ref, onMounted } from "vue";
import { pushLib, pullLib } from "../cloud.js";
import { store, applySnapshot, currentSnapshot, resetAll } from "../store.js";
import PriceLibEditor from "../components/PriceLibEditor.vue";
import QuoteArchiveList from "../components/QuoteArchiveList.vue";

const tab = ref("lib");
const archiveRef = ref(null);
const msg = ref("");
const msgBad = ref(false);
function say(text, bad) { msg.value = text || ""; msgBad.value = !!bad; }

onMounted(() => { if (tab.value === "quotes") archiveRef.value?.refresh(); });
function switchTab(t) {
  tab.value = t;
  if (t === "quotes") archiveRef.value?.refresh();
  say("");
}

/* ---- 系统设置：云同步（免登录，共享空间） ---- */
async function doPushLib() {
  say("正在保存价格库到云端…");
  try { await pushLib(currentSnapshot()); say("价格库已保存到云端"); }
  catch (e) { say(e.message || "保存失败", true); }
}
async function doPullLib() {
  say("正在从云端读取…");
  try {
    const { payload, time } = await pullLib();
    applySnapshot(payload);
    say("已从云端恢复价格库" + (time ? "（" + time + "）" : ""));
  } catch (e) { say(e.message || "读取失败", true); }
}

/* ---- 配送费快捷设置 ---- */
function setDeliveryPrice(e) {
  if (!Array.isArray(store.lib.delivery) || store.lib.delivery.length === 0) {
    store.lib.delivery = [{ name: "配送费（统一价）", price: +e.target.value || 0, cost: 0 }];
  } else {
    store.lib.delivery[0].price = +e.target.value || 0;
  }
}
function setDeliveryCost(e) {
  if (!Array.isArray(store.lib.delivery) || store.lib.delivery.length === 0) {
    store.lib.delivery = [{ name: "配送费（统一价）", price: 100, cost: +e.target.value || 0 }];
  } else {
    store.lib.delivery[0].cost = +e.target.value || 0;
  }
}
const deliveryPrice = () => (store.lib.delivery && store.lib.delivery[0] ? store.lib.delivery[0].price : 0);
const deliveryCost = () => (store.lib.delivery && store.lib.delivery[0] ? store.lib.delivery[0].cost : 0);

function doReset() {
  if (window.confirm("将清空本机的房间、选择与赠送设置，并清空价格库（云端仍保留已保存的价格库，可用「从云端恢复」取回）。确定继续？")) {
    resetAll();
    say("已清空本机数据");
  }
}
</script>

<template>
  <div class="admin-tabs">
    <button :class="{ active: tab === 'lib' }" @click="switchTab('lib')">⚙ 价格库管理</button>
    <button :class="{ active: tab === 'quotes' }" @click="switchTab('quotes')">📄 报价单管理</button>
    <button :class="{ active: tab === 'settings' }" @click="switchTab('settings')">🛠 系统设置</button>
  </div>

  <div v-if="msg" class="cloud-msg" :class="{ bad: msgBad }" style="margin-left:0;display:block;margin-bottom:10px;">{{ msg }}</div>

  <!-- ① 价格库管理 -->
  <div v-if="tab === 'lib'" class="card">
    <h2><span class="dot"></span>价格库管理<span class="spacer"></span>
      <span class="cloud-user on">保存后计算器实时生效</span>
    </h2>
    <PriceLibEditor :active="true" @saved="say('价格库已保存，计算器已实时生效')" />
  </div>

  <!-- ② 报价单管理 -->
  <div v-else-if="tab === 'quotes'" class="card">
    <h2><span class="dot"></span>报价单管理</h2>
    <div class="admin-note">「载入」会把该存档应用到计算器（切换到「计算器」页即可查看）；删除不可恢复。</div>
    <div style="margin-top:10px;">
      <QuoteArchiveList ref="archiveRef" />
    </div>
  </div>

  <!-- ③ 系统设置 -->
  <div v-else class="card">
    <h2><span class="dot"></span>系统设置</h2>

    <div class="settings-row">
      <label>配送费 · 内部成本（元/次）</label>
      <input type="number" min="0" step="0.01" :value="deliveryCost()" @change="setDeliveryCost">
      <span class="admin-note" style="margin-top:0;">我方每单配送的实际成本（配送费不计入报价合计）</span>
    </div>
    <div class="settings-row">
      <label>配送费计费条件</label>
      <span class="admin-note" style="margin-top:0;">报价单抬头「楼层」填写 2 层及以上时，配送费计入成本；1 层与留空均不计。配送费不计入报价合计，不计入销售总额，但影响总成本、利润与单号。</span>
    </div>

    <div class="settings-row" style="margin-top:10px;">
      <label>云同步</label>
      <button class="btn-ghost" @click="doPushLib">↑ 保存价格库到云端</button>
      <button class="btn-ghost" @click="doPullLib">↓ 从云端恢复价格库</button>
      <span class="admin-note" style="margin-top:0;">免登录共享空间：所有设备读写同一份云端数据</span>
    </div>

    <div class="settings-row">
      <label>清空重置</label>
      <button class="btn-mini danger" @click="doReset">清空本机数据</button>
      <span class="admin-note" style="margin-top:0;">清空本机房间/选择/赠送与价格库（云端数据不受影响）</span>
    </div>
  </div>
</template>
