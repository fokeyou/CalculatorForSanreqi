/* 全局登录态：登录 UI 已停用——无登录页/注册入口；
   本模块仅负责恢复本机已保存的会话，供云端数据管理（价格库/报价单云同步）使用 */
import { reactive } from "vue";
import * as cloud from "./cloud.js";

export const session = reactive({
  user: null,
  role: null,         // 'admin' | 'user'（由服务端 register_login 返回）
  checked: false,     // 是否已完成首次会话检查
});

export async function initSession() {
  if (!cloud.cloudOriginOk()) { session.checked = true; return; }
  try {
    session.user = await cloud.getSession();
    if (session.user) {
      try { await syncProfile(session.user); }
      catch (e) {
        // 被封禁：syncProfile 内部已退出登录；其他错误静默（不影响本地使用）
        if (/停用/.test(e.message || "")) session.user = null;
      }
    }
  }
  catch (e) { /* 云暂不可用不影响本地使用 */ }
  finally { session.checked = true; }
}

/* 登录登记：档案维护 + 管理员判定 + 封禁拦截。返回 role；blocked 时抛错 */
export async function syncProfile(user) {
  const res = await cloud.registerLogin(user.email || "");
  if (res === "blocked") {
    await cloud.signOut();
    session.user = null; session.role = null;
    throw new Error("该账号已被管理员停用");
  }
  session.role = (res === "admin") ? "admin" : "user";
  return session.role;
}

/* 登录门：云端数据操作前必须已有本机会话；登录 UI 已停用，失效时仅提示 */
export async function requireSession() {
  if (!cloud.cloudOriginOk()) {
    throw new Error("云端功能需通过应用线上域名访问（当前是本地/局域网地址）");
  }
  let user = null;
  try { user = await cloud.getSession(); } catch (e) { throw e; }
  if (!user) {
    throw new Error("当前设备未登录且登录功能已停用，云端功能不可用（请联系管理员恢复登录）");
  }
  session.user = user;
  return user;
}

export async function doSignOut() {
  await cloud.signOut();
  session.user = null;
  session.role = null;
}
