import { defineConfig } from 'vite';

export default defineConfig({
  base: '/moonfall/',
  server: {
    allowedHosts: ['.ngrok-free.dev', '.ngrok.app'],
  },
});
