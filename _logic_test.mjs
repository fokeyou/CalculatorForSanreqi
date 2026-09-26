// Vue 版计算引擎口径校验（v24：一个房间计 1 组；规格对 pairs 结构；配送费只计入成本、1 层不计）
const mem = {};
globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };

const S = await import("./src/store.js");
const { store, totals, totalGroups, roomRows, radStats, specTotals, catLines, deliveryInfo, setBrand, applySnapshot, currentSnapshot } = S;
const { fmt } = await import("./src/defaults.js");

let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n)); };

// 测试夹具：真实价格库存云端、代码不内置示例数据 —— 测试自行装配（结构与云端一致）
store.lib = {
  radiator: [
    { name: "太阳花", specs: [
      { name: "600mm",  price: 120, cost: 75  },
      { name: "1600mm", price: 180, cost: 110 },
      { name: "1800mm", price: 200, cost: 125 },
    ]},
    { name: "圣劳伦斯", specs: [
      { name: "600mm",  price: 150, cost: 92  },
      { name: "1600mm", price: 210, cost: 130 },
      { name: "1800mm", price: 240, cost: 150 },
    ]},
  ],
  pipe:     [{ name: "PPR 热熔管", price: 30, cost: 12 }],
  valve:    [{ name: "普通铜阀", price: 45, cost: 20 }],
  material: [{ name: "标准辅材包", price: 200, cost: 90 }],
  drill:    [{ name: "普通打孔", price: 30, cost: 8 }],
  install:  [{ name: "标准安装", price: 80, cost: 50 }],
  backet:   [{ name: "碳钢背篓", price: 260, cost: 150 }],
  delivery: [{ name: "配送费（统一价）", price: 100, cost: 60 }],
};
store.rooms = [
  { name: "客厅", pairs: [{ specIdx: 0, pieces: 6 }, { specIdx: 2, pieces: 2 }] },
  { name: "主卧", pairs: [{ specIdx: 0, pieces: 5 }, { specIdx: 1, pieces: 1 }] },
  { name: "次卧", pairs: [{ specIdx: 0, pieces: 5 }] },
];
store.manualQty = { pipe: 80, drill: 6 };
store.sel = { brand: 0, pipe: 0, valve: 0, material: 0, drill: 0, install: 0 };
store.gift = { radiator: false, pipe: false, valve: false, material: false, drill: false, install: false, backet: false };

// 默认数据基准：3 房各 1 组 共 19 片 radIncome 2500 radCost 1560
// 管子2400/960 阀门270/120 材料600/270 打孔180/48 安装240/150
// v24 口径：一个房间计 1 组（客厅两种规格也是 1 组）；配送费不进报价合计；楼层1不计成本
// → revenue=6190 cost=3108 profit=3082
store.floor = 1;
ok("组数=3（一个房间 1 组）", totalGroups.value === 3);
ok("房间组数=[1,1,1]", roomRows.value.map(r => r.groups).join() === "1,1,1");
ok("片数=19", radStats.value.pieces === 19);
ok("暖气片收入=2500", radStats.value.income === 2500);
ok("规格合计=[16,1,2]", JSON.stringify(specTotals.value) === "[16,1,2]");
ok("客厅报价=1120（600×6+1800×2）", roomRows.value[0].sumText === fmt(1120));
ok("阀门数量=6", catLines.value.find(l => l.cat.key === "valve").income / 45 === 6);
ok("安装数量=3(按每组)", catLines.value.find(l => l.cat.key === "install").income / 80 === 3);
ok("楼层1：配送费不计", deliveryInfo.value.has === false);
ok("楼层1：销售总额=6190（不含配送费）", Math.abs(totals.value.revenue - 6190) < 1e-9);
ok("楼层1：总成本=3108（不含配送费）", Math.abs(totals.value.cost - 3108) < 1e-9);
ok("楼层1：净利润=3082", Math.abs(totals.value.profit - 3082) < 1e-9);
ok("单号 C3108L3082", /DH\d{8}C3108L3082/.test(totals.value.no));
ok("配送费不在明细行", !catLines.value.some(l => l.cat.key === "delivery"));

// 楼层2：配送费计入成本、仍不进报价合计
store.floor = 2;
ok("楼层2：配送费计入成本60", deliveryInfo.value.has === true && deliveryInfo.value.cost === 60);
ok("楼层2：销售总额仍=6190", Math.abs(totals.value.revenue - 6190) < 1e-9);
ok("楼层2：总成本=3168", Math.abs(totals.value.cost - 3168) < 1e-9);
ok("楼层2：净利润=3022", Math.abs(totals.value.profit - 3022) < 1e-9);

// 楼层留空：不计
store.floor = 0;
ok("楼层留空：不计配送费", deliveryInfo.value.has === false && Math.abs(totals.value.cost - 3108) < 1e-9);
store.floor = 1;

// 赠送：收入归零、成本照计
store.gift.radiator = true;
ok("赠送后总额=3690", Math.abs(totals.value.revenue - (6190 - 2500)) < 1e-9);
ok("赠送后成本不变=3108", Math.abs(totals.value.cost - 3108) < 1e-9);
store.gift.radiator = false;

// 安装按房间计费（3 房 = 3，与按组同值）
store.installMode = "room";
ok("安装按房间=3", catLines.value.find(l => l.cat.key === "install").income / 80 === 3);
store.installMode = "group";

// 房间内多种规格不叠加组数：给客厅再加一种规格，仍 1 组、报价叠加
store.rooms[0].pairs.push({ specIdx: 1, pieces: 1 });
ok("客厅加规格后仍 1 组", totalGroups.value === 3);
ok("客厅报价=1300（+1600×1）", roomRows.value[0].sumText === fmt(1300));
store.rooms[0].pairs.pop();

// 品牌切换迁移（规格对按规格名迁移）
const before = JSON.parse(JSON.stringify(store.rooms));
setBrand(1);
ok("品牌切换后规格对按规格名迁移", JSON.stringify(specTotals.value) === "[16,1,2]");
setBrand(0);
ok("切回品牌片数一致", JSON.stringify(store.rooms) === JSON.stringify(before));

// 快照 v9 兼容（pairs 结构 + 旧版 pieces 投影双写）
const snap = currentSnapshot();
ok("快照版本 v9", snap.v === 9);
ok("快照双写 pieces 投影", JSON.stringify(snap.rooms[0].pieces) === "[6,0,2]");
store.rooms = [{ name: "测试", pieces: [1, 2, 3] }];
store.quote.customer = "张三";
applySnapshot(snap);
const norm = rs => JSON.stringify(rs.map(r => ({ name: r.name, pairs: r.pairs })));
ok("应用快照后数据还原", norm(store.rooms) === norm(snap.rooms) && store.quote.customer === "");

// 旧 pieces 格式自动转换为规格对
const oldSnap = { ...snap, rooms: [{ name: "旧数据", pieces: [0, 4, 0] }] };
applySnapshot(oldSnap);
const p0 = store.rooms[0].pairs[0];
ok("旧 pieces 格式自动转换", store.rooms[0].name === "旧数据" && p0 && p0.specIdx === 1 && parseFloat(p0.pieces) === 4);

console.log(`\n结果： ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
