<script setup>
/* 报价单云端存档列表 —— 共享数据空间（免登录）
   载入 = 应用快照到计算器；删除需确认 */
import { ref } from "vue";
import { listQuotes, loadQuoteArchive, deleteQuoteArchive, errText } from "../cloud.js";
import { applySnapshot } from "../store.js";
import { fmt } from "../defaults.js";

const rows = ref([]);
const loading = ref(false);
const loaded = ref(false);
const errMsg = ref("");

function esc(s) { return String(s == null ? "" : s); }
const fmtTime = t => t ? new Date(t).toLocaleString("zh-CN") : "";

async function refresh() {
  errMsg.value = "";
  loading.value = true;
  try {
    rows.value = await listQuotes();
    loaded.value = true;
  } catch (e) { errMsg.value = e.message || "读取失败"; }
  finally { loading.value = false; }
}

async function load(id) {
  try {
    const payload = await loadQuoteArchive(id);
    applySnapshot(payload);
    return true;
  } catch (e) { errMsg.value = e.message || "载入失败"; return false; }
}

async function del(id) {
  if (!window.confirm("确定删除这条报价单存档？删除后不可恢复。")) return;
  try {
    await deleteQuoteArchive(id);
    rows.value = rows.value.filter(r => r.id !== id);
  } catch (e) { errMsg.value = e.message || "删除失败"; }
}

defineExpose({ refresh, load });
</script>

<template>
  <div>
    <div v-if="errMsg" class="cloud-msg bad" style="margin-left:0;display:block;">{{ errMsg }}</div>

    <div v-if="!loaded && !loading" class="ql-empty">
      <button class="btn-ghost" @click="refresh">📚 读取云端存档列表</button>
    </div>

    <div v-if="loading" class="ql-empty">正在读取…</div>

    <template v-if="loaded">
      <div v-if="rows.length === 0" class="ql-empty">还没有存档的报价单</div>
      <div v-for="r in rows" :key="r.id" class="ql-row">
        <div class="ql-main">
          <b>{{ esc(r.quote_no || "—") }}</b>
          <span>{{ esc(r.customer || "未填写客户") }}</span>
          <span>{{ esc(r.quote_date || "") }}{{ fmtTime(r.created_at) ? " · " + fmtTime(r.created_at) : "" }}</span>
        </div>
        <div class="ql-num">报价 <b>{{ fmt(+r.revenue || 0) }}</b> ｜ 利润 <b>{{ fmt(+r.profit || 0) }}</b></div>
        <div class="ql-act">
          <button class="btn-mini" type="button" @click="load(r.id)">载入</button>
          <button class="btn-mini danger" type="button" @click="del(r.id)">删除</button>
        </div>
      </div>
    </template>
  </div>
</template>
