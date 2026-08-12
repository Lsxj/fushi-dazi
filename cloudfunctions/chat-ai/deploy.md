# chat-ai 云函数部署步骤

## ⚠️ Important: bundle model

WeChat 云函数 deploy 时 **只会上传当前目录**(`cloudfunctions/chat-ai/`)的内容,不会自动带上兄弟目录(`cloudfunctions/_shared/`)。所以:

- `chat-ai/wx-shim.js` 是 `cloudfunctions/_shared/wx-shim.js` 的**副本**(不是软链)
- 你**修改了 `_shared/wx-shim.js` 之后**,必须 `cp` 一份到 `chat-ai/wx-shim.js`
- 想偷懒:写个 build 脚本(`scripts/sync-shared.sh`)在 deploy 前同步

```bash
# 改完 _shared/wx-shim.js 后:
cp cloudfunctions/_shared/wx-shim.js cloudfunctions/chat-ai/wx-shim.js
# 然后再 upload-and-deploy
```

`_llm/` 目录里的 provider 文件在 chat-ai 内部,无此问题。

---

## 前置条件(一次性)

### 1. 微信云开发账号

1. 打开微信开发者工具,顶部菜单 **云开发** → **开通**
2. 选择**按量付费**(有免费额度,够 demo)
3. 实名认证(几分钟)
4. 创建环境,**选默认配额**即可
5. 拿到 **环境 ID**(形如 `fushi-1234567890abcdef`)

### 2. Anthropic API key

1. 去 [console.anthropic.com](https://console.anthropic.com/) 注册/登录
2. **Settings → API Keys → Create Key**
3. 复制(只显示一次!)格式:`sk-ant-api03-...`
4. 默认模型用 `claude-sonnet-4-5`,API key 通用

### 3. 用户数据存储

`chat-ai` 不需要 `user_data` 集合。宝宝档案、菜单和记录由小程序随当次请求发送，云函数仅在请求级内存中处理，不读取或写入用户数据数据库。

---

## 部署 chat-ai 云函数

### 1. 上传代码

1. 在微信开发者工具中,左侧目录树右键 `cloudfunctions/chat-ai/`
2. **上传并部署:云端安装依赖**
3. 等待 30-60s(首次安装 `@anthropic-ai/sdk` 较慢)

### 2. 配置环境变量

1. 云开发控制台 → **云函数** → **chat-ai** → **配置**
2. 切到 **环境变量** tab
3. 添加:

**方案 A(默认,Anthropic Claude):**

| 键 | 值 |
|---|---|
| `LLM_PROVIDER` | `anthropic`(可选,有默认值) |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...`(你自己的) |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5`(可选) |

**方案 B(DeepSeek,OpenAI 兼容,推荐国内场景):**

| 键 | 值 |
|---|---|
| `LLM_PROVIDER` | `deepseek` |
| `DEEPSEEK_API_KEY` | `sk-...`(DeepSeek 控制台拿) |
| `DEEPSEEK_MODEL` | `deepseek-chat`(可选) |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1`(可选) |

**方案 C(智谱 GLM-4):** 加 `LLM_PROVIDER=deepseek` + 设 `DEEPSEEK_BASE_URL=https://open.bigmodel.cn/api/paas/v4` + `DEEPSEEK_MODEL=glm-4-plus`

> ⚠️ DeepSeek / 智谱 / MiniMax 等都走 OpenAI 兼容协议,所以同一个 `deepseek` provider 通过改 `DEEPSEEK_BASE_URL` 就能切。

4. 保存

### 3. 测试云函数

1. 云开发控制台 → **云函数** → **chat-ai** → **测试**
2. 测试事件(JSON):

```json
{
  "question": "今天中午吃什么",
  "history": []
}
```

3. 点**运行测试**
4. 期望返回:

```json
{
  "ok": true,
  "answer": "今天三餐...",
  "toolCalls": [{"name": "generate_today_menu", "input": {}, "ok": true, ...}],
  "openid": "test-openid"
}
```

如果返回 500 / key 错误 → 检查环境变量是否生效(改完要等 10s 让 WeChat 同步)。

---

## 小程序端配置

### 1. project.config.json

确认(或添加):

```json
{
  "cloudfunctionRoot": "cloudfunctions/",
  "cloudbaseRoot": "cloudbaserc.json"
}
```

### 2. cloudbaserc.json(项目根)

如果还没有,新建:

```json
{
  "version": "2.0",
  "envId": "fushi-1234567890abcdef"
}
```

### 3. app.ts(项目根)

添加云开发初始化(只在生产路径加,本地 mock 走 catch 路径):

```ts
import { IAppOption } from './typings/index'

App<IAppOption>({
  globalData: {},
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({ traceUser: true })
    }
  },
})
```

---

## 真机预览流程

1. 微信开发者工具 → 顶部菜单 **预览** → 扫码
2. 真机上看到 `我的` 页 → `问问 AI 助手`
3. 点 quick reply 或自己输入问题
4. AI 回答应该来自真 Anthropic API,工具调用 trace 应该可展开

---

## 排错清单

| 症状 | 原因 | 修法 |
|------|------|------|
| 真机点发送 → "云函数调用失败 -404" | 云函数没上传 | 回到第 1 步 |
| 真机 → 一直 loading 没回应 | ANTHROPIC_API_KEY 失效 / 网络问题 | 看云函数日志(控制台 → 云函数 → 日志) |
| 真机 → "AI 没回答" | LLM 工具调用循环卡死(罕见) | 日志看 `iter=N` 是否达到 MAX_TOOL_ITERATIONS=5 |
| 真机 → 答非所问 | system prompt 漂移 | 检查 chat-ai/index.js 的 SYSTEM_PROMPT 还在 |
| 真机 → 档案或菜单数据不对 | 本次请求的本地快照缺失或过期 | 检查 `collectLocalBackup` 和本地 `wx.storage` |
| 真机 → 首次特慢 | 冷启动(云函数首次调用要 init) | 第二次起秒回 |

---

## 安全注意

- **ANTHROPIC_API_KEY 只配在云函数环境变量**,不写到任何代码里
- **云函数日志**会显示输入/输出,如果担心隐私可以关掉日志(控制台 → 云函数 → 日志 → 关闭)
- **不暴露 openid** 到前端(任何人都能看到自己的 openid,但不能拿别人的)

---

## 成本估算

- Anthropic API:claude-sonnet-4-5 ~$3 / 1M input tokens
- 平均一次对话 500-1000 input + 200 output tokens → $0.005 / 次
- 1000 次对话 ≈ $5
- 云函数调用:按量付费,首月有免费额度
- 数据库:首月有免费额度(2GB)

## 6. 本地 mock(不部署时也能用)

如果暂时不开云开发,DevTools 预览会**自动降级到 mock mode**(见 `pages/ai-chat/ai-chat.ts` 的 `runMock` 方法):
- 关键词匹配 → 预设回答 + mock tool call
- 不需要任何云函数
- 完整 UI flow 可演示

右上角 / loading 状态可看出当前 mode(可在 WXML 加 badge,但当前没加 — 后续 polish)。
