# 提示词评测计划

改提示词时，用一组固定的真实视频和问题比较新旧版本，避免只对着几个例子调出一个局部最优。每次改提示词都可以重跑。

## 比较哪些版本

- **v0**：`5d49629` 时的提示词，即 11-20 这几轮修改之前的版本。
- **v1**：`de09e11`，加了日期挪动、引文规则、表格这几条，已提交。
- **v2**：`git stash` 里尚未提交的改动（“prompt v2 (待评测)”）：长短和结构跟着问题走、视频外的问题直接回答、时间戳不硬塞不扎堆；搜索可用但关着时提示地球图标。

- **vmin**：极简对照，检验风格规则到底有没有用。system prompt 只留身份说明、输出语言、渲染端依赖的格式约定（时间戳、逐字引文、`[n]` 引用、搜索时不在中间写字）和视频内容；“依据字幕”“格式”这两节，以及长短、标题、开场白之类的规则都去掉。预设和用户消息与 v1 相同，只有 system prompt 不同。草稿见文末，跑之前由用户审阅。

v0 也一起比较，这样之前那几轮修改也能得到检验，而不只是看最新这一步。vmin 某一类表现不差，说明那一类的规则可以删；明显变差，说明那条规则在起作用。

## 素材（由用户提供）

模型只看得到视频信息（标题、分 P、UP 主、时长、简介）和合并后的字幕（含章节、字幕来源、语言、时间是否为估算），不需要视频文件。一小时以上的长视频也只需要它的字幕。

收集方法：打开视频，在 BiliDude 顶栏的下载菜单里选“视频信息和字幕（.json）”，不用先提问；没有字幕的视频会先转写。多个视频也可以在历史记录里批量导出这个格式。导出的就是扩展存在 IndexedDB 里的 `VideoRef` 和合并后的 `Transcript`，跟模型实际收到的一致，不用手抄，也不用评测脚本去猜字幕怎么合并。

希望覆盖 6 个左右类型不同的视频：

1. 中文知识讲解（单人、信息密度高）
2. 多人闲聊、vlog 或访谈
3. 游戏或直播录像（字幕零碎、口语多）
4. 外语视频（测试引文翻译）
5. 一小时以上的长视频
6. 没有字幕、需要转写的视频（转写结果时间是估算的）

素材（每个视频一个 `.json`）放在 `eval/videos/`，整个目录加进 `.gitignore`：那是别人视频的字幕，不进仓库。

## 用例

每个视频挑适用的问题，总共大约 40 个用例。问题按用户真实会问的类别来写，不针对已知的毛病：

| 类别 | 例子 | 关注什么 |
|---|---|---|
| 预设 | 总结、目录、金句 | 结构、时间戳、引文通过率 |
| 关于视频的短问题 | “他推荐的是哪一款？” | 简短直接，不加标题 |
| 这一段 | “这里在说什么？”（带播放位置） | 用上播放位置 |
| 视频外的请求 | 写祝福、解释一个概念 | 直接回答，不硬拉视频 |
| 需要外部信息，搜索关着 | “这个游戏现在能玩了吗？” | 一句话说明，并提示地球图标 |
| 需要外部信息，搜索开着 | 同上 | 搜索次数、引用 |
| 指定格式 | “总结成表格”“用英文回答” | 照做 |
| 天然适合表格 | “这几台相机各自的价格和用途” | 自己选择用表格 |
| 原话 | “他原话怎么说的？” | 引文校验通过 |
| 追问 | 先问一个问题，再问“那第二个呢？” | 能接上前文 |

追问类用例要先跑完第一问，用真实回答作为历史，再问第二问。

## 怎么跑

```bash
pnpm eval [--video 1,2] [--case 1-recap] [--versions v0,v1,v2,vmin] [--runs 3]   # 跑回答
pnpm eval:judge [--video 1]                                                     # 盲评
pnpm eval:report                                                                # 生成 eval/results/report.html
```

- 用例在 `eval/cases.json`。`eval/run.ts` 直接调用扩展的 `runAgent` 和 `resolveModel`，走同一个 agent 循环、服务端搜索和引用处理，模型是 `deepseek-flash`，思考关闭（扩展的默认设置）。需要 `.env.local` 里的 `E2E_LLM_PROVIDER=deepseek` 和 `E2E_LLM_API_KEY`。
- 除了标了 `search` 的用例，其余都当作“搜索可用但没打开”，这是 DeepSeek 用户的默认状态。只有 v2 区分这种情况。
- 每个用例 × 每个版本跑 3 次，抵消回答本身的随机波动。追问用第一问的真实回答作为历史，和扩展的 `toHistory` 一样。
- 各版本的提示词在 `eval/variants/`：v0、v1、v2 由 `git show` 导出，只改了 import 路径；vmin 是手写的极简对照。
- 结果存在 `eval/results/<用例>/<版本>-<第几次>.json`（已忽略，不进仓库）。已有的结果会跳过，中断后重跑会接着跑；出错的不保存，下次重试。报告只读这些文件，不调用模型。
- 脚本用 Node 自带的 TypeScript 支持运行，`eval/loader.mjs` 负责 `@/` 路径和省略的扩展名。所以 lib 里不能用需要编译的 TypeScript 写法（构造函数参数属性、enum）。不放进 CI。

花费：视频 1 试跑 32 个回答花了 $0.029；盲评用 `deepseek-v4-pro` 开思考，24 对花了 $0.47，每对约 $0.02，远比回答贵。

## 自动指标

尽量复用渲染端已有的逻辑（`lib/render/transcriptCheck.ts`、`lib/render/remark-timestamps.ts`）：

- 时间戳丢弃率：超出视频时长、被丢掉的时间戳所占比例；
- 引文通过率：引用块里能在字幕中找到原文的比例；
- 时间戳扎堆：连着出现三个以上时间戳的次数；
- 短问题里出现标题的比例；
- 回答长度（字数）；
- 要求表格时有没有出表格；比较类问题自发用表格的比例；
- 搜索关着、问题需要外部信息时，有没有提示地球图标；
- 视频外的请求里，有没有把视频内容扯进来。这一项靠关键词判断不可靠，交给盲评。

每项给出各版本的平均值，以及 3 次之间的波动范围。

## 盲评

`deepseek-v4-pro`（思考开到 medium）当评委，脚本是 `eval/judge.ts`。每个用例拿 v0、v2、vmin 第 1 次的回答各跟 v1 比一次，随机决定左右（同一对每次的左右固定），不告诉它哪个是新版。按“这个产品的用户会更喜欢哪个”给出偏好（左 / 右 / 差不多）和一句理由。评委看得到问题、视频信息，以及两个回答引用到的时间点前后的字幕。

评委只作参考。它有自己的偏好，比如可能偏爱更长的回答，所以报告里把它的结果和自动指标并列。

## 报告

生成一页 HTML：

- 顶部是汇总：各版本的自动指标，以及两两之间的盲评胜负；
- 下面按用例逐个展开：各版本的回答并排显示，时间戳和引文用扩展同样的方式渲染，后面附评委的理由。

## 怎么判断

- 新版在某个类别上变好，不能以别的类别变差为代价。任何类别明显退步，就回去改，而不是接受。
- 只在一两个用例上有差异的，不当作结论。
- 最后由用户看报告决定是否采用。

## 步骤

1. 用户提供素材。
2. 写脚本和用例，先用一个视频小规模试跑，确认花费和指标都合理。
3. 全量跑，生成报告。
4. 根据报告决定 v2 的去留，以及哪些规则可以删。
5. 提示词内容定下来之后，再单独评估结构改动：参照 Pi 1.0，把 system prompt 分节、搜索开关和日期改成对话中途的 system 更新、搜索规则挪进工具说明。先实测 DeepSeek 对对话中间的 system 消息的表现。

## vmin 草稿

```
You are an assistant in the browser side panel, helping the user understand the Bilibili video they are watching. Write in ${outputLanguage}.

# Timestamps
The panel turns timestamps into buttons that seek the video. Write them as plain text like [03:05] (or [1:03:05]), copied exactly from the start of a transcript line.

# Quotes
Quotes are checked against the transcript; any that don't match are shown as ordinary text. Quote as a Markdown blockquote: the exact words in the original language, in quotation marks, then the timestamp of the line they start on. Add a translation on the next line of the blockquote when the video's language differs from ${outputLanguage}.

# The video
（与 v1 相同）

# Web search（仅在可用时）
You can search the web. Mark information from the web as such and never give it a video timestamp. Write nothing before or between searches; any text becomes part of the answer.
（客户端搜索再加：Cite results by their number, like [3].）
```
