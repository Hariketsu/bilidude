import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'bilidude',
    description: 'Dia-style AI side panel for Bilibili videos',
    permissions: ['sidePanel', 'storage', 'scripting'],
    host_permissions: ['*://www.bilibili.com/*', '*://api.bilibili.com/*', '*://*.hdslb.com/*'],
    action: {},
  },
});
