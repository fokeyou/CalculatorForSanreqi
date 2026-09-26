<script setup>
/* 计算器主视图 —— 单文件版核心功能的 Vue 化
   业务口径与单文件版 v14 完全一致（组数/阀门/材料/安装/配送费/赠送/单号） */
import { ref, computed, onMounted, onUnmounted } from "vue";
import { VIS, fmt } from "../defaults.js";
import {
  store, brands, curBrand, curSpecs, roomRows, specTotals, totalGroups,
  radStats, catLines, deliveryInfo, totals, catQty, setBrand, addRoom, delRoom,
  resetAll, applySnapshot, currentSnapshot, delRoomPair,
  isBathroom, isBacketRoom, setRoomBacket, backetGroups,
} from "../store.js";
import { pushLib, pullLib, saveQuoteArchive } from "../cloud.js";
import PriceLibEditor from "../components/PriceLibEditor.vue";
import QuoteArchiveList from "../components/QuoteArchiveList.vue";

/* ---- 品牌与规格 ---- */
function onBrandChange(e) {
  const idx = parseInt(e.target.value, 10);
  if (idx >= 0) setBrand(idx);
}

/* ---- 规格构成文案 ---- */
const specLine = computed(() => {
  const specs = curSpecs.value, tot = specTotals.value;
  const parts = [];
  specs.forEach((s, si) => {
    const n = tot[si] || 0;
    if (n > 0) parts.push({ name: s.name, n, unit: "片" });
  });
  return parts;
});
/* 房间明细的规格构成：暖气片各规格 + 背篓（按所选条目，单位个） */
const roomCompLine = computed(() => {
  const parts = specLine.value.map(p => ({ ...p }));
  backetGroups.value.forEach(g => {
    parts.push({ name: g.entry ? g.entry.name : "背篓", n: g.qty, unit: "个" });
  });
  return parts;
});

/* ---- 卫生间类型选择框（背篓选项与价格来自价格库 lib.backet） ---- */
const backetLib = computed(() => store.lib.backet || []);
function roomTypeVal(r) {
  if (!isBacketRoom(r)) return "rad";
  const len = backetLib.value.length;
  if (len === 0) return "na";
  const i = parseInt(r.backetIdx, 10) || 0;
  return String(Math.min(Math.max(i, 0), len - 1));
}
function onRoomType(r, v) {
  if (v === "rad") { setRoomBacket(r, false); return; }
  setRoomBacket(r, true);
  r.backetIdx = parseInt(v, 10) || 0;
}

/* ---- 云同步（免登录，云端为共享数据空间） ---- */
const cloudMsg = ref("价格库与报价单可一键同步到云端，所有设备共享");
const cloudBad = ref(false);
function say(text, bad) { cloudMsg.value = text || ""; cloudBad.value = !!bad; }

/* 启动时价格库已由 App.vue 自动从云端读取，这里只做提示 */
function onCloudLib(e) {
  say("价格库已从云端读取" + (e.detail && e.detail.time ? "（" + e.detail.time + "）" : ""));
}
onMounted(() => window.addEventListener("lib-cloud-loaded", onCloudLib));
onUnmounted(() => window.removeEventListener("lib-cloud-loaded", onCloudLib));

const showArchive = ref(false);
const archiveRef = ref(null);

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
async function doSaveQuote() {
  say("正在存档报价单…");
  try {
    await saveQuoteArchive({
      quoteNo: totals.value.no,
      customer: store.quote.customer || "",
      quoteDate: store.quote.date || "",
      revenue: +totals.value.revenue.toFixed(2),
      cost: +totals.value.cost.toFixed(2),
      profit: +totals.value.profit.toFixed(2),
      payload: currentSnapshot(),
    });
    say("已存档报价单 " + (totals.value.no || ""));
  } catch (e) { say(e.message || "存档失败", true); }
}
async function toggleArchive() {
  showArchive.value = !showArchive.value;
  if (showArchive.value && archiveRef.value) await archiveRef.value.refresh();
}

/* ---- 弹窗 ---- */
const showResult = ref(false);
const showLib = ref(false);

function onFloorInput(e) {
  const v = parseInt(e.target.value, 10);
  store.floor = (isNaN(v) || v < 0) ? 0 : v;
}
</script>

<template>
  <!-- 云同步 -->
  <div class="card cloud-card">
    <h2>
      <span class="dot"></span>云同步
      <span class="spacer"></span>
    </h2>
    <div class="cloud-actions">
      <button class="btn-ghost" type="button" @click="doPushLib">↑ 保存价格库到云端</button>
      <button class="btn-ghost" type="button" @click="doPullLib">↓ 从云端恢复价格库</button>
      <span class="spacer" style="flex:1"></span>
      <button class="btn-ghost" type="button" @click="toggleArchive">📚 历史报价单</button>
      <span class="cloud-msg" :class="{ bad: cloudBad }">{{ cloudMsg }}</span>
    </div>
    <div v-if="showArchive" class="ql-list">
      <QuoteArchiveList ref="archiveRef" />
    </div>
  </div>

  <!-- 房间 × 规格 -->
  <div class="card">
    <h2>
      <span class="dot"></span>房间明细（按所选品牌的中心距规格填片数）
      <span class="spacer"></span>
      <span class="pick">暖气片品牌：
        <select :value="store.sel.brand" @change="onBrandChange">
          <option v-if="brands.length === 0" :value="-1">未配置品牌</option>
          <option v-for="(b, i) in brands" :key="i" :value="i">{{ b.name }}</option>
        </select>
      </span>
    </h2>

    <div class="room-head">
      <div class="c-name">房间名称</div>
      <div class="c-pairs">规格 / 片数</div>
      <div class="c-sum">该房间报价</div>
      <div class="c-del"></div>
    </div>

    <div v-if="store.rooms.length === 0" class="hint-bar" style="text-align:left;">暂无房间，请点击「添加房间」</div>
    <div v-for="(r, i) in store.rooms" :key="i" class="room-row" :class="{ 'is-backet': isBacketRoom(r) }">
      <div class="c-name">
        <input type="text" v-model="r.name" placeholder="房间名称">
      </div>
      <!-- 卫生间/厕所：类型选择框（背篓选项与价格来自价格库），暖气片类型下为规格选择 + 片数 -->
      <div v-if="isBathroom(r.name)" class="c-typecell">
        <select class="btype" :value="roomTypeVal(r)"
                title="卫生间/厕所可选择普通暖气片或背篓（背篓选项与价格来自价格库）"
                @change="onRoomType(r, $event.target.value)">
          <option value="rad">类型：暖气片</option>
          <option v-if="backetLib.length === 0" value="na" disabled>背篓（价格库未配置）</option>
          <option v-for="(b, bi) in backetLib" :key="bi" :value="String(bi)">背篓：{{ b.name }}（¥{{ b.price }}/个）</option>
        </select>
        <template v-if="!isBacketRoom(r)">
          <span v-for="(p, pi) in (r.pairs || [])" :key="pi" class="sp-in">
            <select class="sp-sel" v-model="p.specIdx" title="选择中心距规格">
              <option v-if="curSpecs.length === 0" :value="0">未配置规格</option>
              <option v-for="(s, si) in curSpecs" :key="si" :value="si">{{ s.name }}</option>
            </select>
            <input type="number" min="0" step="1" placeholder="0" v-model="p.pieces">
            <span class="u">片</span>
            <span v-if="(r.pairs || []).length > 1" class="px" title="删除该规格" @click="delRoomPair(r, pi)">✕</span>
          </span>
        </template>
        <template v-else>
          <span class="sp-in sp-backet" title="碳钢背篓数量（卫生间专用）">
            <span class="lbl">背篓数量</span>
            <input type="number" min="0" step="1" placeholder="0" v-model.number="r.backetQty">
            <span class="u">个</span>
          </span>
        </template>
      </div>
      <!-- 普通房间：规格选择 + 片数（一个房间一条规格，计 1 组） -->
      <div v-else class="c-pairs">
        <span v-for="(p, pi) in (r.pairs || [])" :key="pi" class="sp-in">
          <select class="sp-sel" v-model="p.specIdx" title="选择中心距规格">
            <option v-if="curSpecs.length === 0" :value="0">未配置规格</option>
            <option v-for="(s, si) in curSpecs" :key="si" :value="si">{{ s.name }}</option>
          </select>
          <input type="number" min="0" step="1" placeholder="0" v-model="p.pieces">
          <span class="u">片</span>
          <span v-if="(r.pairs || []).length > 1" class="px" title="删除该规格" @click="delRoomPair(r, pi)">✕</span>
        </span>
      </div>
      <div class="c-sum">{{ roomRows[i].sumText }}</div>
      <div class="c-del"><button class="del" title="删除房间" @click="delRoom(i)">✕</button></div>
    </div>
    <button class="btn-add" @click="addRoom">＋ 添加房间</button>

    <div class="room-stats">
      <span>房间数：<b>{{ store.rooms.length }}</b></span>
      <span>暖气片组数：<b>{{ totalGroups }}</b> 组</span>
      <span>总片数：<b>{{ radStats.pieces }}</b> 片</span>
      <span>阀门总数：<b>{{ totalGroups * 2 }}</b> 个</span>
      <span class="specline">
        规格构成：<b><template v-for="(p, i) in roomCompLine" :key="i"><span v-if="i > 0" class="plus">+</span>{{ p.name }} × {{ p.n }} {{ p.unit }}</template><template v-if="roomCompLine.length === 0">—</template></b>
      </span>
      <span class="mode-pick">
        安装费计费：
        <select v-model="store.installMode">
          <option value="group">按每组</option>
          <option value="room">按每个房间</option>
        </select>
      </span>
    </div>
  </div>

  <!-- 报价单 -->
  <div class="card">
    <h2>
      <span class="dot"></span>报价单
      <span class="spacer"></span>
      <button class="btn-detail" @click="showResult = true">📊 查看利润汇总</button>
      <button class="btn-detail" @click="showLib = true">⚙ 价格库配置</button>
    </h2>

    <div class="quote-head">
      <span class="qi">客户：<input type="text" v-model="store.quote.customer" placeholder="客户名称（选填）"></span>
      <span class="qi">联系电话：<input type="text" v-model="store.quote.phone" placeholder="选填"></span>
      <span class="qi">日期：<input type="text" v-model="store.quote.date" placeholder="YYYY-MM-DD"></span>
      <span class="qi">楼层：<input type="number" class="floor-in" min="0" step="1" :value="store.floor > 0 ? store.floor : ''" placeholder="如 5" title="仅作工地信息记录：配送费为统一价，不随楼层变化；留空则不计配送费" @input="onFloorInput"><span class="unit-x">层</span></span>
      <span class="spacer"></span>
      <span class="no">{{ totals.no }}<span class="en">单号</span></span>
    </div>

    <span class="swipe-tip">← 左右滑动查看完整报价单 →</span>
    <div class="table-wrap">
      <table class="items">
        <colgroup>
          <col style="width:12%"><col style="width:20%"><col style="width:7%"><col style="width:35%"><col style="width:26%">
        </colgroup>
        <thead>
          <tr>
            <th>项目</th><th>品牌 / 规格</th><th>赠送</th><th>数量</th><th>报价金额</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="l in catLines" :key="l.cat.key">
          <tr :class="{ gift: l.isGift }">
            <td class="name">{{ l.cat.name }}<span class="tag">（{{ l.cat.unit }}）</span></td>
            <td>
              <span v-if="l.cat.key === 'radiator'" class="brand-chip" :class="{ none: !curBrand }">{{ curBrand ? curBrand.name : "未配置品牌" }}</span>
              <select v-else v-model="store.sel[l.cat.key]">
                <option v-if="(store.lib[l.cat.key] || []).length === 0" :value="-1">未配置（点右上角配置）</option>
                <option v-for="(en, idx) in store.lib[l.cat.key]" :key="idx" :value="idx">{{ en.name }}</option>
              </select>
            </td>
            <td><input type="checkbox" class="gift-chk" v-model="store.gift[l.cat.key]" title="勾选后该项目赠送给客户，不计报价"></td>
            <td>
              <template v-if="l.cat.key === 'radiator'">
                <span class="spec-qty" :class="{ none: specLine.length === 0 }">
                  <template v-if="specLine.length">
                    <template v-for="(p, i) in specLine" :key="i"><span class="plus" v-if="i > 0">+</span><span class="seg">{{ p.name }} × <b>{{ p.n }}</b> 片</span></template>
                    <span class="total">合计 {{ radStats.pieces }} 片 · {{ totalGroups }} 组</span>
                  </template>
                  <template v-else>未填写片数</template>
                </span>
              </template>
              <template v-else>
                <div class="cell-input">
                  <input v-if="l.cat.mode === 'manual'" type="number" min="0" step="1" v-model.number="store.manualQty[l.cat.key]">
                  <input v-else type="number" :value="catQty(l.cat)" readonly title="数量自动推算">
                  <span class="qty-unit">{{ l.cat.unit }}</span>
                  <span v-if="l.cat.mode === 'valves'" class="qty-note">组数 × 2</span>
                  <span v-else-if="l.cat.mode === 'groups'" class="qty-note">= 组数</span>
                  <span v-else-if="l.cat.mode === 'install'" class="qty-note">{{ store.installMode === 'group' ? '= 组数' : '= 房间数' }}</span>
                </div>
              </template>
            </td>
            <td class="num income">
              <template v-if="l.isGift"><span class="gift-tag">赠送</span><span class="strike">{{ fmt(l.rawIncome) }}</span></template>
              <template v-else>{{ fmt(l.income) }}</template>
            </td>
          </tr>
          <!-- 碳钢背篓扩展行：卫生间/厕所选背篓时附加在暖气片行下方（按所选背篓条目分组），可单独赠送 -->
          <template v-if="l.cat.key === 'radiator'">
            <tr v-for="g in backetGroups" :key="'bk-' + g.idx" class="backet-row" :class="{ gift: g.isGift }">
              <td class="name"><span class="sub-row-marker">└</span> 背篓<span class="tag">（个）</span></td>
              <td><span class="brand-chip" :class="{ none: !g.entry }">{{ g.entry ? g.entry.name : "未配置（价格库中设置）" }}</span></td>
              <td><input type="checkbox" class="gift-chk" v-model="store.gift.backet" title="勾选后所有背篓赠送给客户，不计报价"></td>
              <td>
                <div class="cell-input">
                  <input type="number" :value="g.qty" readonly :title="g.rooms + ' 个背篓房间合计'">
                  <span class="qty-unit">个</span>
                  <span class="qty-note">卫生间专用</span>
                </div>
              </td>
              <td class="num income">
                <template v-if="g.isGift"><span class="gift-tag">赠送</span><span class="strike">{{ fmt(g.rawIncome) }}</span></template>
                <template v-else>{{ fmt(g.income) }}</template>
              </td>
            </tr>
          </template>
          </template>
          <!-- 自定义赠送行：名称与成本自由填写；不向客户收费，成本计入总成本 -->
          <tr class="custom-gift-row">
            <td class="name"><input type="text" class="cg-name" v-model="store.customGift.name" placeholder="自定义赠送（如：温控器/毛巾架）"></td>
            <td><span class="brand-chip">自定义</span></td>
            <td><input type="checkbox" class="gift-chk" checked disabled title="本行为赠送项：不向客户收费，成本计入总成本"></td>
            <td>
              <div class="cell-input">
                <input type="number" min="0" step="0.01" placeholder="0" v-model.number="store.customGift.cost" title="该赠送项的成本（计入总成本）">
                <span class="qty-unit">元</span>
                <span class="qty-note">成本</span>
              </div>
            </td>
            <td class="num income"><span class="gift-tag">赠送</span><span>¥0.00</span></td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td class="label" colspan="4">报价合计</td>
            <td class="num">{{ fmt(totals.revenue) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="hint-bar">每个房间用<b>规格下拉</b>选择中心距规格、手动填写片数（<b>一个房间计 1 组</b>，需要多种规格时添加多个房间）· 房间名称含「卫生间/厕所」时用类型下拉选择暖气片或背篓（背篓选项与价格来自价格库，按个计） · 报价单暖气片行下方按所选背篓附加列示、可单独勾选赠送 · 表格底部有<b>自定义赠送行</b>：名称与成本自由填写，不向客户收费、成本计入总成本 · 勾选「赠送」后该项目不向客户收费，成本仍照计 · 带 <span class="qty-badge">自动</span> 数量由房间推算 · <b>配送费不计入报价合计，楼层 2 层及以上计入成本（1 层与留空不计）</b> · 单位：元</div>
    <div class="btn-row">
      <button class="btn-primary" @click="doSaveQuote">📄 存档当前报价单</button>
      <button class="btn-ghost" @click="resetAll()">清空重置</button>
    </div>
  </div>

  <!-- 利润汇总弹窗 -->
  <div class="overlay" :class="{ show: showResult }" @mousedown="e => { if (e.target === e.currentTarget) showResult = false; }">
    <div class="modal narrow">
      <div class="m-head">
        <h3>📊 利润汇总</h3>
        <button class="close" title="关闭" @click="showResult = false">✕</button>
      </div>
      <div class="m-body">
        <div class="result-grid">
          <div class="stat"><div class="k">销售总额（报价合计）</div><div class="v dark">{{ fmt(totals.revenue) }}</div></div>
          <div class="stat"><div class="k">总成本</div><div class="v dark">{{ fmt(totals.cost) }}</div></div>
          <div class="stat"><div class="k">配送费（已计入成本 · 不计入报价合计）</div><div class="v dark" style="font-size:19px;">{{ totals.delivery.has ? fmt(totals.delivery.cost) + "（已计入成本）" : "未计（楼层留空或 1 层）" }}</div></div>
          <div class="stat"><div class="k">销售利润率</div><div class="v" :class="totals.margin >= 0 ? 'green' : 'red'">{{ totals.revenue > 0 ? totals.margin.toFixed(1) + "%" : "—" }}</div></div>
          <div class="stat total span2"><div class="k">净利润</div><div class="v" :class="totals.profit >= 0 ? 'green' : 'red'">{{ fmt(totals.profit) }}</div></div>
          <div class="stat wide"><div class="k">单号（DH + 日期 + C成本 + L利润）</div><div class="v">{{ totals.no }}</div></div>
        </div>
        <div v-if="totals.giftValue > 0" class="gift-note">赠送让利：原价合计 {{ fmt(totals.giftValue) }}（已赠送给客户，未计入报价，但成本仍计入）</div>
        <div v-if="totals.customGiftCost > 0" class="gift-note">自定义赠送{{ store.customGift.name ? "「" + store.customGift.name + "」" : "" }}：成本 {{ fmt(totals.customGiftCost) }}（不计入报价合计，已计入总成本）</div>
        <div class="note-list">
          <b>计算口径</b>：组数 = 填了片数的房间数（<b>一个房间计 1 组</b>；背篓房间按背篓数量计 1 组）；阀门 = 组数 × 2；材料、安装 = 组数；暖气片按各规格片数分别计价；卫生间/厕所可用类型下拉选择背篓（选项与价格来自价格库，按个计），在报价单暖气片行下方按所选背篓附加列示、可单独赠送；配送费不计入报价合计，楼层 2 层及以上计入成本（1 层与留空不计），不在报价单明细中列示。
        </div>
      </div>
      <div class="m-foot">
        <span class="spacer"></span>
        <button class="btn-primary" @click="showResult = false">知道了</button>
      </div>
    </div>
  </div>

  <!-- 价格库配置弹窗 -->
  <div class="overlay" :class="{ show: showLib }" @mousedown="e => { if (e.target === e.currentTarget) showLib = false; }">
    <div class="modal">
      <div class="m-head">
        <h3>⚙ 价格库配置</h3>
        <button class="close" title="关闭" @click="showLib = false">✕</button>
      </div>
      <div class="m-body">
        <PriceLibEditor :active="showLib" @saved="showLib = false" @close="showLib = false" />
      </div>
    </div>
  </div>
</template>
