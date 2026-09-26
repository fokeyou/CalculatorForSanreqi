/* ============================================================
   云服务层 —— 与单文件版完全兼容
   客户端只用 publicConfig 的 endpoint 与 publishableKey（无长期密钥）
   数据表：price_lib（单行配置）/ quotes（报价单存档），RLS 按账号隔离
   ============================================================ */

export const CLOUD_CFG = {
  endpoint: "https://radiator-profit.app.workbuddy.host",
  publishableKey: "wbpk_3MFuKnT5YvCw15WVP2EgUD_8s1W18jwibgSsOzDL0vf7Ui5uL3BF46g"
};

let cloud = null;

export function cloudClient() {
  if (cloud) return cloud;
  if (typeof WorkBuddyCloud === "undefined" || typeof WorkBuddyCloud.createWorkBuddyCloud !== "function") {
    throw new Error("云服务组件未能加载，请检查网络后刷新页面重试");
  }
  cloud = WorkBuddyCloud.createWorkBuddyCloud({
    endpoint: CLOUD_CFG.endpoint,
    publishableKey: CLOUD_CFG.publishableKey
  });
  return cloud;
}

// 登录只在应用已发布的 HTTPS 域名下可用（Origin 与回调均已绑定该域名）
export const cloudOriginOk = () => location.origin === CLOUD_CFG.endpoint;

export const errText = (e, fallback) => (e && (e.message || e.code)) || fallback;

/* ---- 会话 ---- */
export async function getSession() {
  const { data, error } = await cloudClient().auth.getSession();
  if (error) throw new Error(errText(error, "获取会话失败"));
  return (data && data.user) || null;   // 本代码库约定：data 即会话对象，直接含 user
}

/* ---- 注册：两步式（第 1 步发码 / 第 2 步校验） ---- */
export async function sendOtp(email) {
  const sent = await cloudClient().auth.sendOtp({ email });
  if (sent.error) throw new Error(errText(sent.error, "验证码发送失败"));
  return sent.data;   // { verificationId, isExistingUser }
}

export async function verifyOtp(st, code, password) {
  const done = await cloudClient().auth.verifyOtp({
    email: st.email,
    verificationId: st.verificationId,
    isExistingUser: st.isExistingUser,
    token: code,
    password: password || undefined
  });
  if (done.error) throw new Error(errText(done.error, "验证失败"));
  return (done.data && done.data.user) || null;
}

/* ---- 密码登录 / 退出 ---- */
export async function signInWithPassword(email, password) {
  const { data, error } = await cloudClient().auth.signInWithPassword({ email, password });
  if (error) throw new Error(errText(error, "登录失败"));
  return (data && data.user) || null;
}

export async function signOut() {
  try { await cloudClient().auth.signOut(); } catch (e) {}
}

/* ---- 忘记密码 ---- */
export async function startReset(email) {
  const started = await cloudClient().auth.resetPasswordForEmail(email);
  if (started.error) throw new Error(errText(started.error, "重置验证码发送失败"));
  return started.data;   // { updateUser(nonce, password) }
}

export async function finishReset(handle, nonce, password) {
  const done = await handle.updateUser({ nonce, password });
  if (done.error) throw new Error(errText(done.error, "重置失败"));
}

/* ---- 价格库云同步（price_lib：每账号单行，取 updated_at 最新一行） ---- */
export async function pushLib(snapshot) {
  const db = cloudClient().database;
  const { data: rows, error: e1 } = await db.from("price_lib")
    .select("id").order("updated_at", { ascending: false }).limit(1);
  if (e1) throw new Error("读取云端配置失败：" + errText(e1, ""));
  if (Array.isArray(rows) && rows.length) {
    const { data: upd, error } = await db.from("price_lib")
      .update({ payload: snapshot, updated_at: new Date().toISOString() })
      .eq("id", rows[0].id).select();
    if (error) throw new Error("保存失败：" + errText(error, ""));
    if (!Array.isArray(upd) || upd.length === 0) throw new Error("云端没有可更新的配置，请重新登录后重试");
    return "价格库已更新到云端";
  }
  const { data: ins, error } = await db.from("price_lib").insert({ payload: snapshot }).select();
  if (error) throw new Error("保存失败：" + errText(error, ""));
  if (!Array.isArray(ins) || ins.length === 0) throw new Error("保存失败：云端未确认写入（请确认已登录）");
  return "价格库已保存到云端";
}

export async function pullLib() {
  const { data: rows, error } = await cloudClient().database.from("price_lib")
    .select("payload, updated_at").order("updated_at", { ascending: false }).limit(1);
  if (error) throw new Error("读取失败：" + errText(error, ""));
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("云端还没有保存过价格库，可先点「保存价格库到云端」");
  const t = rows[0].updated_at ? new Date(rows[0].updated_at).toLocaleString("zh-CN") : "";
  return { payload: rows[0].payload, time: t };
}

/* ---- 用户管理（app_users + SECURITY DEFINER 函数，越权由服务端把关） ---- */

// 登录登记：写入/更新档案，首位用户自动成为 admin；返回 'admin' | 'user' | 'blocked'
export async function registerLogin(email) {
  const { data, error } = await cloudClient().database.rpc("register_login", { p_email: email || "" });
  if (error) throw new Error(errText(error, "登录登记失败"));
  return data;
}

export async function listAppUsers() {
  const { data, error } = await cloudClient().database.from("app_users")
    .select("id, email, role, status, created_at, last_login")
    .order("created_at", { ascending: true });
  if (error) throw new Error("读取用户列表失败：" + errText(error, ""));
  return data || [];
}

export async function adminSetUserStatus(target, status) {
  const { error } = await cloudClient().database.rpc("admin_set_user_status", { p_target: target, p_status: status });
  if (error) throw new Error(errText(error, "操作失败"));
}

export async function adminDeleteUser(target) {
  const { error } = await cloudClient().database.rpc("admin_delete_user", { p_target: target });
  if (error) throw new Error(errText(error, "删除失败"));
}

/* ---- 报价单存档（quotes） ---- */

export async function saveQuoteArchive({ quoteNo, customer, quoteDate, revenue, cost, profit, payload }) {
  const { data, error } = await cloudClient().database.from("quotes").insert({
    quote_no: quoteNo || "",
    customer: customer || "",
    quote_date: quoteDate || "",
    revenue: revenue,
    cost: cost,
    profit: profit,
    payload: payload
  }).select();
  if (error) throw new Error("存档失败：" + errText(error, ""));
  if (!Array.isArray(data) || data.length === 0) throw new Error("存档失败：云端未确认写入（请确认已登录）");
  return data[0];
}

export async function listQuotes() {
  const { data: rows, error } = await cloudClient().database.from("quotes")
    .select("id, owner_id, quote_no, customer, quote_date, revenue, cost, profit, created_at")
    .order("id", { ascending: false });
  if (error) throw new Error("读取失败：" + errText(error, ""));
  return rows || [];
}

export async function loadQuoteArchive(id) {
  const { data, error } = await cloudClient().database.from("quotes")
    .select("payload").eq("id", id).maybeSingle();
  if (error) throw new Error("载入失败：" + errText(error, ""));
  if (!data) throw new Error("该存档不存在或不属于当前账号");
  return data.payload;
}

export async function deleteQuoteArchive(id) {
  const { data, error } = await cloudClient().database.from("quotes").delete().eq("id", id).select();
  if (error) throw new Error("删除失败：" + errText(error, ""));
  if (!Array.isArray(data) || data.length === 0) throw new Error("删除失败：该存档不存在或不属于当前账号");
}
