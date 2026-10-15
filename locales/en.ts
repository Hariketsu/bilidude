// Source strings. zh-CN and zh-TW must have the same keys (checked by their type).
const en = {
  topBar: {
    newChat: 'New chat',
    history: 'History',
    settings: 'Settings',
  },
  common: {
    back: 'Back',
  },
  empty: {
    openVideo: 'Open a Bilibili video to start',
    loadFailed: "Couldn't load this video: {{error}}",
  },
  setup: {
    title: 'Connect a model',
    subtitle: 'bilidude answers with your own API key.',
    connect: 'Connect',
  },
  presets: {
    recap: 'Recap',
    toc: 'Table of Contents',
    quotes: 'Top Quotes',
  },
  composer: {
    askAboutVideo: 'Ask a question about this video…',
    askAnother: 'Ask another question…',
    removePreset: 'Remove preset',
    send: 'Send',
    stop: 'Stop',
  },
  thinking: {
    label: 'Thinking',
    levels: {
      off: 'Off',
      minimal: 'Minimal',
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      xhigh: 'Extra high',
      max: 'Max',
    },
  },
  answer: {
    thinking: 'Thinking…',
    transcribing: 'Transcribing…',
    readingAttachment: 'Reading 1 attachment',
    noSubtitles: 'No subtitles, so the audio is being transcribed.',
    downloading: 'Downloading audio',
    downloadingPercent: 'Downloading audio · {{percent}}%',
    transcribingProgress: 'Transcribing audio · {{done}}/{{total}}',
    thoughtFor_one: 'Thought for {{count}} second',
    thoughtFor_other: 'Thought for {{count}} seconds',
    stopped: 'Stopped.',
    copy: 'Copy',
    regenerate: 'Regenerate',
  },
  errors: {
    noModel: 'Set up a model in Settings first.',
    subtitles: "Couldn't load subtitles: {{error}}",
    noSubtitles: 'This video has no subtitles. Turn on audio transcription in Settings to ask about it.',
    transcription: "Couldn't transcribe the audio: {{error}}",
    tooLong: 'This video is too long for {{model}}. Choose a model with a larger context window.',
    modelError: 'The model returned an error.',
    noPlayableParts: 'This video has no playable parts.',
    noAudioTrack: 'This video has no audio track that can be transcribed.',
    noSpeech: 'No speech was recognized in this video.',
    bcutRateLimited:
      "Bilibili's free speech recognition is rate-limiting this network. Try again later, or choose another service in Settings.",
  },
  history: {
    title: 'History',
    empty: 'No conversations yet',
    delete: 'Delete',
    justNow: 'just now',
  },
  settings: {
    title: 'Settings',
    model: {
      title: 'Model',
      provider: 'Provider',
      baseUrl: 'Base URL',
      apiKey: 'API key',
      model: 'Model',
      modelId: 'Model ID',
      chooseModel: 'Choose a model',
      required: 'Required',
      keyNote: 'Your key is stored only in this browser and sent only to the provider you choose.',
      customProvider: 'Custom (OpenAI-compatible)',
    },
    host: {
      invalidUrl: 'Enter a valid base URL, e.g. https://api.example.com/v1',
      needsAccess: 'bilidude needs access to {{origin}} to call this endpoint.',
      allow: 'Allow access',
    },
    transcription: {
      title: 'Audio transcription',
      enable: 'Transcribe videos without subtitles',
      service: 'Service',
      bcut: 'Bilibili Bcut (free)',
      dashscope: 'Alibaba Cloud Model Studio',
      bcutNote: "Uses the speech recognition behind Bilibili's Bcut editor. No key needed; the audio is uploaded to Bilibili.",
      noTimestamps: 'This service returns text without timestamps, so cited times are estimates.',
      region: 'Region',
      regions: {
        'cn-beijing': 'China (Beijing)',
        'ap-southeast-1': 'Singapore',
      },
      workspace: 'Workspace ID',
      optional: 'Optional',
      incomplete: 'Fill in the fields above to use this service.',
      start: 'Start transcribing',
      triggers: {
        ask: 'When I ask',
        open: 'When the video opens',
      },
    },
    general: {
      title: 'General',
      interfaceLanguage: 'Language',
      answerLanguage: 'Answer language',
      followBrowser: 'Same as browser',
      followInterface: 'Same as interface',
      openingVideo: 'Opening a video',
      policies: {
        new: 'New conversation',
        resume: 'Continue the last one',
      },
      theme: 'Theme',
      themes: {
        system: 'System',
        light: 'Light',
        dark: 'Dark',
      },
    },
  },
};

export default en;

/** Same shape as the English strings, every value a string. */
export type Messages = typeof en;
