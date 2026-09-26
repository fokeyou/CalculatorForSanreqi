# 暖气片利润计算器 · Capacitor / iOS（TrollStore）构建说明

本分支 `feat/capacitor-ios` 在原有 Vue 网页基础上加入 Capacitor，目标是：
**不买 Mac、不申请 Apple 开发者账号，用云端 macOS 编译出 ipa，再用 TrollStore（巨魔）永久安装到 iPhone。**

## 前置条件（必读）

- 你的 iPhone 系统版本必须在 **iOS 14.0 – 16.6.1 或 17.0**（16.7.x 除 RC、17.0.1+、iOS 18 永久不支持 TrollStore）。先确认系统版本。
- 手机已安装 TrollStore，并在 Settings → Install Persistence Helper 选定一个不用的系统 App 做注入（重启防闪退）。
- 本仓库的网页通过 CDN 加载云服务 SDK，`index.html` 里那行 `<script src="https://cdn.jsdelivr.net/...workbuddy-cloud-sdk@dev">` 在 App 内需联网才能用云端功能。若需纯离线，请改为本地引入该 SDK。

## 本地开发 / 真机联调（可选）

```bash
npm install                 # 已包含 @capacitor/* 依赖
npm run build               # 构建前端到 dist
npx cap sync ios            # 同步到 iOS 工程
npx cap open ios            # 用 Xcode 打开（仅 macOS）
```

本地联调热更新：在 `capacitor.config.json` 的 `server` 下加 `url` 填入电脑局域网 IP（如 `http://192.168.1.10:5173`），
`npm run dev` + `npx cap sync ios` + `npx cap run ios`。

## 云端无签名出包（核心）

1. 把本分支推到 GitHub/GitLab。
2. 在 Codemagic（或 Capawesome Cloud / Appcircle）连接仓库，使用仓库内的 `codemagic.yaml`。
3. 触发构建，产物 `radiator-profit-unsigned.ipa` 作为 artifact 下载。
4. 把 ipa 传到 iPhone，用 **TrollStore 打开** 安装即可，永久生效、不失效、不吊销。

> 为什么能「无签名」：iOS 构建时设 `CODE_SIGNING_ALLOWED=NO`，产出未签名 ipa；
> TrollStore 利用 CoreTrust 漏洞在安装时重新签名为「看起来像 App Store 签名」的永久证书。
> 详见 `scripts/build-ios-unsigned.sh`。

## 文件清单

| 文件 | 作用 |
|---|---|
| `capacitor.config.json` | Capacitor 主配置（appId / appName / webDir） |
| `scripts/build-ios-unsigned.sh` | 云端 macOS 上执行的「构建+无签名打包」脚本 |
| `codemagic.yaml` | Codemagic 云端构建工作流 |
| `public/` | 已有的 manifest / service worker / 图标（PWA 资源，Capacitor 一并打包） |

## 已知注意点

- `npx cap add ios` 会在仓库里生成 `ios/` 原生工程（体积较大）。CI 流程已配置「不存在才生成」，本地一般无需提交 `ios/`。
- 正式上架 App Store 不能用此方案，需补 Apple 开发者签名；本方案仅面向 TrollStore 自签安装。
- 若某版本 Xcode 在 `CODE_SIGNING_ALLOWED=NO` 下仍报签名错误，可改用「自签证书」方式（本地生成一个 iOS Developer 自签证书再 archive），再交 TrollStore 重签。
