# 开发

BiliDude 基于 [WXT](https://wxt.dev)、React、Tailwind CSS 和 [pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai) 构建。

环境要求：Node.js 22 及以上，[pnpm](https://pnpm.io)。

```bash
pnpm install
pnpm dev        # 打开加载了扩展的 Chrome，改动后自动重载
pnpm build      # 构建到 .output/chrome-mv3（用“加载已解压的扩展程序”加载）
pnpm zip        # 打包构建产物用于发布
pnpm compile    # 类型检查
```

## 单元测试

不依赖浏览器的逻辑（如报错分类）用 [Vitest](https://vitest.dev) 测，CI 里也会运行：

```bash
pnpm test:unit
```

## 端到端测试

测试用 [Playwright](https://playwright.dev) 把构建好的扩展加载进 Chromium。测试会打开真实的 B 站页面，需要能访问 bilibili.com。

```bash
pnpm exec playwright install chromium   # 只需一次
cp .env.example .env.local              # 可选：填入真实的 API Key，见下文
pnpm test:e2e                           # 先构建，再运行全部测试
```

- 大部分测试会模拟字幕、模型和转写接口，始终运行。
- 调用真实 API 的测试只在 `.env.local` 里配置后才运行（见 [`.env.example`](.env.example)）：`tests/e2e/llm.spec.ts` 测模型服务商，`tests/e2e/asr.spec.ts` 里的 “transcribes with the provider from .env.local” 测转写服务。必剪也需要手动开启，因为它按网络限流。
- 真实模型的回答会附在 HTML 报告里：`pnpm exec playwright show-report`。

## 项目结构

```
entrypoints/
  background.ts         打开侧边栏，注册请求头规则
  sidepanel/            应用本体：App.tsx、useChat（回答）、useActiveVideo（跟踪标签页）
components/             界面组件
lib/
  bili/                 B 站链接解析、Web API、标签页
  transcript.ts         字幕加载与合并
  llm/                  模型服务商（pi-ai）、prompt、agent 循环
  search/               联网搜索（客户端工具、DeepSeek 服务端搜索）与来源编号
  deepseek/             DeepSeek 账号登录
  asr/                  音频下载、AAC 切片、转写服务
  render/               回答里的时间戳、引用角标，以及时间戳与引文校验
  storage/              IndexedDB（对话、字幕、转写缓存）、缓存清理、设置
  export/               导出对话和字幕
tests/e2e/              Playwright 测试
docs/DESIGN.md          设计说明与决策记录
```

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org)。计划中的工作见 [TODO.md](TODO.md)。

