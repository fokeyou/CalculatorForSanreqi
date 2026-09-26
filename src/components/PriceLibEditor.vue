<script setup>
/* 价格库编辑器 —— 单文件版 libOverlay 的 Vue 化（计算器与后台管理共用）
   编辑在草稿上进行，「保存」才生效（含品牌定位兜底与规格片数迁移） */
import { ref, watch } from "vue";
import { CATS, defaultLib, clamp } from "../defaults.js";
import { store, brands, curSpecs, applyLib } from "../store.js";

const props = defineProps({ active: Boolean });
const emit = defineEmits(["close", "saved"]);

const draft = ref(defaultLib());
const curCat = ref("radiator");
const curBrandIdx = ref(0);
const oldSnap = ref(null);

function init() {
  draft.value = JSON.parse(JSON.stringify(store.lib));
  curCat.value = "radiator";
  curBrandIdx.value = clamp(store.sel.brand, (draft.value.radiator || []).length);
  const bi = clamp(store.sel.brand, brands.value.length);
  const ob = brands.value[bi];
  // 记录索引（改名也能正确定位）+ 旧名（删除时的兜底）+ 旧规格名（用于迁移已填片数）
  oldSnap.value = {
    brandIdx: bi,
    brandName: ob ? ob.name : "",
    specNames: ob ? (ob.specs || []).map(s => s.name) : []
  };
}
watch(() => props.active, v => { if (v) init(); }, { immediate: true });

const isRad = () => curCat.value === "radiator";
const isDel = () => curCat.value === "delivery";
const tipText = () => isRad()
  ? "暖气片按「品牌 → 中心距规格」两级配置：上方品牌标签可直接点击改名，用「＋ 新增品牌」增加品牌，再为该品牌下的每个规格设定售价与进价（元/片）。房间中每填一种规格即算一组。"
  : isDel()
    ? "配送费为统一一口价（默认成本 60 元），不随楼层变化，取本分类第 1 条记录计价。配送费不计入报价合计与销售总额，仅当楼层为 2 层及以上时计入成本（1 层与留空不计）；不在报价单明细中列示，但影响总成本、利润与单号。"
    : "提示：名称、售价、进价均可自由修改；切换分类可分别为管子、阀门、材料、打孔、安装设置不同品牌与价格。";

const curList = () => {
  if (isRad()) {
    curBrandIdx.value = clamp(curBrandIdx.value, (draft.value.radiator || []).length);
    const b = (draft.value.radiator || [])[curBrandIdx.value];
    return b ? (b.specs || []) : [];
  }
  return draft.value[curCat.value] || [];
};

function addEntry() {
  const list = curList();
  list.push({ name: isRad() ? "新增规格" : "新增规格 " + (list.length + 1), price: 0, cost: 0 });
}
function delEntry(idx) { curList().splice(idx, 1); }
function addBrand() {
  if (!Array.isArray(draft.value.radiator)) draft.value.radiator = [];
  draft.value.radiator.push({ name: "新品牌 " + (draft.value.radiator.length + 1), specs: [{ name: "600mm", price: 0, cost: 0 }] });
  curBrandIdx.value = draft.value.radiator.length - 1;
}
function delBrand(idx) {
  if (!Array.isArray(draft.value.radiator) || draft.value.radiator.length <= 1) return;
  draft.value.radiator.splice(idx, 1);
  curBrandIdx.value = clamp(curBrandIdx.value, draft.value.radiator.length);
}
function resetLib() {
  draft.value = defaultLib();
  curBrandIdx.value = 0;
}
function saveLib() {
  applyLib(draft.value, oldSnap.value);
  emit("saved");   // 只发 saved，由父级决定是否关闭（避免 close 提示覆盖保存提示）
}
</script>

<template>
  <div class="tabs">
    <button v-for="c in CATS" :key="c.key" type="button" class="tab" :class="{ active: curCat === c.key }" @click="curCat = c.key">{{ c.name }}</button>
  </div>

  <div v-if="isRad()" class="subtabs">
    <span v-for="(b, i) in draft.radiator" :key="i" class="subtab" :class="{ active: i === curBrandIdx }">
      <input type="text" v-model="b.name" placeholder="品牌名" title="可直接输入修改品牌名称" @focus="curBrandIdx = i" @keyup.enter="e => e.target.blur()">
      <span v-if="draft.radiator.length > 1" class="x" title="删除品牌" @click.stop="delBrand(i)">✕</span>
    </span>
    <span class="subtab add" title="新增一个品牌（新增后可直接编辑品牌名）" @click="addBrand">＋ 新增品牌</span>
    <span class="hint-inline">（点击品牌名可直接修改，回车/失焦即生效）</span>
  </div>

  <div class="lib-wrap">
    <table class="lib">
      <thead>
        <tr>
          <th style="width:38%">{{ isRad() ? "中心距规格名称" : "品牌 / 规格名称" }}</th>
          <th style="width:22%">售价（向客户收）</th>
          <th style="width:22%">进价（我方成本）</th>
          <th style="width:10%">单位</th>
          <th style="width:8%"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="curList().length === 0">
          <td colspan="5" class="hint-bar" style="text-align:left;padding:12px 0;">{{ isRad() ? "暂无品牌，请点击「＋ 新增品牌」添加" : "该分类暂无条目，请点击下方「新增」" }}</td>
        </tr>
        <tr v-for="(en, idx) in curList()" :key="idx">
          <td><input type="text" v-model="en.name" :placeholder="isRad() ? '如 600mm' : '品牌 / 规格名称'"></td>
          <td><input type="number" class="num-in" min="0" step="0.01" v-model.number="en.price"></td>
          <td><input type="number" class="num-in" min="0" step="0.01" v-model.number="en.cost"></td>
          <td class="unit">元 / {{ CATS.find(c => c.key === curCat).unit }}</td>
          <td><button class="del" title="删除" @click="delEntry(idx)">✕</button></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
    <button class="btn-add" style="margin-top:0;" @click="addEntry">＋ 新增{{ isRad() ? "规格" : "品牌 / 规格" }}</button>
  </div>

  <div class="admin-note">{{ tipText() }}</div>

  <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
    <button class="btn-primary" @click="saveLib">保存价格库</button>
    <button class="btn-ghost" @click="resetLib">清空价格库</button>
    <button class="btn-ghost" @click="emit('close')">取消</button>
  </div>
</template>
