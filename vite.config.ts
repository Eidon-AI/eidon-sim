// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
  preview: { port: 8080 },
  define: {
    'import.meta.env.VITE_AUTH_URL': JSON.stringify(process.env.AUTH_URL || 'https://auth.eidon.ai'),
  }
});
