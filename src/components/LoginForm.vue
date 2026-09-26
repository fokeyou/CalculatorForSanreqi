<script setup>
/* 登录表单 —— 两步式认证（注册/验证码登录/密码登录/忘记密码）
   登录成功后 emit("done")，由父级（登录页）负责跳转 */
import { ref, reactive } from "vue";
import { session, syncProfile } from "../session.js";
import * as cloud from "../cloud.js";

const emit = defineEmits(["done"]);

const tab = ref("up");
const msg = ref("");
const msgOk = ref(false);
const busy = ref(false);

function say(text, ok) { msg.value = text || ""; msgOk.value = !!ok; }
function resetPane() {
  upStep2.value = false; otpStep2.value = false;
  pendingUp.value = null; pendingOtp.value = null;
  stopCooldown("up"); stopCooldown("otp");
  say("");
}

const up = reactive({ email: "", pwd: "", code: "" });
const otp = reactive({ email: "", code: "" });
const pw = reactive({ email: "", pwd: "" });
const rs = reactive({ email: "", code: "", pwd: "" });

const upStep2 = ref(false);
const otpStep2 = ref(false);
const pendingUp = ref(null);   // { email, verificationId, isExistingUser }
const pendingOtp = ref(null);

/* ---- 重发倒计时 ---- */
const cooldown = reactive({ up: 0, otp: 0 });
const timers = { up: null, otp: null };
function startCooldown(which) {
  stopCooldown(which);
  cooldown[which] = 60;
  timers[which] = setInterval(() => {
    cooldown[which]--;
    if (cooldown[which] <= 0) stopCooldown(which);
  }, 1000);
}
function stopCooldown(which) {
  if (timers[which]) { clearInterval(timers[which]); timers[which] = null; }
  cooldown[which] = 0;
}

/* ---- 注册第 1 步 ---- */
async function upSend() {
  if (!up.email.trim()) return say("请输入邮箱");
  if (up.pwd.length < 6) return say("请设置至少 6 位的登录密码");
  busy.value = true;
  try {
    const st = await cloud.sendOtp(up.email.trim());
    if (st.isExistingUser) {
      pendingUp.value = null; upStep2.value = false;
      return say("该邮箱已注册，请改用「验证码登录」直接登录");
    }
    pendingUp.value = { email: up.email.trim(), verificationId: st.verificationId, isExistingUser: st.isExistingUser };
    upStep2.value = true;
    startCooldown("up");
    say("验证码已发送，请查收邮箱（若未收到请留意垃圾邮件）", true);
  } catch (e) { say(e.message || "验证码发送失败"); }
  finally { busy.value = false; }
}

/* ---- 注册第 2 步 ---- */
async function upVerify() {
  const st = pendingUp.value;
  if (!st || st.email !== up.email.trim()) return say("请先为当前邮箱获取验证码");
  if (!up.code.trim()) return say("请输入验证码");
  if (up.pwd.length < 6) return say("请设置至少 6 位的登录密码");
  busy.value = true;
  try {
    session.user = await cloud.verifyOtp(st, up.code.trim(), up.pwd);
    if (await finishLogin()) return;
  } catch (e) { say(e.message || "验证失败"); }
  finally { busy.value = false; }
}

/* ---- 验证码登录第 1 步 ---- */
async function otpSend() {
  if (!otp.email.trim()) return say("请输入邮箱");
  busy.value = true;
  try {
    const st = await cloud.sendOtp(otp.email.trim());
    pendingOtp.value = { email: otp.email.trim(), verificationId: st.verificationId, isExistingUser: st.isExistingUser };
    otpStep2.value = true;
    startCooldown("otp");
    say("验证码已发送，请查收邮箱（若未收到请留意垃圾邮件）", true);
  } catch (e) { say(e.message || "验证码发送失败"); }
  finally { busy.value = false; }
}

/* ---- 验证码登录第 2 步 ---- */
async function otpVerify() {
  const st = pendingOtp.value;
  if (!st || st.email !== otp.email.trim()) return say("请先为当前邮箱获取验证码");
  if (!otp.code.trim()) return say("请输入验证码");
  busy.value = true;
  try {
    session.user = await cloud.verifyOtp(st, otp.code.trim(), undefined);
    if (await finishLogin()) return;
  } catch (e) { say(e.message || "验证失败"); }
  finally { busy.value = false; }
}

/* ---- 密码登录 ---- */
async function pwSignIn() {
  if (!pw.email.trim() || !pw.pwd) return say("请输入邮箱和密码");
  busy.value = true;
  try {
    session.user = await cloud.signInWithPassword(pw.email.trim(), pw.pwd);
    if (await finishLogin()) return;
  } catch (e) { say(e.message || "登录失败"); }
  finally { busy.value = false; }
}

/* ---- 忘记密码 ---- */
const rsHandle = ref(null);
async function rsStart() {
  if (!rs.email.trim()) return say("请输入注册邮箱");
  busy.value = true;
  try {
    rsHandle.value = await cloud.startReset(rs.email.trim());
    say("重置验证码已发送，请查收邮箱", true);
  } catch (e) { say(e.message || "重置验证码发送失败"); }
  finally { busy.value = false; }
}
async function rsFinish() {
  if (!rsHandle.value) return say("请先获取重置验证码");
  if (!rs.code.trim() || rs.pwd.length < 6) return say("请填写验证码与至少 6 位的新密码");
  busy.value = true;
  try {
    await cloud.finishReset(rsHandle.value, rs.code.trim(), rs.pwd);
    rsHandle.value = null;
    say("密码已重置，请用新密码登录", true);
  } catch (e) { say(e.message || "重置失败"); }
  finally { busy.value = false; }
}

/* 登录成功后的统一收尾：登记档案（管理员判定/封禁拦截）→ 通知父级跳转 */
async function finishLogin() {
  try { await syncProfile(session.user); }
  catch (e) { session.user = null; say(e.message || "登录登记失败", true); return false; }
  cleanup();
  emit("done");
  return true;
}

function cleanup() {
  upStep2.value = false; otpStep2.value = false;
  pendingUp.value = null; pendingOtp.value = null;
  stopCooldown("up"); stopCooldown("otp");
  say("");
}
</script>

<template>
  <div>
    <div class="cl-tabs">
      <button type="button" class="cl-tab" :class="{ on: tab === 'up' }" @click="tab = 'up'; resetPane()">注册</button>
      <button type="button" class="cl-tab" :class="{ on: tab === 'otp' }" @click="tab = 'otp'; resetPane()">验证码登录</button>
      <button type="button" class="cl-tab" :class="{ on: tab === 'pw' }" @click="tab = 'pw'; resetPane()">密码登录</button>
      <button type="button" class="cl-tab" :class="{ on: tab === 'reset' }" @click="tab = 'reset'; resetPane()">忘记密码</button>
    </div>

    <!-- 注册：两步式 -->
    <div v-if="tab === 'up'" class="cl-pane">
      <div class="cl-field"><label>邮箱</label><input type="email" v-model="up.email" placeholder="you@example.com" autocomplete="email" @keyup.enter="upSend"></div>
      <div class="cl-field"><label>设置密码</label><input type="password" v-model="up.pwd" placeholder="至少 6 位，用于密码登录" autocomplete="new-password" @keyup.enter="upSend"></div>
      <button class="btn-primary" :disabled="busy || cooldown.up > 0" @click="upSend">第 1 步：发送验证码{{ cooldown.up > 0 ? `(${cooldown.up}s)` : "" }}</button>
      <div v-if="upStep2" class="step2">
        <div class="cl-field"><label>验证码</label><input type="text" v-model="up.code" placeholder="邮箱收到的验证码" inputmode="numeric" @keyup.enter="upVerify"></div>
        <button class="btn-primary" :disabled="busy" @click="upVerify">第 2 步：完成注册</button>
      </div>
      <div class="cl-note">分两步：① 填好邮箱和密码，点「发送验证码」；② 到邮箱查收验证码填入，点「完成注册」。<br>（平台要求注册必须经邮箱校验，这一步无法省略。）</div>
    </div>

    <!-- 验证码登录：两步式 -->
    <div v-else-if="tab === 'otp'" class="cl-pane">
      <div class="cl-field"><label>邮箱</label><input type="email" v-model="otp.email" placeholder="you@example.com" autocomplete="email" @keyup.enter="otpSend"></div>
      <button class="btn-primary" :disabled="busy || cooldown.otp > 0" @click="otpSend">第 1 步：发送登录验证码{{ cooldown.otp > 0 ? `(${cooldown.otp}s)` : "" }}</button>
      <div v-if="otpStep2" class="step2">
        <div class="cl-field"><label>验证码</label><input type="text" v-model="otp.code" placeholder="邮箱收到的验证码" inputmode="numeric" @keyup.enter="otpVerify"></div>
        <button class="btn-primary" :disabled="busy" @click="otpVerify">第 2 步：完成登录</button>
      </div>
      <div class="cl-note">两步登录：① 填邮箱点「发送登录验证码」；② 查收邮箱填入验证码，点「完成登录」。全程无需密码。</div>
    </div>

    <!-- 密码登录 -->
    <div v-else-if="tab === 'pw'" class="cl-pane">
      <div class="cl-field"><label>邮箱</label><input type="email" v-model="pw.email" placeholder="you@example.com" autocomplete="email" @keyup.enter="pwSignIn"></div>
      <div class="cl-field"><label>密码</label><input type="password" v-model="pw.pwd" placeholder="登录密码" autocomplete="current-password" @keyup.enter="pwSignIn"></div>
      <button class="btn-primary" :disabled="busy" @click="pwSignIn">登录</button>
    </div>

    <!-- 忘记密码 -->
    <div v-else class="cl-pane">
      <div class="cl-field"><label>邮箱</label><input type="email" v-model="rs.email" placeholder="注册时使用的邮箱" autocomplete="email" @keyup.enter="rsStart"></div>
      <div class="cl-field">
        <button class="btn-mini" type="button" :disabled="busy" @click="rsStart">获取重置验证码</button>
      </div>
      <div class="cl-field"><label>验证码</label><input type="text" v-model="rs.code" placeholder="邮箱收到的重置验证码" inputmode="numeric"></div>
      <div class="cl-field"><label>新密码</label><input type="password" v-model="rs.pwd" placeholder="至少 6 位" autocomplete="new-password"></div>
      <button class="btn-primary" :disabled="busy" @click="rsFinish">确认重置</button>
    </div>

    <div class="cl-msg" :class="{ ok: msgOk }">{{ msg }}</div>
    <div class="cl-note">登录仅用于识别账号、隔离各自的数据；价格库与报价单只属于你自己的账号。</div>
  </div>
</template>
