/* ============================================================
   全局状态（reactive store）+ 计算引擎（computed）
   - localStorage 键与单文件版一致：radiator_profit_lib_v9
   - 快照格式与单文件版 v9 一致（云同步兼容旧数据）
   ============================================================ */
import { reactive, computed, watch } from "vue";
import {
  CATS, VIS, defaultLib, defaultRooms,
  DEFAULT_SEL, DEFAULT_MANUAL_QTY, DEFAULT_GIFT,
  STORE_KEY, clamp, buildNo, migrateRooms
} from "./defaults.js";

export const store = reactive({
  lib: defaultLib(),
  sel: { ...DEFAULT_SEL },
  manualQty: { ...DEFAULT_MANUAL_QTY },
  gift: { ...DEFAULT_GIFT },
  rooms: defaultRooms(),
  installMode: "group",
  floor: 1,                       // 楼层（仅作记录：填了才计配送费，金额与楼层无关）
  quote: { customer: "", phone: "", date: "" },
  customGift: { name: "", cost: 0 },   // 自定义赠送行：不向客户收费，成本计入总成本
  lastNo: "",
});

/* ---- 房间规范化：新结构 pairs（规格对）优先，旧结构 pieces 数组自动转换 ---- */
function normRoom(r) {
  let pairs = [];
  if (Array.isArray(r.pairs)) {
    pairs = r.pairs.map(p => ({
      specIdx: Math.max(0, parseInt(p.specIdx, 10) || 0),
      pieces: p.pieces,
    }));
  } else if (Array.isArray(r.pieces)) {
    r.pieces.forEach((n, si) => {
      const v = parseFloat(n) || 0;
      if (v > 0) pairs.push({ specIdx: si, pieces: v });
    });
  }
  return {
    name: r.name,
    pairs,
    backet: !!r.backet,
    backetIdx: Math.max(0, parseInt(r.backetIdx, 10) || 0),
    backetQty: +r.backetQty || 0,
  };
}

/* ---- 启动载入（与单文件版存储结构一致） ---- */
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  if (saved && saved.lib) {
    CATS.forEach(c => {
      if (c.key === "radiator") {
        if (Array.isArray(saved.lib.radiator)) {
          store.lib.radiator = saved.lib.radiator.map(b => ({
            name: b.name,
            specs: Array.isArray(b.specs) ? b.specs.map(s => ({ name: s.name, price: +s.price || 0, cost: +s.cost || 0 })) : []
          }));
        }
      } else if (Array.isArray(saved.lib[c.key])) {
        store.lib[c.key] = saved.lib[c.key].map(e => ({ name: e.name, price: +e.price || 0, cost: +e.cost || 0 }));
      }
    });
    if (saved.sel) Object.assign(store.sel, saved.sel);
    if (saved.manualQty) Object.assign(store.manualQty, saved.manualQty);
    if (saved.gift) Object.assign(store.gift, saved.gift);
    if (saved.installMode) store.installMode = saved.installMode;
    if (typeof saved.floor === "number") store.floor = saved.floor;
    if (Array.isArray(saved.rooms)) store.rooms = saved.rooms.map(normRoom);
    if (saved.quote) Object.assign(store.quote, saved.quote);
    if (saved.customGift) store.customGift = { name: String(saved.customGift.name || ""), cost: +saved.customGift.cost || 0 };
  }
  if (!store.quote.date) {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    store.quote.date = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
} catch (e) { /* 损坏的本地数据按默认值兜底 */ }

/* ---- 持久化（任何变更自动落盘） ---- */
watch(store, () => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      lib: store.lib, sel: store.sel, manualQty: store.manualQty, gift: store.gift,
      rooms: store.rooms, installMode: store.installMode, quote: store.quote, floor: store.floor,
      customGift: store.customGift
    }));
  } catch (e) {}
}, { deep: true });

/* ---- 派生：品牌与规格 ---- */
export const brands = computed(() => store.lib.radiator || []);
export const curBrand = computed(() => {
  const bs = brands.value;
  return bs[clamp(store.sel.brand, bs.length)] || null;
});
export const curSpecs = computed(() => (curBrand.value ? curBrand.value.specs || [] : []));

/* ---- 碳钢背篓（卫生间/厕所专用，选项与价格来自价格库 lib.backet） ---- */
export const isBathroom = name => /卫生间|厕所/.test(name || "");
export const isBacketRoom = r => !!r.backet && isBathroom(r.name);
export function setRoomBacket(r, on) {
  r.backet = !!on;
  if (on && !(parseFloat(r.backetQty) > 0)) r.backetQty = 1;
}
/* 某房间所选的背篓条目：backetIdx 指向价格库 lib.backet，越界归 0 */
export function backetEntryOf(r) {
  const lib = store.lib.backet || [];
  return lib[clamp(r.backetIdx || 0, lib.length)] || null;
}
/* 按所选背篓条目分组汇总（不同背篓在报价单中各列一行） */
export const backetGroups = computed(() => {
  const lib = store.lib.backet || [];
  const isGift = !!store.gift.backet;
  const map = new Map();
  store.rooms.forEach(r => {
    if (!isBacketRoom(r)) return;
    const q = parseFloat(r.backetQty) || 0;
    if (!(q > 0)) return;
    const idx = clamp(r.backetIdx || 0, lib.length);
    if (!map.has(idx)) {
      const entry = lib[idx] || null;
      map.set(idx, {
        idx, entry, qty: 0, rooms: 0,
        price: entry ? (+entry.price || 0) : 0,
        unitCost: entry ? (+entry.cost || 0) : 0,
      });
    }
    const g = map.get(idx);
    g.qty += q;
    g.rooms += 1;
  });
  return Array.from(map.values()).map(g => {
    const rawIncome = g.qty * g.price;
    return {
      idx: g.idx, entry: g.entry, qty: g.qty, rooms: g.rooms, price: g.price,
      cost: g.qty * g.unitCost, rawIncome,
      income: isGift ? 0 : rawIncome, isGift,
    };
  });
});
export const backetStats = computed(() => {
  let qty = 0, groups = 0, cost = 0, rawIncome = 0, income = 0;
  backetGroups.value.forEach(g => {
    qty += g.qty; groups += g.rooms; cost += g.cost; rawIncome += g.rawIncome; income += g.income;
  });
  return { qty, groups, price: qty > 0 ? rawIncome / qty : 0, cost, rawIncome, income, isGift: !!store.gift.backet };
});
export const backetLine = computed(() => {
  const b = backetStats.value;
  return { qty: b.qty, income: b.income, rawIncome: b.rawIncome, isGift: b.isGift };
});

/* ---- 房间规格对操作（每条 = 一种规格 + 片数；片数手动填写） ---- */
export const roomPairs = r => (Array.isArray(r.pairs) ? r.pairs : []);
export function addRoomPair(r) { r.pairs.push({ specIdx: 0, pieces: "" }); }
export function delRoomPair(r, i) { r.pairs.splice(i, 1); }
function pairSpec(p) {
  const specs = curSpecs.value;
  return specs[clamp(p.specIdx, specs.length)] || null;
}

/* ---- 派生：每个房间的报价（一个房间就 1 组；背篓房间按其所选背篓条目计价） ---- */
export const roomRows = computed(() => {
  const giftRad = !!store.gift.radiator;
  const giftBkt = !!store.gift.backet;
  return store.rooms.map(r => {
    if (isBacketRoom(r)) {
      const q = parseFloat(r.backetQty) || 0;
      const g = q > 0 ? 1 : 0;
      const e = backetEntryOf(r);
      const sum = q * (e ? (+e.price || 0) : 0);
      return { groups: g, sum, sumText: (q > 0 && giftBkt) ? "赠送" : (g > 0 ? fmtY(sum) : "—") };
    }
    let sum = 0, any = false;
    roomPairs(r).forEach(p => {
      const s = pairSpec(p);
      const n = parseFloat(p.pieces) || 0;
      if (s && n > 0) { any = true; sum += n * (+s.price || 0); }
    });
    const g = any ? 1 : 0;               // 一个房间就一组片
    return { groups: g, sum, sumText: giftRad ? "赠送" : (g > 0 || sum > 0 ? fmtY(sum) : "—") };
  });
});

/* ---- 派生：规格合计与暖气片收支（背篓房间的片数不计入普通暖气片） ---- */
export const specTotals = computed(() => {
  const specs = curSpecs.value;
  const tot = new Array(specs.length).fill(0);
  store.rooms.forEach(r => {
    if (isBacketRoom(r)) return;
    roomPairs(r).forEach(p => {
      const n = parseFloat(p.pieces) || 0;
      if (n > 0 && p.specIdx >= 0 && p.specIdx < tot.length) tot[p.specIdx] += n;
    });
  });
  return tot;
});

export const radStats = computed(() => {
  const specs = curSpecs.value, tot = specTotals.value;
  let income = 0, cost = 0, pieces = 0;
  specs.forEach((s, si) => {
    income += (tot[si] || 0) * s.price;
    cost += (tot[si] || 0) * s.cost;
    pieces += tot[si] || 0;
  });
  return { income, cost, pieces };
});

export const totalGroups = computed(() => {
  return roomRows.value.reduce((a, r) => a + r.groups, 0);
});

/* ---- 派生：各分类行的数量 / 收入 / 成本 ---- */
export function catQty(c) {
  if (c.mode === "manual") return store.manualQty[c.key] || 0;
  if (c.mode === "valves") return totalGroups.value * 2;
  if (c.mode === "groups") return totalGroups.value;
  if (c.mode === "install") return (store.installMode === "group" ? totalGroups.value : store.rooms.length);
  return 0;
}

export const catLines = computed(() => VIS.map(c => {
  let rawIncome = 0, cst = 0, entry = null;
  if (c.key === "radiator") {
    rawIncome = radStats.value.income; cst = radStats.value.cost;
  } else {
    entry = (store.lib[c.key] || [])[store.sel[c.key]] || null;
    const qty = catQty(c);
    rawIncome = (entry ? entry.price : 0) * qty;
    cst = (entry ? entry.cost : 0) * qty;
  }
  const isGift = !!store.gift[c.key];
  return {
    cat: c, entry, isGift, rawIncome,
    income: isGift ? 0 : rawIncome,
    cost: cst,
  };
}));

/* ---- 派生：配送费（只计入成本，永不计入报价合计）
   规则：楼层留空或 1 层 → 不计配送费；2 层及以上 → 计入成本（金额取价格库统一价） ---- */
export const deliveryInfo = computed(() => {
  const e = (store.lib.delivery || [])[0];
  if (!e) return { has: false, income: 0, cost: 0, entry: null };
  if (!(store.floor >= 2)) return { has: false, income: 0, cost: 0, entry: null };
  return { has: true, income: 0, cost: +e.cost || 0, entry: e };
});

/* ---- 派生：总额 / 成本 / 利润 / 单号 ---- */
export const totals = computed(() => {
  let revenue = 0, cost = 0, giftValue = 0;
  catLines.value.forEach(l => {
    revenue += l.income;
    cost += l.cost;
    if (l.isGift) giftValue += l.rawIncome;
  });
  // 碳钢背篓扩展行（卫生间，按所选背篓条目分组）：计入报价合计与成本，可单独赠送
  backetGroups.value.forEach(g => {
    revenue += g.income;
    cost += g.cost;
    if (g.isGift) giftValue += g.rawIncome;
  });

  const dv = deliveryInfo.value;
  // 配送费不计入报价合计（revenue），只计入成本（cost）
  cost += dv.cost;
  // 自定义赠送行：不向客户收费（revenue 不变），成本计入总成本
  const cgCost = +store.customGift.cost || 0;
  cost += cgCost;
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const no = buildNo(store.quote.date, cost, profit);
  return { revenue, cost, profit, margin, giftValue, no, delivery: dv, customGiftCost: cgCost };
});

// 实时同步单号到 store（云存档取用）
watch(() => totals.value.no, n => { store.lastNo = n; }, { immediate: true });

/* ---- 操作方法 ---- */
export function setBrand(idx) {
  const bs = brands.value;
  if (idx < 0 || idx >= bs.length) return;
  const oldNames = curSpecs.value.map(s => s.name);
  store.sel.brand = idx;
  migrateRooms(store.rooms, oldNames, curSpecs.value.map(s => s.name));
}

export function addRoom() {
  store.rooms.push({
    name: "房间" + (store.rooms.length + 1),
    pairs: [{ specIdx: 0, pieces: "" }],
  });
}
export function delRoom(i) { store.rooms.splice(i, 1); }

/* 保存价格库草稿：与单文件版 saveLib 语义一致
   （索引定位优先、名称兜底；SEL 越界归零；片数按规格名迁移） */
export function applyLib(draft, oldSnap) {
  store.lib = JSON.parse(JSON.stringify(draft));
  CATS.forEach(c => {
    if (c.key === "radiator") {
      if (!Array.isArray(store.lib.radiator)) store.lib.radiator = [];
      store.lib.radiator.forEach(b => { if (!Array.isArray(b.specs)) b.specs = []; });
    } else {
      if (!Array.isArray(store.lib[c.key])) store.lib[c.key] = [];
      store.sel[c.key] = clamp(store.sel[c.key], store.lib[c.key].length);
    }
  });
  const bs = brands.value;
  let nb = (oldSnap && typeof oldSnap.brandIdx === "number" && oldSnap.brandIdx >= 0 && oldSnap.brandIdx < bs.length)
    ? oldSnap.brandIdx
    : bs.findIndex(b => b.name === (oldSnap ? oldSnap.brandName : ""));
  if (nb < 0) nb = 0;
  store.sel.brand = nb;
  migrateRooms(store.rooms, oldSnap ? oldSnap.specNames : [], (bs[nb] ? bs[nb].specs : []).map(s => s.name));
}

/* 清空重置（原「恢复示例」；默认数据已不内置示例，云端仍保留已保存的价格库） */
export function resetAll() {
  store.rooms = defaultRooms();
  store.lib = defaultLib();
  store.sel = { ...DEFAULT_SEL };
  store.manualQty = { ...DEFAULT_MANUAL_QTY };
  store.gift = { ...DEFAULT_GIFT };
  store.installMode = "group";
  store.floor = 1;
  store.quote = { customer: "", phone: "", date: store.quote.date };
  store.customGift = { name: "", cost: 0 };
}

/* 仅应用价格库部分（启动时云端自动读取用）：
   归一化 lib 并把本机选择项按新价格库越界归零；不触碰房间/报价/赠送等本机工作数据 */
export function applyLibOnly(p) {
  if (!p || !p.lib || typeof p.lib !== "object") return false;
  store.lib = defaultLib();
  if (Array.isArray(p.lib.radiator)) {
    store.lib.radiator = p.lib.radiator.map(b => ({
      name: String(b.name || ""),
      specs: Array.isArray(b.specs) ? b.specs.map(s => ({
        name: String(s.name || ""), price: +s.price || 0, cost: +s.cost || 0
      })) : []
    }));
  }
  CATS.forEach(c => {
    if (c.key !== "radiator" && Array.isArray(p.lib[c.key])) {
      store.lib[c.key] = p.lib[c.key].map(e => ({
        name: String(e.name || ""), price: +e.price || 0, cost: +e.cost || 0
      }));
    }
  });
  // 选择项越界归零
  CATS.forEach(c => {
    if (c.key !== "radiator") store.sel[c.key] = clamp(store.sel[c.key], (store.lib[c.key] || []).length);
  });
  store.sel.brand = clamp(store.sel.brand, (store.lib.radiator || []).length);
  return true;
}

/* 应用快照（云恢复 / 载入报价单存档）—— 与单文件版 applySnapshot 语义一致 */
export function applySnapshot(p) {
  if (!p || typeof p !== "object") throw new Error("云端数据格式不正确");
  applyLibOnly(p);
  if (p.sel) Object.assign(store.sel, p.sel);
  if (p.manualQty) Object.assign(store.manualQty, p.manualQty);
  if (p.gift) Object.assign(store.gift, p.gift);
  store.installMode = (p.installMode === "room") ? "room" : (p.installMode === "group" ? "group" : store.installMode);
  store.floor = (typeof p.floor === "number") ? p.floor : store.floor;
  if (Array.isArray(p.rooms) && p.rooms.length) {
    store.rooms = p.rooms.map(normRoom);
  }
  store.quote = Object.assign({ customer: "", phone: "", date: store.quote.date }, p.quote || {});
  if (p.customGift) store.customGift = { name: String(p.customGift.name || ""), cost: +p.customGift.cost || 0 };
}

/* 快照（与单文件版 v9 一致，供云同步）
   rooms 双写：pairs 为新结构；pieces 为按当前规格的投影（旧版本客户端只认 pieces） */
export function currentSnapshot() {
  const specs = curSpecs.value;
  return {
    v: 9, lib: JSON.parse(JSON.stringify(store.lib)), sel: { ...store.sel },
    manualQty: { ...store.manualQty }, gift: { ...store.gift },
    rooms: JSON.parse(JSON.stringify(store.rooms)).map(r => {
      const proj = new Array(specs.length).fill(0);
      (r.pairs || []).forEach(p => {
        const n = parseFloat(p.pieces) || 0;
        if (n > 0 && p.specIdx >= 0 && p.specIdx < specs.length) proj[p.specIdx] += n;
      });
      return { ...r, pieces: proj };
    }),
    installMode: store.installMode,
    floor: store.floor, quote: { ...store.quote }, customGift: { ...store.customGift }
  };
}

function fmtY(v) {
  return "¥" + v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
