<script setup>
/* 用户管理 —— 后台管理第 4 块
   列表：所有注册用户（app_users 只读共享）；管理员可禁用/启用、删除用户
   （删除会连其云端价格库与报价单存档一并清除，服务端 SECURITY DEFINER 校验管理员身份）
   被禁用的用户下次进入应用会被强制退出并提示 */
import { ref, onMounted } from "vue";
import { session, requireSession } from "../session.js";
import { listAppUsers, adminSetUserStatus, adminDeleteUser, errText, CLOUD_CFG } from "../cloud.js";

const rows = ref([]);
const loading = ref(false);
const loaded = ref(false);
const errMsg = ref("");
const msg = ref("");
const msgBad = ref(false);
function say(text, bad) { msg.value = text || ""; msgBad.value = !!bad; }

const fmtTime = t => t ? new Date(t).toLocaleString("zh-CN") : "—";

/* ---- 添加新用户：平台要求每个账号经本人邮箱验证，无法由管理员代建账号；
        提供注册链接分发 + 刷新，新用户注册后自动出现在列表 ---- */
const showAdd = ref(false);
const regLink = CLOUD_CFG.endpoint + "/#/login";
const copied = ref(false);
async function copyLink() {
  try {
    await navigator.clipboard.writeText(regLink);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch (e) {
    // 剪贴板 API 不可用（如非安全上下文）时的兜底
    try {
      const ta = document.createElement("textarea");
      ta.value = regLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      copied.value = true;
      setTimeout(() => { copied.value = false; }, 2000);
    } catch (e2) { say("复制失败，请手动选中链接复制", true); }
  }
}

async function refresh() {
  errMsg.value = "";
  try { await requireSession(); }
  catch (e) { errMsg.value = e.message || "请先登录"; return; }
  loading.value = true;
  try {
    rows.value = await listAppUsers();
    loaded.value = true;
  } catch (e) { errMsg.value = e.message || "读取失败"; }
  finally { loading.value = false; }
}
onMounted(refresh);

const isSelf = u => session.user && u.id === session.user.id;
const isAdmin = () => session.role === "admin";

async function toggleStatus(u) {
  const target = u.status === "active" ? "blocked" : "active";
  if (!window.confirm(target === "blocked"
    ? `禁用「${u.email || u.id}」？禁用后该用户进入应用会被强制退出，无法使用云端功能。`
    : `解除「${u.email || u.id}」的禁用？`)) return;
  try {
    await adminSetUserStatus(u.id, target);
    u.status = target;
    say(target === "blocked" ? "已禁用该用户" : "已解除禁用");
  } catch (e) { say(e.message || "操作失败", true); }
}

async function del(u) {
  if (!window.confirm(
    `⚠ 确定删除用户「${u.email || u.id}」？\n\n将同时删除该用户的：云端价格库、全部报价单存档、用户档案。\n此操作不可恢复！`)) return;
  try {
    await adminDeleteUser(u.id);
    rows.value = rows.value.filter(r => r.id !== u.id);
    say("已删除该用户及其云端数据");
  } catch (e) { say(e.message || "删除失败", true); }
}
</script>

<template>
  <div>
    <div v-if="errMsg" class="cloud-msg bad" style="margin-left:0;display:block;">{{ errMsg }}</div>
    <div v-if="msg" class="cloud-msg" :class="{ bad: msgBad }" style="margin-left:0;display:block;margin-bottom:8px;">{{ msg }}</div>
    <div v-if="!isAdmin()" class="admin-note" style="margin-bottom:10px;">
      你当前不是管理员：可查看用户列表，但禁用/启用与删除仅管理员可操作。
    </div>

    <div v-if="isAdmin()" style="margin-bottom:12px;">
      <button class="btn-primary" @click="showAdd = !showAdd">➕ 添加新用户</button>
    </div>

    <!-- 添加新用户面板：注册链接分发 -->
    <div v-if="showAdd" class="hint-bar" style="margin-bottom:12px;">
      <b>新用户加入方式</b>（平台要求每个账号经<b>本人邮箱验证码</b>注册，管理员无法代建账号）：
      <ol style="margin:8px 0 0 18px;">
        <li>把下面的注册链接发给新用户（微信/短信均可）；</li>
        <li>对方打开后点「注册」，填邮箱和密码，收取验证码完成注册；</li>
        <li>注册成功后自动出现在下方列表，你即可对其禁用/启用/删除。</li>
      </ol>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;">
        <input type="text" readonly :value="regLink" @focus="e => e.target.select()"
               style="flex:1 1 260px;min-width:0;border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:13px;background:#fff;">
        <button class="btn-ghost" @click="copyLink">{{ copied ? "✓ 已复制" : "📋 复制注册链接" }}</button>
        <button class="btn-mini" @click="refresh">↻ 刷新用户列表</button>
      </div>
    </div>

    <div v-if="loading" class="ql-empty">正在读取…</div>

    <template v-if="loaded">
      <div v-if="rows.length === 0" class="ql-empty">还没有注册用户（首次登录后自动登记）</div>
      <div v-for="u in rows" :key="u.id" class="ql-row" style="align-items:flex-start;">
        <div class="ql-main" style="min-width:220px;">
          <b>
            {{ u.email || "（无邮箱）" }}
            <span v-if="u.role === 'admin'" class="gift-tag" style="margin-left:4px;">管理员</span>
            <span v-if="u.status === 'blocked'" class="gift-tag" style="margin-left:4px;background:#fdeaea;color:var(--red);">已禁用</span>
            <span v-if="isSelf(u)" class="qty-note" style="margin-left:4px;">当前登录</span>
          </b>
          <span>首次登录：{{ fmtTime(u.created_at) }} ｜ 最近登录：{{ fmtTime(u.last_login) }}</span>
        </div>
        <div class="ql-act" v-if="isAdmin() && !isSelf(u)">
          <button class="btn-mini" type="button" @click="toggleStatus(u)">{{ u.status === "active" ? "禁用" : "解除禁用" }}</button>
          <button class="btn-mini danger" type="button" @click="del(u)">删除</button>
        </div>
      </div>
      <div class="admin-note" style="margin-top:10px;">
        「删除」会永久清除该用户的云端价格库、全部报价单存档与用户档案，不可恢复；用户列表全体登录用户可见，管理操作仅限管理员。
      </div>
    </template>
  </div>
</template>
