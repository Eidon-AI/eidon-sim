// vite.config.ts
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    server: { port: 5173 },
    preview: { port: 8080 },
    define: {
      'import.meta.env.VITE_AUTH_URL': JSON.stringify(env.VITE_AUTH_URL || (() => { throw new Error('VITE_AUTH_URL environment variable is required') })()),
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || (() => { throw new Error('VITE_API_URL environment variable is required') })()),
    }
  };
});
