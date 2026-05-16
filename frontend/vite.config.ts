import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // VITE_DEV_API_PROXY points at the dev API Gateway invoke URL
  // (e.g. https://abc123.execute-api.us-east-1.amazonaws.com) so the local SPA
  // can call /api/admin/* without CORS hassle.
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_DEV_API_PROXY ?? 'https://example.execute-api.us-east-1.amazonaws.com';

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
        },
      },
    },
    build: {
      sourcemap: true,
      outDir: 'dist',
    },
  };
});
