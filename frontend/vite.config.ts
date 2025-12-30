import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0', // 监听所有网络接口，允许局域网访问
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // 优化开发环境 HTTP 连接（Vite 使用 http-proxy 中间件）
        // 启用 Keep-Alive 连接复用，减少 TCP 连接开销
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // 启用 HTTP Keep-Alive
            proxyReq.setHeader('Connection', 'keep-alive');
            // 设置 Keep-Alive 参数：timeout=65s, max=1000
            proxyReq.setHeader('Keep-Alive', 'timeout=65, max=1000');
          });
          
          // 监听代理错误（用于调试）
          proxy.on('error', (err, _req, _res) => {
            console.error('[Vite Proxy Error]', err);
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'antd-vendor': ['antd', '@ant-design/icons'],
          'echarts-vendor': ['echarts', 'echarts-for-react'],
        },
      },
    },
  },
});
