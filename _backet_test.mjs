// 背篓扩展行口径校验（v24：一个房间计 1 组；背篓按个；背篓条目来自价格库）
const mem = {};
globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };

const S = await import("./src/store.js");
const { store, totals, totalGroups, roomRows, radStats, specTotals, catLines, backetStats, backetLine, isBacketRoom } = S;
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

// 基线（无背篓）：3 房 3 组，revenue=6190 cost=3108（楼层1）
store.floor = 1;
ok("基线：总额=6190", Math.abs(totals.value.revenue - 6190) < 1e-9);
ok("基线：无背篓房间", backetStats.value.qty === 0);

// 卫生间切背篓：新增卫生间房间 backetQty=1（碳钢背篓 260/150，按个）
store.rooms.push({ name: "卫生间", pairs: [], backet: true, backetQty: 1 });
const br = store.rooms[store.rooms.length - 1];
ok("isBacketRoom 识别", isBacketRoom(br) === true);
ok("背篓数量=1", backetStats.value.qty === 1);
ok("背篓组数=1（计入总组数）", backetStats.value.groups === 1 && totalGroups.value === 4);
ok("背篓收入=260", Math.abs(backetStats.value.rawIncome - 260) < 1e-9);
ok("暖气片收入不含背篓房间=2500", Math.abs(radStats.value.income - 2500) < 1e-9);
ok("规格合计不含背篓房间=[16,1,2]", JSON.stringify(specTotals.value) === "[16,1,2]");
// 总额 = 6190 + 260 + 组数增量370(阀门90/材料200/安装80) = 6820；成本 = 3108 + 150 + 180 = 3438
ok("总额含背篓=6820（含新增组数的阀门/材料/安装增量）", Math.abs(totals.value.revenue - 6820) < 1e-9);
ok("成本含背篓=3438", Math.abs(totals.value.cost - 3438) < 1e-9);
ok("房间行显示背篓", roomRows.value[3].sumText === fmt(260));

// 背篓赠送：收入归零、成本照计
store.gift.backet = true;
ok("背篓赠送后总额=6560", Math.abs(totals.value.revenue - 6560) < 1e-9);
ok("背篓赠送后成本不变=3438", Math.abs(totals.value.cost - 3438) < 1e-9);
store.gift.backet = false;

// 改名普通房间 → 不再识别为背篓
br.name = "卧室";
ok("改名后不再识别为背篓房间", isBacketRoom(br) === false && backetStats.value.qty === 0);
br.name = "卫生间";
ok("改回卫生间恢复识别", isBacketRoom(br) === true && backetStats.value.qty === 1);

// 快照往返保留背篓字段
const snap = JSON.parse(JSON.stringify({ v: 9, lib: store.lib, sel: store.sel, manualQty: store.manualQty, gift: store.gift, rooms: store.rooms, installMode: store.installMode, floor: store.floor, quote: store.quote }));
const { applySnapshot, currentSnapshot } = S;
store.rooms = [];
applySnapshot(snap);
ok("快照往返保留背篓房间", store.rooms[3] && store.rooms[3].backet === true && store.rooms[3].backetQty === 1 && isBacketRoom(store.rooms[3]) === true);
const re = currentSnapshot();
ok("currentSnapshot 序列化背篓", JSON.parse(JSON.stringify(re.rooms))[3].backet === true);

// —— 按价格库选择背篓条目：选项与价格来自 lib.backet，各房间可独立选择 ——
store.lib.backet.push({ name: "不锈钢背篓", price: 300, cost: 180 });
store.rooms.push({ name: "厕所", pairs: [], backet: true, backetIdx: 1, backetQty: 2 });
const br2 = store.rooms[4];
const { backetGroups, backetEntryOf } = S;
ok("背篓按所选条目分组=2", backetGroups.value.length === 2);
ok("条目定位：房间1=碳钢背篓", (backetEntryOf(br) || {}).name === "碳钢背篓");
ok("条目定位：房间2=不锈钢背篓", (backetEntryOf(br2) || {}).name === "不锈钢背篓");
ok("分组数量=1+2", backetGroups.value[0].qty === 1 && backetGroups.value[1].qty === 2);
ok("分组收入=260+600", Math.abs(backetGroups.value[0].rawIncome - 260) < 1e-9 && Math.abs(backetGroups.value[1].rawIncome - 600) < 1e-9);
ok("总组数=5（基线3+背篓2）", totalGroups.value === 5);
// 总额 = 6820 + 600 + 1组增量370（阀门90/材料200/安装80） = 7790
ok("总额=7790", Math.abs(totals.value.revenue - 7790) < 1e-9);
// 成本 = 3438 + 360 + 1组成本增量180（阀门40/材料90/安装50） = 3978
ok("成本=3978", Math.abs(totals.value.cost - 3978) < 1e-9);
ok("房间行各按所选背篓计价", roomRows.value[3].sumText === fmt(260) && roomRows.value[4].sumText === fmt(600));
// backetIdx 越界归 0（按第 1 条计）
br2.backetIdx = 9;
ok("backetIdx 越界归 0", (backetEntryOf(br2) || {}).name === "碳钢背篓" && Math.abs(roomRows.value[4].sum - 520) < 1e-9);
br2.backetIdx = 1;
// 快照往返保留 backetIdx
const snap2 = currentSnapshot();
store.rooms = [];
applySnapshot(snap2);
ok("快照往返保留 backetIdx", store.rooms[4] && store.rooms[4].backetIdx === 1 && (backetEntryOf(store.rooms[4]) || {}).name === "不锈钢背篓");

console.log(`\n结果： ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
