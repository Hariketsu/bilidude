# TODO

MVP 之后的规划。MVP 范围见设计文档。

## 会话

- [ ] 一个会话内切换、叠加多个视频作为附件（跨视频提问、对比）。MVP 是「一个视频（`bvid + cid`）一个会话」。

## README

- [ ] 加上 Star History 图（仓库公开后）。

## 导出

- [x] 导出回答 / 会话（Markdown，时间戳转为带 `?t=` 的视频链接）。
- [ ] 手动下载字幕（含需要转写的视频）。入口、格式与转写时机待讨论。

## 长视频（超出模型上下文）

调研结论：BiliScript 的切段 / 结构化合并 / 追问检索可直接借；它的 LLM 叙述式 Map-Reduce 会让时间戳漂移，不适合 TOC / Quotes。Bilitato 无长视频方案（硬截断，静默丢后半段），但其「行号协议」值得借。

- [ ] 预算按 pi-ai `Model.contextWindow` 动态计算（token 口径：中文 ≈1 字/token、英文 ≈4 字符/token，用响应 `usage.input` 校准）；装得下就单次流式。替代 BiliScript 固定 200k 字符 + 错误文案启发式（ADR-0001）。
- [ ] 超预算切段：借 BiliScript `splitByBudget`（`extension/ai/budgeter.ts:83-132`），官方章节对齐，段长 ≈0.3×窗口，每段带上一段末尾少量前情回顾（`analysis-orchestrate.ts:640-667`）。
- [ ] TOC / Quotes：每段输出 JSON（行号 + 标题 / 引文），代码做区间校验、去重、排序、渲染，不用 LLM 归并。参考 `validateAnalysis` / `mergeAnalyses`（`analysis-validate.ts:54, 115`）、时间戳教学块与「最后一章晚于 75%」门槛（`analysis-prompts.ts:40-58, 261`）。
- [ ] Recap：分段小结保留 `[mm:ss]`，成稿后正则校验时间戳并剔除越界 / 不存在者；段数很多时才加一层归并（`buildReduceGroups`，`reduce.ts`）。
- [ ] 追问：分段小结 + 最近 N 轮原文 + 按时间戳 / 章节 / 关键词检索注入原始字幕段（照搬 `raw-retrieval.ts:148`、`followup-context.ts:116-149`）。
- [ ] 溢出：用 pi-ai `isContextOverflow` 判定，命中后预算 ×0.5 重跑一次，再失败提示换大窗口模型（自定义 / Ollama 模型元数据可能不准，兜底必须保留）。
- [ ] 并发 2–3、可中止；段结果按 `bvid / cid / 字幕签名 / 段号 / 预算档` 缓存进 IndexedDB。
- [ ] 段数 ≥5 时提示调用次数；部分段失败时输出部分结果并标出失败区间。
- 不照搬：BiliScript 的 offscreen 代发 + port 协议（`ladder.ts`）、segment-cache 的 SW 宿主消息族、输出上限学习（ADR-0012，pi-ai 有 `model.maxTokens`）；Bilitato 的云缓存 / Sentry / 全局队列。
- 已知坑：`chars×1.0` 明显高估中文 token；按错误文案判溢出会把「输出上限过大」误判为「输入太长」；小结截尾可能切在半句。
