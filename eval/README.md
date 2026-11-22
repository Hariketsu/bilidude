# BiliDude Prompt Eval

提示词评测脚本与用例，复用扩展本身的 `runAgent` 和渲染端校验（时间戳、逐字引文）。评测方法、6 视频公开清单与历次实验记录见 [docs/PROMPT-EVAL.md](../docs/PROMPT-EVAL.md)。

## 目录结构

- `run.ts`：按 `cases.json` 调用模型生成回答，写入 `results/`（断点续跑，已完成的自动跳过）。
- `judge.ts`：用 `deepseek-v4-pro` 对指定版本和基线 `v1` 做随机左右盲评。
- `report.ts`：经由扩展的 remark 插件计算自动指标，生成并排对比的 `results/report.html`。
- `cases.json`：42 道覆盖 10 类场景的评测用例。
- `variants/`：常驻对照版本（`v1` 为上一代基线，`vmin` 为极简对照）；`current` 直接读取 `lib/llm/prompt.ts`。
- `videos/`（已忽略）：本地视频与字幕 `.json` 素材。
- `results/`（已忽略）：原始回答、盲评 JSON 与生成的 `report.html`。

## 准备素材与运行

1. 在 B 站打开目标视频，通过 BiliDude 顶栏下载菜单导出「视频信息和字幕（`.json`）」，按编号前缀命名放进 `eval/videos/`（例如 `1. 视频标题.json`），与 `cases.json` 中的 `video` 字段对应。
2. 在仓库根目录 `.env.local` 中配置 DeepSeek Key：
   ```bash
   E2E_LLM_PROVIDER=deepseek
   E2E_LLM_API_KEY=sk-...
   ```
3. 运行评测：
   ```bash
   pnpm eval [--video 1,2] [--case 1-recap] [--versions current,v1,vmin] [--runs 3]
   pnpm eval:judge [--video 1] [--versions current] [--run 1]
   pnpm eval:report
   ```
4. 用浏览器打开 `eval/results/report.html` 查看指标与并排回答。
