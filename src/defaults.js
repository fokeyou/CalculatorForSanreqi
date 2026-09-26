/* ============================================================
   业务规则与默认数据 —— 与单文件版 v14 逐字对齐
   （口径说明：组数 = 房间中片数>0 的规格数；阀门 = 组数×2；
     材料、安装 = 组数；配送费统一一口价、不在报价单明细列示但计入总额/成本/利润/单号）
   ============================================================ */

// hidden:true → 不在报价单表格中列示，但仍参与销售额/成本/利润与单号计算
// backet 为暖气片的"扩展行"：不计独立行，数量由卫生间房间汇总后在暖气片行下方附加列示
export const CATS = [
  { key: "radiator", name: "暖气片", unit: "片", mode: "pieces"  },
  { key: "pipe",     name: "管子",   unit: "米", mode: "manual"  },
  { key: "valve",    name: "阀门",   unit: "个", mode: "valves"  }, // 组数 × 2
  { key: "material", name: "材料",   unit: "组", mode: "groups"  }, // 组数
  { key: "drill",    name: "打孔",   unit: "个", mode: "manual"  },
  { key: "install",  name: "安装",   unit: "组", mode: "install" }, // 组数 / 房间数
  { key: "backet",   name: "碳钢背篓", unit: "个", mode: "backet", hidden: true }, // 卫生间专用扩展行
  { key: "delivery", name: "配送费", unit: "次", mode: "flat", hidden: true }, // 只计入成本（2 层及以上），不计入报价合计
];

// 报价单表格中可见的分类（配送费不列示）
export const VIS = CATS.filter(c => !c.hidden);

/* 价格库默认结构：仅分类骨架，不内置任何示例价格。
   真实价格库存云端（price_lib 表），应用启动时自动读取；
   首次使用在「价格库配置」中填写，或点「从云端恢复价格库」 */
export function defaultLib() {
  return {
    radiator: [],
    pipe:     [],
    valve:    [],
    material: [],
    drill:    [],
    install:  [],
    backet:   [],
    delivery: [],
  };
}

/* 默认无房间：房间为每单临时录入（新增后选规格、填片数） */
export function defaultRooms() {
  return [];
}

export const DEFAULT_SEL = { brand: 0, pipe: 0, valve: 0, material: 0, drill: 0, install: 0 };
export const DEFAULT_MANUAL_QTY = { pipe: 0, drill: 0 };
export const DEFAULT_GIFT = { radiator: false, pipe: false, valve: false, material: false, drill: false, install: false, backet: false };

// 与单文件版相同的 localStorage 键 → 老用户本机数据无缝沿用
export const STORE_KEY = "radiator_profit_lib_v9";

export const clamp = (v, len) => (typeof v !== "number" || isNaN(v) || v < 0 || v >= len) ? 0 : v;

export const fmt = v => "¥" + v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// 单号用金额：取整且不加千分位分隔符
export const fmtInt = v => String(Math.round(v));

export function yyyymmdd(str) {
  const m = (str || "").match(/(\d{4})\D?(\d{2})\D?(\d{2})/);
  if (m) return m[1] + m[2] + m[3];
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
}

// 单号：DH + 日期 + C成本 + L利润
export function buildNo(date, cost, profit) {
  const pStr = profit < 0 ? "L-" + fmtInt(Math.abs(profit)) : "L" + fmtInt(profit);
  return "DH" + yyyymmdd(date) + "C" + fmtInt(cost) + pStr;
}

export function todayStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/* 品牌切换 / 价格库保存时，把已填「规格对」按旧规格名迁移到新规格名
   （同名迁移合并；在新品牌中消失的规格按旧口径丢弃） */
export function migrateRooms(rooms, oldNames, newNames) {
  rooms.forEach(r => {
    const merged = new Map();
    (r.pairs || []).forEach(p => {
      const j = newNames.indexOf(oldNames[p.specIdx]);
      if (j < 0) return;
      const q = parseFloat(p.pieces) || 0;
      if (q > 0) merged.set(j, (merged.get(j) || 0) + q);
    });
    r.pairs = Array.from(merged.entries()).map(([specIdx, pieces]) => ({ specIdx, pieces }));
  });
}
