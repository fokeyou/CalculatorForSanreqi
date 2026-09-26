/* 生产预览启动器：读取沙箱注入的 PORT 环境变量（避免 shell 展开问题） */
import { preview } from "vite";

const port = Number(process.env.PORT) || 3000;

const server = await preview({
  preview: {
    port,
    host: "0.0.0.0",
    strictPort: true,
    allowedHosts: true,
  },
});

server.printUrls();
