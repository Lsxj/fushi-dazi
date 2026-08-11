# chat-ai 云函数

WeChat 云函数 — fushi-ditu 小程序内置 AI 助手的生产路径。

## 它做什么

家长在小程序「我的 → 问问 AI 助手」里说话,云函数:
1. 鉴权(wx.login → openid 天然多租户)
2. 从 cloudDB 加载该用户的 babyProfile / fridge / mealJournal 等
3. 调 LLM(Anthropic Claude / DeepSeek / MiniMax / 智谱 任选)
4. LLM 通过 tool_use 调 fushi-ditu 业务能力(读档案、生成菜单、查安全)
5. 返回答 + 工具调用 trace 给前端

## 架构

```
┌──────────────────┐
│  微信小程序       │  wx.cloud.callFunction
│  (ai-chat 页)     │  ─────────────────────►
└────────┬─────────┘                            │
         │                                      ▼
         │                          ┌──────────────────────┐
         │                          │  chat-ai 云函数       │
         │                          │  - 鉴权 (openid)       │
         │                          │  - wx-shim            │
         │                          │  - LLM factory        │
         │                          │  - tool registry      │
         │                          └──────────┬───────────┘
         │                                     │
         │       ◄──────── answer + toolCalls ─┤
         │                                     │
         ▼                                     ▼
   渲染 AI 回答                    调 fushi-ditu utils (经 shim)
   + 工具调用 trace                走 cloudDB (per-openid 隔离)
```

## 关键文件

```
cloudfunctions/chat-ai/
├── index.js              # 主入口 + tool registry + tool loop
├── wx-shim.js            # globalThis.wx shim (file / cloudDB backend)
├── package.json          # @anthropic-ai/sdk + openai
├── fushi-ditu/           # ← sync 出来的 fushi-ditu utils + data 副本
│   ├── utils/  (22 .js files)
│   ├── data/   (8 .js files)
│   └── README            # sync 标记(自动生成)
├── _llm/                  # LLM 抽象(支持多 provider)
│   ├── client.js         #   LLMClient interface
│   ├── anthropic.js      #   Anthropic SDK
│   ├── deepseek.js       #   OpenAI SDK + custom base URL
│   ├── mock.js           #   关键词 mock(没 key 时 fallback)
│   └── factory.js        #   按 env 选
├── cloudbaserc.json      # tcb 部署配置
└── deploy.md             # 详细 deploy 步骤 + 排错
```

## 部署

```bash
cd /Users/x7/fushi-ditu

# 一次性
npm i -g @cloudbase/cli
tcb login

# 每次
./scripts/deploy-chat-ai.sh --env-file .env.local
```

完整步骤 + env var 配置 + 排错见 `deploy.md`。

## 关键设计决策

### 1. wx shim 把 fushi-ditu utils 拉到 Node
fushi-ditu/utils/* 编译后调 `wx.getStorageSync(key)` inline。生产环境没 wx,所以 `wx-shim.js` 注入 `globalThis.wx`:
- **file backend** (本地 dev / 测试):写 JSON file
- **cloudDB backend** (生产):读 `user_data` collection 文档(per-openid)

### 2. fushi-ditu 主体零修改
云函数是 fushi-ditu 的"外骨骼",业务能力 0 改动复用。`scripts/sync-fushiditu.sh` 在 deploy 前把 `utils/` + `data/` 复制到 `chat-ai/fushi-ditu/`。

### 3. LLM provider 抽象
`_llm/client.js` 定义统一接口,`factory.js` 按 env 选:
- `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`
- `LLM_PROVIDER=deepseek` + `DEEPSEEK_API_KEY` (OpenAI-compatible,可换 base URL 切 MiniMax / 智谱)
- 都没配 → mock (关键词匹配,适合 CI / dev / 断网)

**每次 deploy `.env.local`** 临时写进 `cloudbaserc.json`,推上去,trap EXIT 自动清(避免 commit 泄露 key)。

### 4. tool registry 镜像 mcp-server
同样的 6 个安全工具:
- `read_baby_profile` / `check_food_safety` (HARD GUARDRAIL)
- `list_recipes` / `generate_today_menu` / `get_feeding_history` / `record_reaction`

`mark_food_allergic` 不在 — 不可逆操作必须 user UI 显式确认(同 mcp-server 的 `z.literal(true)` 哲学)。

### 5. wx shim + /tmp 兜底
云函数 sandbox 写 `/var/user/` 失败 → file shim 自动 fallback `/tmp/fushi_localdata/`。三种模式:

```
LOCAL=1               → __dirname/_localdata/
云函数 + 测试事件(无 wxContext) → /tmp/fushi_localdata/
云函数 + 真小程序(wx.cloud.callFunction) → cloudDB
```

## 架构要点

1. **架构**:小程序 + 云函数 + LLM 三层,云函数是边界(fushi-ditu 业务能力 0 改动复用)
2. **多租户**:wx.login openid 天然隔离,cloudDB 按 openid 文档
3. **guardrail**:6 个 safe tools,LLM 不在 safety path(`check_food_safety` 纯规则)
4. **provider 抽象**:换模型不改代码(改 env var)
5. **deploy model**:WeChat 云函数只打包单目录,跨目录用 sync 脚本
6. **iOS-side 同步**:_localBackup 一次性把本地 wx.storage 传到 cloudDB(本地 onboarding 不变)

## 已知 trade-off

1. **`generate_today_menu` 写 weeklyPlan** — 跟 fushi-ditu 原生一致,但 LLM 选 date 时需要 `YYYY-MM-DD` 格式;LLM 偶尔返错日期会 silently 用今天
2. **mock mode 共享确定性路由** — 不是真 LLM 推理，只用于离线流程与固定评估；安全回答必须引用工具结果，阻断或结果缺失时不能固定回答“安全”
3. **fushi-ditu 每次改 utils 需要 sync + deploy** — 2 步,容易忘
4. **`maxHistory=20` turn** — 长对话超出会丢前文
5. **tool_use loop max=5 次** — 防止 LLM 死循环;真用没碰到
6. **Anthropic SDK 没 lazy-require 失败处理** — 如果 npm install 漏 SDK,deploy 时不报错,运行时 throw

## 排错

| 症状 | 原因 | 修法 |
|------|------|------|
| 测试事件 `Cannot find module '../_shared/wx-shim'` | WeChat deploy 不带兄弟目录 | `cp _shared/wx-shim.js chat-ai/wx-shim.js` |
| 测试事件 `ENOENT: mkdir /var/user/_localdata` | /var/user/ 只读 | 自动 fallback `/tmp/`(已修) |
| 工具调 `Cannot find module '/utils/planner.js'` | fushi-ditu 没进 bundle | 跑 `sync-fushiditu.sh` |
| LLM 返 mock 答案 | factory 没拿到 key | 配 `DEEPSEEK_API_KEY` + re-deploy |
| LLM 知道 babyProfile 但 UI 显示"没建好" | cloudDB 没数据 | 真机第一次会 _localBackup 同步 |
| deepseek fn deploy 卡 "请选择操作" | 没 cloudbaserc.json 配 function | 在项目根 cloudbaserc.json 加 functions 配置 |
| tcb 报"函数已存在是否覆盖" | 缺 `--force` | 已在 deploy 脚本加 |

## 相关

- [deploy.md](./deploy.md) — 完整 deploy 步骤
- [/Users/x7/fushi-ditu/mcp-server/README.md](../../mcp-server/README.md) — mcp-server(开发者工具,非 production)
- [fushi-ditu/utils/](../../utils/) — 业务代码 source of truth
