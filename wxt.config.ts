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
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // declarativeNetRequestWithHostAccess: sets the Referer the audio CDN requires (entrypoints/background.ts).
    permissions: ['sidePanel', 'storage', 'scripting', 'declarativeNetRequestWithHostAccess'],
    host_permissions: [
      '*://www.bilibili.com/*',
      '*://api.bilibili.com/*',
      '*://*.hdslb.com/*',
      // Audio for speech recognition, and Bilibili's free Bcut recognition service
      '*://*.bilivideo.com/*',
      '*://*.bilivideo.cn/*',
      'https://member.bilibili.com/*',
      '*://*.biliapi.net/*', // upload URLs are plain http
      // Built-in LLM providers (lib/llm/providers.ts)
      'https://api.openai.com/*',
      'https://api.anthropic.com/*',
      'https://generativelanguage.googleapis.com/*',
      'https://openrouter.ai/*',
      'https://api.deepseek.com/*',
      // Built-in ASR providers (lib/asr/providers.ts)
      'https://api.groq.com/*',
      'https://api.siliconflow.cn/*',
      'https://dashscope.aliyuncs.com/*',
      'https://dashscope-intl.aliyuncs.com/*',
      'https://*.maas.aliyuncs.com/*',
    ],
    // Custom OpenAI-compatible endpoints, requested when saved.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    action: {},
  },
});
