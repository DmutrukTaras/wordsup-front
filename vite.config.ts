import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  
  server: {
    allowedHosts: [
      '.loca.lt',
    ],
    port: 5173,
  }
});
