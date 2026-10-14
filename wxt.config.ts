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
    host_permissions: [
      '*://www.bilibili.com/*',
      '*://api.bilibili.com/*',
      '*://*.hdslb.com/*',
      // Built-in LLM providers (lib/llm/providers.ts)
      'https://api.openai.com/*',
      'https://api.anthropic.com/*',
      'https://generativelanguage.googleapis.com/*',
      'https://openrouter.ai/*',
      'https://api.deepseek.com/*',
    ],
    // Custom OpenAI-compatible endpoints, requested when saved.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    action: {},
  },
});
