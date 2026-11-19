import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const { PLANTCARE_API_TARGET = 'http://localhost:3000' } = loadEnv(mode, '.', 'PLANTCARE_');
  const proxy = {
    '/api': PLANTCARE_API_TARGET,
    '/docs': PLANTCARE_API_TARGET,
    '/openapi.json': PLANTCARE_API_TARGET,
    '/health': PLANTCARE_API_TARGET,
  };

  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
  };
});
