import { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 配置 —— 暖气片利润计算器
 *
 * - webDir: 必须与 Vite 的 build.outDir 一致（dist）
 * - appId:  反向域名，打 ipa / 上架时作为 Bundle ID，可改成你自己的
 * - appName: 手机主屏显示的名称
 *
 * server.url 仅用于「真机联调」：把下面一行改成
 *   url: 'http://<你电脑的局域网IP>:5173'
 * 然后 `npm run dev` + `npx cap sync ios` + `npx cap run ios` 即可热更新调试。
 * 正式构建（含云端无签名 ipa）不需要这一行。
 */
const config: CapacitorConfig = {
  appId: 'com.radiator.profit',
  appName: '暖气片利润计算器',
  webDir: 'dist',
  server: {
    // url: 'http://192.168.x.x:5173'
  },
  ios: {
    // Capacitor iOS 工程的 scheme 名，保持默认 App 即可
    scheme: 'App',
  },
};

export default config;
