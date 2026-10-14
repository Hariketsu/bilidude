const AUDIO_REFERER_RULE = 1;
const BCUT_ORIGIN_RULE = 2;

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel.
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(console.error);

  // Header fixes fetch() can't make itself, for this extension's own requests only. Session rules
  // are cleared when the browser restarts, so they are re-added whenever the worker starts.
  browser.declarativeNetRequest
    .updateSessionRules({
      removeRuleIds: [AUDIO_REFERER_RULE, BCUT_ORIGIN_RULE],
      addRules: [
        {
          // The audio CDN rejects requests without a bilibili.com Referer.
          id: AUDIO_REFERER_RULE,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [{ header: 'Referer', operation: 'set', value: 'https://www.bilibili.com/' }],
          },
          condition: {
            requestDomains: ['bilivideo.com', 'bilivideo.cn'],
            initiatorDomains: [browser.runtime.id],
            resourceTypes: ['xmlhttprequest'],
          },
        },
        {
          // The Bcut speech recognition API answers 412 to a chrome-extension:// Origin.
          id: BCUT_ORIGIN_RULE,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [{ header: 'Origin', operation: 'set', value: 'https://www.bilibili.com' }],
          },
          condition: {
            requestDomains: ['member.bilibili.com'],
            initiatorDomains: [browser.runtime.id],
            resourceTypes: ['xmlhttprequest'],
          },
        },
      ],
    })
    .catch(console.error);
});
