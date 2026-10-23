<p align="center">
  <img src="docs/images/logo.png" alt="BiliDude" width="360">
</p>

<h3 align="center">A little TV helper in your side panel</h3>

<p align="center">
  Recaps, tables of contents and top quotes, with timestamps to back them up
</p>

<p align="center">
  <a href="../../releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/Hariketsu/bilidude?color=00A1D6"></a>
  <a href="../../actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Hariketsu/bilidude/ci.yml?branch=master&label=CI"></a>
  <img alt="Chrome" src="https://img.shields.io/badge/Chrome-side%20panel-00A1D6?logo=googlechrome&logoColor=white">
  <img alt="Bilibili" src="https://img.shields.io/badge/bilibili-video-FB7299?logo=bilibili&logoColor=white">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-GPL--3.0-075B91"></a>
</p>

<p align="center">
  <img alt="DeepSeek" src="https://img.shields.io/badge/DeepSeek-4D6BFE?logo=deepseek&logoColor=white">
  <img alt="OpenAI" src="https://img.shields.io/badge/OpenAI-412991">
  <img alt="Anthropic" src="https://img.shields.io/badge/Anthropic-191919?logo=anthropic&logoColor=white">
  <img alt="Gemini" src="https://img.shields.io/badge/Gemini-8E75B2?logo=googlegemini&logoColor=white">
  <img alt="OpenRouter" src="https://img.shields.io/badge/OpenRouter-6566F1?logo=openrouter&logoColor=white">
  <img alt="Ollama" src="https://img.shields.io/badge/Ollama-000000?logo=ollama&logoColor=white">
</p>

<p align="center">
  <a href="README.md">简体中文</a> | <b>English</b>
</p>

![BiliDude screenshot](docs/images/screenshot.jpg)

BiliDude is a Chrome extension. It reads the subtitles of the video you are watching, hands them to the model you choose, and answers questions about the video. Ask for a recap, a table of contents or the top quotes in one click, or just ask. Click a timestamp in the answer and the video jumps there.

Videos without subtitles can be transcribed from their audio first.

## Installation

BiliDude is not on the Chrome Web Store yet. For now, install it by hand:

1. Download the latest `bilidude-*-chrome.zip` from [Releases](../../releases) and unzip it.
2. Open `chrome://extensions` and turn on "Developer mode" in the top right.
3. Click "Load unpacked" and select the unzipped folder.

It needs Chrome or another Chromium browser with side panel support. Firefox and Safari are not supported.

## Usage

Click the toolbar icon to open the side panel. The first time, pick a model provider and paste your API key. DeepSeek, OpenAI, Anthropic, Google Gemini and OpenRouter are built in, and any OpenAI-compatible endpoint works too, such as a local LM Studio, Strata or Ollama.

Every provider's base URL can be changed, to reach a proxy or gateway that speaks the same protocol: DeepSeek and OpenRouter use OpenAI Chat Completions, Anthropic the Messages API, Gemini the Gemini API. With a custom base URL, OpenAI can use either Responses or Chat Completions. For a model that isn't listed, choose "Other…" and type its model ID.

Bilibili only serves its AI subtitles to logged-in users, so log in to bilibili.com in the same browser.

Turn on audio transcription in Settings. Besides Bilibili's Bcut, you can use OpenAI, Groq, Alibaba Cloud Model Studio, SiliconFlow or an OpenAI-compatible service.

The interface comes in Simplified Chinese, Traditional Chinese and English, and the answer language can be set separately.

## Privacy

BiliDude has no server and collects no data. API keys are stored only in your browser.

When you ask a question, the video's title, description, chapters, subtitles and the conversation so far go to the model provider you chose. When a video is transcribed, its audio goes to the transcription service you chose. Conversations and subtitles are stored in your browser.

## FAQ

<details>
<summary>It says the video is too long for the model</summary>

The whole transcript is sent to the model at once. Switch to a model with a longer context window; many models now take 1M tokens.
</details>

<details>
<summary>Bcut says this network is rate-limited</summary>

Bilibili limits how often one network can call Bcut. Try again later, or switch to another transcription service in Settings.
</details>

<details>
<summary>Which pages are supported</summary>

Regular videos on bilibili.com (`/video/BV…` and `/video/av…`, including multi-part videos) and `/list/…` playlists. Bangumi, courses, live streams and bilibili.tv are not supported yet.
</details>

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) (in Chinese).

## Acknowledgments

- [BiliScript](https://github.com/Edmund724/BiliScript): reference for the audio pipeline and AAC extraction.
- [bcut-asr](https://github.com/SocialSisterYi/bcut-asr): reference for Bcut speech recognition.
- [Bilitato](https://github.com/erikzhuang55/Bilitato): reference for subtitle and transcription handling.
- [pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai) and [WXT](https://wxt.dev): LLM and framework.

## Disclaimer

This project is not affiliated with Bilibili.

## Star History

<a href="https://star-history.com/#Hariketsu/bilidude&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Hariketsu/bilidude&type=Date&theme=dark">
    <img alt="Star History" src="https://api.star-history.com/svg?repos=Hariketsu/bilidude&type=Date">
  </picture>
</a>

## License

[GPL-3.0](LICENSE). Code adapted from MIT-licensed projects is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
