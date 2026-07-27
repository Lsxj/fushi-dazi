# fushi-ditu 部署脚本

## 文件

```
scripts/
├── deploy-chat-ai.sh     # 一键部署 chat-ai 云函数
└── sync-fushiditu.sh     # 把 fushi-ditu utils+data 复制进 chat-ai bundle
```

## deploy-chat-ai.sh

部署 chat-ai 云函数到 WeChat 云开发。

```bash
./scripts/deploy-chat-ai.sh                              # 用默认 env
./scripts/deploy-chat-ai.sh --check                      # 只跑前置检查
./scripts/deploy-chat-ai.sh --tail-log                    # deploy 完看日志
./scripts/deploy-chat-ai.sh --env-file .env.local         # deploy + 推 env var
```

### 前置(一次性)

```bash
npm i -g @cloudbase/cli
tcb login   # 浏览器弹窗,微信扫码
```

### .env.local 格式

```
DEEPSEEK_API_KEY=sk-your-real-key
LLM_PROVIDER=deepseek
ANTHROPIC_API_KEY=
```

⚠️ `.env.local` 在 `.gitignore`,不会进 commit。
deploy 期间临时写进 `cloudbaserc.json`,trap EXIT 自动清。

## sync-fushiditu.sh

把 fushi-ditu 的 `utils/` + `data/` 复制到 `cloudfunctions/chat-ai/fushi-ditu/`。

**为什么需要**:WeChat 云函数只 deploy 单目录。fushi-ditu utils 跟 chat-ai 是兄弟,云端无法 require 父级。

**何时跑**:
- deploy-chat-ai.sh 跑前(自动)
- 改了 fushi-ditu utils/data 后(手动)

```bash
./scripts/sync-fushiditu.sh
# → synced: 22 utils files, 8 data files
# → dest: /Users/x7/fushi-ditu/cloudfunctions/chat-ai/fushi-ditu
```

`chat-ai/fushi-ditu/` 在 `.gitignore`(副本不入 git)。

## package.json 入口

```json
{
  "scripts": {
    "deploy:chat-ai": "./scripts/deploy-chat-ai.sh",
    "deploy:chat-ai:check": "./scripts/deploy-chat-ai.sh --check",
    "deploy:chat-ai:tail": "./scripts/deploy-chat-ai.sh --tail-log"
  }
}
```

直接用:
```bash
npm run deploy:chat-ai
npm run deploy:chat-ai:check
```

## 常见坑

| 坑 | 原因 | 修法 |
|---|------|------|
| `unknown arg: .env.local` | `shift` 在 for 循环不工作 | 已修,改 while |
| `找不到函数 chat-ai 的目录:.../chat-ai/chat-ai` | cloudbaserc `functionRoot=.` 误解析 | 设 `functionRoot` 为父,或 `tcb fn deploy --dir` |
| 测试事件卡 "请选择操作" | 缺 cloudbaserc.json functions 配置 | 已在根目录 cloudbaserc.json 加 function 配置 |
| `tcb 没登录或没权限` | token 过期 | 重跑 `tcb login` |
