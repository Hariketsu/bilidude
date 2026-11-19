import { fakeBrowser } from 'wxt/testing/fake-browser';

// Not implemented by the fake browser; lib/i18n reads it at import time.
fakeBrowser.i18n.getUILanguage = () => 'en';
