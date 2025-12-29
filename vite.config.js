
import { defineConfig } from 'vite';
import { resolve } from 'path';

// Vite 配置文件
export default defineConfig({
  // 多页面入口配置
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        multi: resolve(__dirname, 'multiGame.html')
      }
    }
  },
  server: {
    allowedHosts: ['www.wszzwh.site'], //开在这里了
    // 代理配置：解决前端开发服务器与后端 API 服务器跨域问题
    proxy: {
      // 将 /socket.io 开头的 WebSocket 请求代理到后端端口 3000
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true // 启用 WebSocket 代理支持
      },
      // 将 /api 开头的 HTTP 请求代理到后端端口 3000
      '/api': {
        target: 'http://localhost:3000'
      }
    }
  }
});
