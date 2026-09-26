import { createRouter, createWebHashHistory } from "vue-router";
import CalculatorView from "./views/CalculatorView.vue";
import AdminView from "./views/AdminView.vue";

// hash 模式：静态托管 / 离线 SW 场景下无需服务端回退配置，最稳妥
// （用户登录功能已停用：无登录页与路由守卫；云端数据管理依赖本机已保存的登录会话）
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "calculator", component: CalculatorView },
    { path: "/admin", name: "admin", component: AdminView },
  ],
});
