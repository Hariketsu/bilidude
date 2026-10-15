<p align="center">
  <!-- TODO: logo -->
</p>

<h1 align="center">BiliDude</h1>

<p align="center">像读文章一样读懂 B 站视频，每个时间戳都能点开核对。</p>

<p align="center">
  <a href="README.md">English</a> | <b>简体中文</b>
</p>

<p align="center">
  <img alt="License: GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-blue">
  <img alt="Chrome Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white">
  <img alt="自带 API Key" src="https://img.shields.io/badge/LLM-%E8%87%AA%E5%B8%A6%20API%20Key-6E56CF">
</p>

## 👋 介绍

BiliDude 住在 Chrome 的侧边栏里，就在你正在看的 B 站视频旁边。让它做个回顾、列个目录或者挑出金句，你得到的是一篇可以读的文字，而不是一块功能面板：每个要点配一段简短解释，句末带着时间戳。点一下，视频就跳到那里，你可以亲耳确认。

它用你的语言回答。中文视频可以用英文总结，引用保留说话人的原话，下面附上译文。

> [!IMPORTANT]
> BiliDude 是非官方的社区项目，与哔哩哔哩没有任何关联，也未获其认可。
> 回答由你选择的 AI 模型生成，使用的是你自己的 API Key。

## ✨ 功能

- **一键开始**：*总结*、*目录*、*金句*，也可以直接提问。
- **可信的时间戳**：每个引用的时间都会和字幕核对，对齐到所在的那一行，字幕里不存在的时间直接丢弃。在字幕里找不到原文的“引用”会显示成普通文字，不会当作说话人的原话。
- **知道你看到哪了**：追问时会带上当前播放位置，所以可以问“他刚才说的是什么意思”。
- **任意语言**：界面支持英文、简体中文和繁体中文；回答语言默认跟随界面语言，也可以自己指定。
- **没有字幕的视频**：可以用 B 站必剪的免费语音识别转写音频，也可以用 OpenAI、Groq、阿里云百炼、硅基流动或任何 OpenAI 兼容服务。
- **历史记录**：对话按视频保存在你的浏览器里，随时可以重新打开。
- **模型随你选**：OpenAI、Anthropic、Google Gemini、OpenRouter、DeepSeek，或任何 OpenAI 兼容接口。默认不开启思考，回答更快；需要时可以在输入框旁调高思考强度。
- **亮色和暗色**：跟随系统，也可以手动切换。

<!-- TODO: 截图
| Recap | Table of Contents | Top Quotes |
| :---: | :---: | :---: |
| <img src="docs/images/recap.png" width="260"> | <img src="docs/images/toc.png" width="260"> | <img src="docs/images/quotes.png" width="260"> |
-->

## ⬇️ 安装

BiliDude 支持 Chrome 及其他支持侧边栏的 Chromium 浏览器，不支持 Firefox 和 Safari。

### Chrome 应用商店

> [!NOTE]
> 即将上架。<!-- TODO: 商店链接 -->

### 从 Release 安装

1. 在 [Releases](../../releases) 下载最新的 `bilidude-*-chrome.zip` 并解压。
2. 打开 `chrome://extensions`，打开右上角的**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择解压后的文件夹。

### 从源码构建

见[开发](#%EF%B8%8F-开发)。

## 🚀 快速上手

1. 点击工具栏里的 BiliDude 图标打开侧边栏，建议把图标固定在工具栏上。
2. **连接模型**：选择服务商，粘贴 API Key，选一个模型。
3. 在 [bilibili.com](https://www.bilibili.com) 打开一个视频，点 *总结*、*目录* 或 *金句*，或者直接提问。

> [!TIP]
> 请在同一个浏览器里保持 B 站登录。B 站只向登录用户提供 AI 字幕，没有字幕时 BiliDude 只能转写音频。

## ⚙️ 设置

点侧边栏右上角的齿轮图标打开。修改会立即保存。

| 设置项 | 作用 |
| --- | --- |
| **模型** | 用来写回答的服务商、API 密钥和模型，以及模型先思考多少（默认关闭，也可以在输入框旁切换）。 |
| **语音转写** | 默认关闭。打开后，没有字幕的视频会被转写：可以选在提问时开始，或者在打开视频时就开始。 |
| **通用 → 语言** | 界面语言：English、简体中文或繁體中文，默认跟随浏览器语言。 |
| **通用 → 回答语言** | 回答使用的语言，默认跟随界面语言。 |
| **通用 → 打开视频时** | 新建对话，还是继续上次关于它的对话。 |
| **通用 → 主题** | 跟随系统、浅色或深色。 |

### 模型服务商

| 服务商 | 说明 |
| --- | --- |
| OpenAI、Anthropic、Google Gemini、OpenRouter、DeepSeek | 从内置的模型列表里选择。 |
| 自定义（OpenAI 兼容） | 任何支持 OpenAI Chat Completions 接口的服务，比如本地的 Ollama 或 LM Studio。BiliDude 会请求访问该地址的权限（设置里的「允许访问」）。 |

每次提问都会发送整份字幕，看长视频时请选上下文窗口大的模型。

### 转写服务

| 服务 | Key | 时间戳 | 说明 |
| --- | :---: | :---: | --- |
| **B 站必剪**（默认） | 不需要 | ✅ | B 站必剪剪辑器背后的免费语音识别。按网络限流，被拒绝时请稍后再试或换一个服务。 |
| OpenAI | 需要 | ✅ | 默认 `whisper-1`。 |
| Groq | 需要 | ✅ | 默认 `whisper-large-v3-turbo`，速度快，有免费额度。 |
| 阿里云百炼 | 需要 | ✅ | 默认 `fun-asr-flash-2026-06-15`，支持北京或新加坡地域，业务空间 ID 可选。 |
| 硅基流动 | 需要 | ≈ | 只返回文本，时间是估算的，误差在几秒以内。 |
| 自定义（OpenAI 兼容） | 需要 | ✅ | 调用 `/audio/transcriptions`。如果接口不返回 `verbose_json` 时间戳，时间会是估算的。 |

已经转写完的部分会被缓存，转写到一半关掉侧边栏也不会白做。

## 🔒 隐私与权限

BiliDude 没有自己的服务器，也不收集任何统计数据。

- **API Key** 只保存在当前浏览器里（`chrome.storage.local`），只发送给它所属的服务商。
- **提问时**，视频的标题、简介、章节和字幕，连同你的问题和此前的对话，会发送给你选择的模型服务商。
- **转写时**，视频的音频会发送给你选择的转写服务。用必剪时，就是发给 B 站。
- **对话和字幕**保存在本地的 IndexedDB 里，可以在历史列表里删除对话。

| 权限 | 用途 |
| --- | --- |
| `sidePanel` | 在 Chrome 侧边栏里显示 BiliDude。 |
| `storage` | 保存你的设置。 |
| `scripting` | 读取播放进度，以及点击时间戳时跳转播放器，仅限 B 站标签页。 |
| `declarativeNetRequestWithHostAccess` | 给 BiliDude 自己发出的请求补上 B 站服务器要求的请求头：音频 CDN 的 `Referer`、必剪的 `Origin`。不影响其他任何请求。 |
| B 站相关域名（`www`/`api`/`member.bilibili.com`、`*.hdslb.com`、`*.bilivideo.com`/`.cn`、`*.biliapi.net`） | 获取视频信息、字幕、音频，以及必剪转写。 |
| 内置的模型和转写服务商 | 调用你配置的接口。 |
| 其他网站（可选） | 只在你配置自定义接口时请求，且只针对该接口。 |

## ❓ 常见问题

<details>
<summary>提示“This video has no subtitles”，但播放器里明明有字幕。</summary>

B 站只向登录用户提供 AI 字幕。请在同一个浏览器里登录 bilibili.com 后再问一次，或者在设置里打开音频转写。
</details>

<details>
<summary>为什么要自己提供 API Key？</summary>

BiliDude 没有服务器，也不替你付费，Key 直接从你的浏览器发给服务商。Groq、DeepSeek、OpenRouter 等服务商都有免费额度或很低的价格。
</details>

<details>
<summary>提示视频太长，当前模型放不下。</summary>

整份字幕需要放进模型的上下文窗口。请换一个窗口更大的模型（如今不少模型支持 100 万 token）。让小窗口模型也能处理超长视频的功能已在计划中。
</details>

<details>
<summary>必剪转写提示当前网络被限流。</summary>

B 站限制了同一网络调用免费语音识别的频率。请过一段时间再试，或者换一个转写服务。
</details>

<details>
<summary>处理过程中关掉侧边栏会怎样？</summary>

正在生成的回答会停止，并保存为“已停止”，之后可以重新生成。已经转写完的部分会保留，下次从中断处继续。
</details>

<details>
<summary>支持哪些页面？</summary>

bilibili.com 上的视频：`/video/BV…` 和 `/video/av…` 链接（包括用 `?p=` 指定分 P），以及 `/list/…` 播放列表。番剧、课程、直播和 bilibili.tv 暂不支持。
</details>

## 🛠️ 开发

BiliDude 基于 [WXT](https://wxt.dev)、React、Tailwind CSS 和 [pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai) 构建。

环境要求：Node.js 22 及以上，[pnpm](https://pnpm.io)。

```bash
pnpm install
pnpm dev        # 打开加载了扩展的 Chrome，改动后自动重载
pnpm build      # 构建到 .output/chrome-mv3（用“加载已解压的扩展程序”加载）
pnpm zip        # 打包构建产物用于发布
pnpm compile    # 类型检查
```

### 端到端测试

测试用 [Playwright](https://playwright.dev) 把构建好的扩展加载进 Chromium。测试会打开真实的 B 站页面，需要能访问 bilibili.com。

```bash
pnpm exec playwright install chromium   # 只需一次
cp .env.example .env.local              # 可选：填入真实的 API Key，见下文
pnpm test:e2e                           # 先构建，再运行全部测试
```

- 大部分测试会模拟字幕、模型和转写接口，始终运行。
- 调用真实 API 的测试只在 `.env.local` 里配置后才运行（见 [`.env.example`](.env.example)）：`tests/e2e/llm.spec.ts` 测模型服务商，`tests/e2e/asr.spec.ts` 的最后一个用例测转写服务。必剪也需要手动开启，因为它按网络限流。
- 真实模型的回答会附在 HTML 报告里：`pnpm exec playwright show-report`。

### 项目结构

```
entrypoints/
  background.ts         打开侧边栏，注册请求头规则
  sidepanel/            应用本体：App.tsx、useChat（回答）、useActiveVideo（跟踪标签页）
components/             界面组件
lib/
  bili/                 B 站链接解析与 Web API
  transcript.ts         字幕加载与合并
  llm/                  模型服务商（pi-ai）与 prompt
  asr/                  音频下载、AAC 切片、转写服务
  citations.ts          时间戳与引文校验
  db.ts                 IndexedDB：对话、字幕、转写缓存
tests/e2e/              Playwright 测试
docs/DESIGN.md          设计说明与决策记录
```

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org)。计划中的工作见 [TODO.md](TODO.md)。

## 🙏 致谢

- [BiliScript](https://github.com/Edmund724/BiliScript)：它的音频处理流程和长视频方面的经验影响了我们的设计，AAC 提取代码改编自它。
- [bcut-asr](https://github.com/SocialSisterYi/bcut-asr)：必剪语音识别的客户端移植自它。
- [Bilitato](https://github.com/erikzhuang55/Bilitato)：字幕与转写处理方面的参考。
- [pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai)：用同一套接口调用各家模型。
- [WXT](https://wxt.dev)：浏览器扩展框架。

## ⚖️ 免责声明

BiliDude 使用了 B 站公开的 Web 接口，以及 B 站必剪剪辑器的内部接口。这些接口并未面向第三方公开文档，随时可能变化或失效。请在遵守 B 站用户协议的前提下使用。AI 生成的回答可能出错，时间戳正是为了方便你核对。

## 📄 许可证

[GPL-3.0](LICENSE)。改编自 MIT 许可项目的代码见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
