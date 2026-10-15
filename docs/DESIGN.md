# bilidude 设计文档

> 状态：草案 · 2026-10-15

## 1. 目标与非目标

**目标**：在 Chrome Side Panel 里，为 bilibili.com 视频提供 Dia 式的 AI 体验——输出是一篇可读的回答，论断带可点击的时间戳，点击回到视频验证。

**用户画像**：已登录 B 站的用户（含海外用户），自带 LLM API Key（BYOK）。

**MVP 范围**

- Side Panel：附件卡片、三个预设（Recap / Table of Contents / Top Quotes）、自由追问
- 流式 Markdown 回答，时间戳 chip 点击跳转
- 播放位置感知（「他刚才说的是什么意思」）
- 字幕获取（CC / AI 字幕，识别分 P）；无字幕时自动 ASR（需在设置里配置并启用）
- 持久化历史列表
- 首次引导（BYOK 配置）、设置（模型、输出语言、ASR、主题、会话策略）
- 白天 / 夜间模式

**非目标（MVP）**：bilibili.tv、番剧 / 课程页、下载、导出、多视频会话、长视频 Map-Reduce（见 `TODO.md`）。

## 2. 交互设计

参考 Dia 截图，只借交互与视觉，不借 ref/ 项目的前端。

### 2.1 布局

```
┌──────────────────────────────────┐
│ [✎ 新会话]           [⟲ 历史] [⚙] │  顶栏
├──────────────────────────────────┤
│                    ┌───────────┐ │
│                    │▶ 标题…    │ │  用户消息：附件卡片 + 气泡
│                    │ bilibili  │ │
│                    └───────────┘ │
│                      ( ≡ Recap ) │
│                                  │
│ Thought for 7 seconds >          │  推理步骤（可折叠）
│ # 一句话结论                      │
│ 正文……  [▶ 03:12]                │  时间戳 chip
│ > "原文引用" [▶ 05:40]           │
│   译文                           │
│ ⧉ ↻                               │  回答操作
├──────────────────────────────────┤
│ (≡ Recap) (▤ TOC) (❝ Quotes)    │  预设（仅空会话显示）
│ ┌──────────────────────────────┐ │
│ │ ┌────────────┐               │ │
│ │ │▶ 标题… b站 │  附件卡片      │ │
│ │ └────────────┘               │ │
│ │ Ask a question about this…  ↑│ │  输入框
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

- **附件卡片**：当前视频的封面缩略图（或 B 站图标）+ 标题（截断）+ `bilibili.com`。只在会话首条消息前显示在输入框内；发送后随消息进入右侧气泡，输入框占位文案变为 “Ask another question…”。
- **预设**：点击后在输入框里变成一个预设 chip（如 Dia 截图 2），可以再补充文字后发送；发送后作为用户消息气泡展示 chip。
- **推理步骤**：回答生成前按阶段显示，生成后折叠为 “Thought for N seconds >”。阶段：
  - `Reading 1 attachment`（拉元数据与字幕）
  - `No subtitles · Transcribing audio 3/7`（ASR）
  - `Thinking…`（模型 thinking 流实时滚动显示最后几行，顶部渐隐；完成后可展开看全文）
- **打字效果**：provider 的文本是成批到达的（DeepSeek 思考完后一两秒内吐出全部正文），所以正文按稳定节奏逐字显示：至少每帧 1 字，积压越多越快（约 0.5 秒追平）。显示追上之前 `data-status` 仍是 `streaming`，复制 / 重新生成按钮也不出现。恢复的历史会话直接整段显示。
- **时间戳 chip**：小号圆角胶囊，B 站粉色播放图标 + `mm:ss`（补零，如 `00:05`；≥1 小时为 `h:mm:ss`）。点击跳转，当前 tab 不是该视频时在当前 tab 打开该视频并定位。
- **回答操作**：复制（时间戳转成文本）、重新生成。
- **空状态**：当前 tab 不是视频页时，附件卡片与预设隐藏，中间显示 “Open a Bilibili video to start”。

### 2.2 白天 / 夜间模式

- 颜色全部走 CSS 变量（`entrypoints/sidepanel/style.css`），Tailwind 通过 `dark` class 切换。
- 设置项：`system`（默认）/ `light` / `dark`；`lib/theme.ts` 的 `applyTheme` 负责应用并在 `system` 下跟随系统。
- 夜间配色取自 Dia；白天配色同结构另一套取值。组件里不写死颜色。

## 3. 架构

### 3.1 运行上下文

| 上下文 | 职责 |
|---|---|
| **Side Panel**（扩展页） | 全部 UI；会话状态；识别当前视频（读 active tab 的 URL）；跳转与读取播放位置（`scripting.executeScript`）；调用 LLM（pi-ai 直连 provider）；调用 B 站 API；读写 IndexedDB |
| **Background SW** | 打开 side panel；注册网络规则（音频 CDN 的 Referer、必剪接口的 Origin） |

为什么 LLM 调用放在 side panel：扩展页直连 provider 不受 CORS 预检限制、也不受 SW 生命周期限制（BiliScript ADR-0010 踩过这两个坑）。代价：关闭面板会中断生成，已生成部分保存为 `aborted`，可一键重新生成（已确认接受）。

### 3.2 不用 content script

- **识别视频**：side panel 读本窗口 active tab 的 URL（B 站 host 权限即可读到），监听 `tabs.onActivated` 与 `tabs.onUpdated`（B 站换片只改 URL，同样触发）。
- **跳转 / 播放位置**：`scripting.executeScript` 在页面里直接读写 `video.currentTime`。不依赖常驻脚本，扩展更新后已打开的页面也能用。

### 3.3 目录结构（计划）

```
entrypoints/
  background.ts
  sidepanel/            UI 入口
components/             React 组件
lib/
  bili/                 B 站 API（view、player、playurl）
  transcript/           字幕获取、规整、行号格式
  asr/                  切片、WAV 编码、ASR 适配器
  llm/                  pi-ai 封装、prompt、预算
  render/               引用协议解析与校验
  db/                   IndexedDB（会话、字幕缓存）
  settings.ts
  theme.ts
```

## 4. 视频识别

- 支持 URL：`/video/BVxxx?p=N`、旧式 `/video/av123?p=N`、`/list/...?bvid=BVxxx&p=N`。av 号在本地按 B 站算法换算成 BV 号（覆盖 2^51 以内的全部 aid），两种链接对应同一个视频身份。
- `cid`：调 `x/web-interface/view?bvid=` 拿 `pages[]`，按 `p` 取 `cid`（同时拿到标题、UP 主、简介、封面、时长、分 P 标题）。
- B 站是 SPA：换片 / 换 P 只改 URL，由 `tabs.onUpdated` 感知（§3.2）。
- **视频身份 = `bvid + cid`**，会话、字幕缓存、ASR 缓存都以此为键。

## 5. 字幕获取

1. `x/player/wbi/v2?aid&cid&bvid` → `subtitle.subtitles[]`；失败回退 `x/player/v2`（与 BiliScript 一致，不做 w_rid 签名）。
2. 选轨：与视频原语言匹配的人工字幕 > AI 字幕（`ai-*`）> 其他。轨道 id 用 `id_str`（`id` 超出 2^53）。
3. 拉 `subtitle_url`（可能以 `//` 开头，补 `https:`）的 JSON → `{from, to, content}[]`。
4. **时长校验**：最后一条字幕 `to` 明显超过视频时长时视为串轨（B 站接口偶发返回别的视频的字幕），丢弃。
5. 章节：`view_points`（官方章节）与简介里的作者时间轴（正则解析），作为元数据交给模型。
6. 全部为空 → 进入 ASR（§6）或提示无字幕。

请求在 side panel 里直接发，`credentials: 'include'` 带登录态（需要 `*://api.bilibili.com/*`、`*://*.hdslb.com/*` host 权限）。

### 5.1 规整

- 合并相邻短句为约 10 秒一行（不跨章节边界），去掉空行与重复行。
- 发给模型的格式（时间格式与 chip 显示一致）：

```
[03:05] 这一段讲的是……
[03:14] 接下来……
```

## 6. ASR

- **触发**：当前视频无可用字幕，且设置里 ASR 已启用时自动开始。时机是设置项：默认「首次提问时」（推理步骤显示进度）；可选「面板打开时」（面板在该视频上打开，或面板开着时切到该视频）。面板未打开时从不转写。
- **宿主：side panel**（已确认，替代原 offscreen 方案）。关闭面板即中断，但已完成的分片按 `bvid:cid:provider:model:片长:序号` 存 IndexedDB，下次从断点继续。同一视频同时只有一个转写任务，提问方共享其进度。
- **音频**：`x/player/playurl?fnval=16` 取 DASH 音轨，只选 **AAC-LC**（`mp4a.40.2`）里码率最低的一条——最低码率常是 HE-AAC（`mp4a.40.5`），其帧不能直接包成普通 ADTS。CDN 地址 `*.bilivideo.com` 优先（PCDN 节点更易失败）。CDN 要求 bilibili.com 的 Referer，由 background 注册的 session 网络规则补上，只作用于本扩展发起的请求。
- **切片**：fMP4 → AAC 帧（加 ADTS 头，参考 BiliScript `asr/adts.ts`）→ 按帧数切片，切片不需要解码。片长：必剪 10 分钟；有时间戳的服务 5 分钟（DashScope 单次上限）；无时间戳的服务 1 分钟。
- **服务**：
  - **必剪（免费，默认）**：B 站必剪的语音识别（移植自 bcut-asr）：申请上传 → 分片 PUT（读 ETag）→ 提交 → 建任务 → 轮询（2s 起逐步退到 10s）。直接上传 AAC。接口拒绝 `chrome-extension://` Origin（412），由网络规则改写为 `https://www.bilibili.com`。**按 IP 风控**：请求过密会整段时间返回 412，此时明确提示稍后再试或换服务，不自动重试。
  - **OpenAI 兼容**（OpenAI whisper-1、Groq whisper-large-v3-turbo、自定义）：每片分 ~40 秒段解码为 16kHz 单声道（Chrome 解码过长 ADTS 会失败），编码 WAV，`/audio/transcriptions` + `verbose_json` 取句级时间戳。
  - **阿里云百炼**：HTTP 非实时接口（默认 `fun-asr-flash-2026-06-15`），AAC 直接以 base64 data URI 上传，`X-DashScope-SSE: enable` 收各句 `sentence_end` 结果（毫秒时间戳）。支持业务空间域名或共享域名。实时 WebSocket 模型不接：浏览器 WebSocket 不能带 `Authorization` 头，且须按实时速度推流。
  - **硅基流动**：只返回文本。按标点切句，按字数比例在 1 分钟片内估算时间；字幕标记为时间近似，prompt 中告知模型。
- **合并**：片内时间加片偏移 → 与字幕同一套规整（§5.1）→ 存为该视频的字幕（`source: 'asr'`）。
- **失败**：单片网络错误 / 5xx / 429 重试 2 次；其余错误直接显示在回答里。

## 7. LLM 层

- `@earendil-works/pi-ai`，按 provider 子路径导入以控制体积；`models.stream()` 流式，`AbortController` 支持停止。
- **BYOK**：Key 按 provider 存 `chrome.storage.local`（不进 sync），每次请求显式传 `apiKey`，不用 pi-ai 的 `CredentialStore`。
- **Provider 列表**：MVP 内置 OpenAI、Anthropic、Google、OpenRouter、DeepSeek（`createModels` 只注册这几个），加「自定义 OpenAI 兼容端点」（直接调 `openai-completions` API 实现，上下文窗口按 128k 估）。模型下拉用 pi-ai 的模型目录，不预设默认模型（目录按字母排序，模型 id 也会过时）。
- **Host 权限**：内置 provider 的域名写进 `host_permissions`；自定义 baseUrl 走 `optional_host_permissions` 运行时申请。
- **Thinking**：用户选思考强度，默认关闭（实测 DeepSeek V4.1 Flash 做 Recap：关闭约 2 秒出完，low / high 都要先思考约 8 秒，总结类任务质量差别不大）。只存一个偏好值 `llm.thinking`，输入框旁的按钮直接改它；档位列表来自 pi-ai `getSupportedThinkingLevels`，请求时用 `clampThinkingLevel` 对齐到当前模型支持的档位（如 V4 Pro 没有 low，会提到 high）。不能推理或不能关闭思考的模型不显示该按钮。`thinking_*` 事件 → 可展开的 “Thought for N seconds”。
- **上下文预算**：system prompt 的 token 估算（CJK 1 字 ≈ 1 token，其余 4 字符 ≈ 1 token）+ 16k 余量超过 `model.contextWindow` 时只提示「视频过长，当前模型放不下」，长视频方案见 `TODO.md`。
- Anthropic 浏览器直连所需的 `anthropic-dangerous-direct-browser-access` 头由 pi-ai 自动携带（已确认）。
- **历史**：每轮回答保存 pi-ai 返回的原始 `AssistantMessage`，追问时原样回放；失败的回答及其提问不进历史。

## 8. Prompt 与上下文

**结构**（稳定前缀在前，便于 prompt cache 命中）：

1. System：角色、输出语言、引用协议（§9）、格式规则
2. 视频元数据：标题、UP 主、时长、分 P 标题、简介、章节
3. 字幕全文（§5.1 格式）
4. 历史消息
5. 本轮用户消息 + 播放位置（`[当前播放位置 04:31]`）

**输出语言**：设置项，默认跟随浏览器 UI 语言（`browser.i18n.getUILanguage()`）。视频语言与输出语言不同时，引文用原文，下一行附译文。

**预设**：三个预设各对应一段固定的指令模板，作为用户消息发出（展示为 chip，不展示模板正文）。

- **Recap**：一句话结论（标题级）→ 3–6 个编号主题，每个主题 1–3 段解释，段末带引用；关键处插入原文引文。
- **Table of Contents**：标题「目录大纲」→ 编号章节，每章：标题、起点引用、一句到两句简介。有作者时间轴 / 官方章节时优先沿用其分章；最后一章须覆盖视频后 25%。
- **Top Quotes**：5–8 条，每条：一句概括性小标题 + 逐字引文（多行可拼接）+ 引用。

## 9. 引用协议

参考 Dia：模型直接在句末 / 引文末写时间 `[03:05]`（与字幕行同格式），渲染为时间戳 chip。

- **时间校验**：解析出的秒数吸附到不晚于它的最近一行字幕的起点；超出视频时长或早于首行字幕的引用直接丢弃（不渲染成会跳错的 chip）。
- **引文校验**：引用块（`> …`）以其后的时间为锚点，在锚点所在行的前 2 行到后 4 行（引文可能跨行）的拼接文本里做模糊匹配；`…` 表示省略，各片段须按顺序出现（规整空白与标点后的子串匹配）；不通过则降级为普通段落样式（不当作原话）。
- 流式时未闭合的 `[03:0` 暂不渲染，等闭合后再替换。
- 存储里保存模型原文（本身已是可读时间，复制无需转换）。

## 10. 会话与历史

**会话策略**（设置项）：

- 默认：每次进入一个视频页（导航到新的 `bvid + p`，或在另一个 tab 打开同一视频）开新会话；切 tab 再切回，回到该 tab 的当前会话（内存里记 tabId → 会话 id）。
- 「续上次会话」：进入视频时若该视频有历史会话，打开最近一条。
- 左上角按钮随时新开会话。

**存储**（IndexedDB，`idb` 封装）：

```ts
Session    { id, bvid, cid, p, title, upName, coverUrl, durationSec,
             createdAt, updatedAt, messages: Message[] }
Message    { id, role: 'user'|'assistant', preset?: 'recap'|'toc'|'quotes',
             text, thinking?, thoughtMs?, model, status: 'done'|'error'|'aborted',
             createdAt }
Transcript { key: `${bvid}:${cid}`, source: 'cc'|'ai'|'asr', lang,
             lines: {id, from, to, text}[], fetchedAt }
```

- 空会话（没发过消息）不落库。生成中每 500ms 最多保存一次，其余状态变化立即保存；关闭面板时正在生成的回答，下次打开显示为已中断。
- 从历史打开的会话始终针对它自己的视频：追问用该视频的字幕，时间戳在当前 tab 打开该视频。
- **历史列表**：顶栏图标打开，覆盖整个面板；按 `updatedAt` 倒序，每项显示封面、视频标题、首条用户消息摘要、时间；支持删除。打开历史会话时字幕从 `Transcript` 缓存取，缺失则重新拉取。

## 11. 设置

单页覆盖在面板上（不用 options 页），iOS 式分组卡片：每组一张圆角卡片，一行一项，标签在左、控件在右。所有改动立即保存，没有 Save 按钮（面板持有一份本地副本，输入不必等 storage 回传）。

- **模型**：provider、自定义 baseUrl、API Key、模型、思考强度（仅支持推理的模型）；卡片下注明 Key 只存在本地
- **语音转写**：启用开关；启用后显示服务、各服务特有项（baseUrl / 地域 / 工作空间）、Key、模型、开始时机（首次提问时 / 面板打开时）；配置不完整时卡内提示
- **通用**：回答语言（跟随浏览器 / 指定语言）、打开视频时（新会话 / 续上次会话）、主题（跟随系统 / 白天 / 夜间）

自定义端点的主机权限只能在点击时申请，所以 baseUrl 下方在缺少权限时显示「Allow access」按钮，而不是在保存时申请。

首次使用（无可用模型）时，在对话区内联显示同一张模型卡片和「Connect」按钮（这里先存草稿，点按钮才保存并申请自定义端点权限，避免填到一半就切到对话界面），不跳转设置页。

### 11.1 界面语言（i18n）

- 界面支持 English / 简体中文 / 繁體中文，用 `i18next` + `react-i18next`，可在插件内即时切换（`chrome.i18n` 只能跟随浏览器语言，做不到）。
- 设置项 `uiLanguage`：默认 `auto` 跟随浏览器（`zh-TW` / `zh-HK` / `zh-MO` / `zh-Hant` → 繁体，其余 `zh*` → 简体，其他 → 英文）。启动时在首次渲染前应用，并同步 `<html lang>`。
- 文案在 `locales/`：`en.ts` 是源，`zh-CN.ts` / `zh-TW.ts` 以其类型约束，键缺漏会编译失败。繁体用台湾用语（影片、設定、金鑰）。
- 发给模型的 prompt 和预设指令保持英文，与界面语言无关；回答语言另由 `outputLanguage` 决定，`auto` 跟随界面语言。
- 错误信息在产生时翻译并存进会话，历史里显示的是当时的语言；HTTP 状态码等技术细节保持原文。
- manifest 的描述走 `public/_locales`（扩展名 bilidude 不翻译）。

## 12. 权限

```
permissions: sidePanel, storage, scripting, declarativeNetRequestWithHostAccess
host_permissions:
  *://www.bilibili.com/*, *://api.bilibili.com/*, *://*.hdslb.com/*,
  *://*.bilivideo.com/*, *://*.bilivideo.cn/*（音频），
  https://member.bilibili.com/*, *://*.biliapi.net/*（必剪；上传地址是 http），
  内置 LLM / ASR provider 域名
optional_host_permissions: https://*/*（自定义端点）
```

## 13. 里程碑

1. Side Panel UI 骨架（静态数据）+ 主题
2. 视频识别 + 字幕获取 + 跳转
3. pi-ai 接入 + 设置 / 首次引导 + 预设与追问 + 引用协议
4. 会话持久化 + 历史列表
5. ASR（含必剪、OpenAI 兼容、阿里云百炼、硅基流动）

