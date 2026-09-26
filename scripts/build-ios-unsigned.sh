#!/usr/bin/env bash
#
# build-ios-unsigned.sh
# ---------------------------------------------------------------------------
# 在 macOS CI（如 Codemagic / Capawesome Cloud / Appcircle）上运行：
#   1) 构建 Vue 前端  -> dist
#   2) 生成 / 同步 Capacitor iOS 原生工程
#   3) 以「不签名」方式 archive，打包成可由 TrollStore 永久自签的 ipa
#
# 关键点：CODE_SIGNING_ALLOWED=NO + CODE_SIGN_IDENTITY=""
#   产出的是未签名 ipa，TrollStore 安装时会用 CoreTrust 漏洞重新签名为永久生效。
#   因此本流程完全不需要 Apple ID / 开发者账号 / Mac 本地签名。
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPORT_IPA="$REPO_ROOT/radiator-profit-unsigned.ipa"
APP_SCHEME="App"

echo "==> [1/4] 安装依赖并构建前端"
cd "$REPO_ROOT"
npm ci
npm run build

echo "==> [2/4] 添加 / 同步 iOS 平台"
if [ ! -d "$REPO_ROOT/ios" ]; then
  npx cap add ios
fi
npx cap sync ios

echo "==> [3/4] 以不签名方式 archive"
# Capacitor 把原生工程放在 ios/App/；其中既有 App.xcworkspace 也可能只有
# App.xcodeproj（不同版本/Swift Package Manager 下结构略有差异）。
# 这里动态查找，避免写死相对路径导致 'App.xcworkspace does not exist'。
cd "$REPO_ROOT/ios"
echo "ios/ 顶层内容："
ls -la
WS=$(find "$REPO_ROOT/ios" -maxdepth 3 -name "*.xcworkspace" | head -n1)
PROJ=$(find "$REPO_ROOT/ios" -maxdepth 3 -name "*.xcodeproj" | head -n1)

if [ -n "$WS" ]; then
  echo "使用 workspace: $WS"
  xcodebuild \
    -workspace "$WS" \
    -scheme "$APP_SCHEME" \
    -configuration Release \
    -archivePath /tmp/App.xcarchive \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGN_IDENTITY="" \
    archive
elif [ -n "$PROJ" ]; then
  echo "使用 project: $PROJ"
  xcodebuild \
    -project "$PROJ" \
    -scheme "$APP_SCHEME" \
    -configuration Release \
    -archivePath /tmp/App.xcarchive \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGN_IDENTITY="" \
    archive
else
  echo "❌ 在 ios/ 下未找到任何 .xcworkspace 或 .xcodeproj，无法 archive"
  exit 1
fi

echo "==> [4/4] 打包未签名 ipa（供 TrollStore 自签）"
cd /tmp/App.xcarchive/Products/Applications
rm -rf Payload
mkdir Payload
cp -R "$APP_SCHEME.app" Payload/
( cd Payload && zip -r -X "$EXPORT_IPA" . )

echo "==> 完成："
echo "    $EXPORT_IPA"
echo "    把该文件 AirDrop / 网盘传到 iPhone，用 TrollStore 打开即可永久安装。"
