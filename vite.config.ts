import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { practiceSourceServer } from './practice-source-server.mjs';
export default defineConfig({
  plugins: [react(), tailwindcss(), practiceSourceServer()],
  server: { watch: { ignored: ['**/.local/**'] } },
  build: { chunkSizeWarningLimit: 900 },
});
