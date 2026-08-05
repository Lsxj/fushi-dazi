# 辅食搭子

4–24 月龄宝宝家长辅食运营系统，以及围绕真实照护场景构建的 AI Solution Architecture 作品集。

产品范围、当前完成度和发布门槛见 [PRD.md](./PRD.md)。

## 30 秒看懂

- **真实问题**：把宝宝档案、排敏、身体状态、库存、菜单、饮食执行和反应记录串成连续决策；多人照护时避免错误修改过敏档案和误喂。
- **架构答案**：LLM 负责理解、编排和解释，确定性规则负责食物安全；Zod + oRPC 统一 React/Express 契约；不可逆变更使用角色授权、显式确认、档案版本和审计记录。
- **可运行证据**：React 19 + Express + oRPC、23 个 MCP 工具、9 个 agentic 固定评估案例、23 个 React/MSW 测试、2 个真实 Chromium E2E、46 个 MCP 冒烟测试和 11 步集成流程。
- **诚实边界**：Web 是内部运营与安全控制台；家庭角色切换仅保留在开发者合成场景。当前仍为单节点本地持久化和 mock IdP，不冒充生产云数据库或已上线小程序功能。

面试材料：[架构决策记录](./docs/adr/README.md) · [7 分钟演示脚本](./docs/interview-demo.md) · [SAP 定向简历项目模块](./docs/resume-project-sap.md) · [SAP 面试追问清单](./docs/interview-qa-sap.md)

## 快速运行运营与安全控制台

```bash
pnpm install
pnpm run api:dev
```

另开一个终端：

```bash
pnpm run web:dev
```

访问 `http://127.0.0.1:4173/`，建议依次查看运营总览、`/safety` 规则验证、`/observability` AI 质量、`/support` 家庭支持和 `/developer` 开发者工具。

## 本地质量门禁

无需 GitHub Actions 或付费服务，在项目根目录执行：

```bash
npm run verify
```

首次运行浏览器测试前执行：

```bash
pnpm --filter @fushi/web-console exec playwright install chromium
```

质量门禁会依次完成小程序 TypeScript 构建与隐私回归、pnpm workspace 构建、Zod/oRPC HTTP 合约测试、React + MSW 测试、MCP Server 构建与测试、46 项冒烟测试、11 步集成流程和 3 项真实 Chromium E2E。API 行覆盖率为 98.55%，React 控制台行覆盖率为 94.27%。本项目以本地可重复证据为验收标准，不把未运行的远程 CI 当作交付结果。

## AI 工程作品集

- [MCP Server](./mcp-server/README.md)：23 个工具、10 个资源、3 个提示词，展示 rule-first / LLM-second 的 agentic workflow；固定离线评估集量化工具选择、安全阻断、grounding 代理和端到端成功率。
- [Contract-first API](./apps/api-server/README.md)：pnpm workspace、Zod、oRPC、Express 与 OpenAPI，复用同一套确定性安全规则。
- [React 运营与安全控制台](./apps/web-console/README.md)：React 19、React Router、TanStack Query、Zustand、Tailwind CSS 与 MSW；主界面服务支持工单、内部运营和安全验证，架构证据与可变更的家庭合成流程隔离在开发者专区。
- [辅食安全变更 Skill](./skills/fushi-safety-change/SKILL.md)：把安全敏感功能的契约、实现、负向测试和交付检查固化为可复用流程。
- [AGENTS.md](./AGENTS.md)：定义代码分层、AI 决策边界、质量门禁和 Git 协作规范。
- [Architecture Decision Records](./docs/adr/README.md)：记录规则边界、contract-first、不可逆确认与离线评估的关键取舍。
- [7 分钟面试演示](./docs/interview-demo.md)：从真实业务问题进入可运行页面、工程证据和生产扩展边界。
- Mock provider：无模型密钥也能离线演示，且调用方可以明确识别 mock / live 状态。

## 怎么打开它

1. 下载安装**微信开发者工具**(stable版):
   https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html

2. 打开微信开发者工具 → 选择"小程序" → "导入项目"

3. 项目目录选 `~/fushi-ditu`,AppID 自动识别(`wx622c566b469247cc`)

4. 点"确定"即可看到效果

## 真机调试(扫码到手机看)

1. 在开发者工具点击右上角"预览" → 生成二维码
2. 用本人微信(注册AppID的那个号)扫码
3. 直接在手机上看小程序运行效果

## 当前能做什么

- ✅ 首次建档:宝宝信息 / 已吃食材 / 初始冰箱
- ✅ 今日:菜单 / 单餐替换 / 实际饮食打卡 / 明日预处理 / 排敏下一步
- ✅ 计划:生成与重排 / 采购清单 / 计划预览与复制
- ✅ 冰箱:添加 / 搜索筛选 / 临期与低库存 / 批量处理 / 自动扣减与恢复
- ✅ 记录:饮食与反应时间流 / 7日摘要 / 搜索筛选 / 补记编辑 / 文本导出
- ✅ 排敏:品类与单食材状态 / 尝试窗口 / 观察期 / 过敏与个体例外
- ✅ 食谱库:127 道食谱,支持搜索、分类与详情
- 🟡 AI 搭子:聊天 UI、云函数和安全工具已实现,生产部署与隐私披露待发布前核验

## 当前内容规模

- 食物分类:29 个
- 基础食材:32 种
- 食谱:127 道
- 搭配禁忌:9 条

正式用户通过欢迎流程创建宝宝档案；MCP Server 的测试档案与小程序数据相互隔离。

## 项目结构

```
fushi-ditu/
├── apps/
│   ├── api-server/             # Express + oRPC contract-first API
│   └── web-console/            # React operations, safety and developer console
├── packages/
│   └── contracts/              # 共享 Zod/oRPC 输入输出契约
├── app.ts                    # 入口,云能力与档案结构初始化
├── app.json                  # 小程序配置
├── app.wxss                  # 全局样式
├── project.config.json       # 项目配置(含 AppID)
├── data/
│   ├── categories.ts         # 食物分类(28类)
│   ├── ingredients.ts        # 食材属性库(32种)
│   ├── recipes.ts            # 食谱库(127道)
│   └── taboos.ts             # 食材搭配禁忌(9条)
├── utils/
│   ├── planner.ts            # 计划与排敏核心规则
│   ├── menuPreview.ts        # 基于共享安全规则的稳定菜单预览
│   ├── journal.ts            # 饮食记录
│   ├── reactions.ts          # 反应记录与回溯
│   └── storage.ts            # 冰箱存储管理
├── cloudfunctions/chat-ai/   # 小程序 AI 云函数
├── docs/                     # ADR 与面试演示脚本
├── mcp-server/               # 开发者演示用 MCP Server
└── pages/
    ├── index/                # 今日
    ├── plan/                 # 计划
    ├── ai-chat/              # AI 搭子
    ├── review/               # 饮食与反应记录
    └── me/                   # 我的
```

## 当前限制与发布前待办

- 🚫 小程序主数据仍以本地缓存为主,没有完整的跨设备双向同步
- ⚠️ AI 首次会话会把 7 类业务数据备份到按 openid 隔离的 cloudDB,应用内“关于”页已披露该数据流
- ✅ 小程序与 MCP Server TypeScript 构建均通过
- ✅ MCP 冒烟测试 46/46,集成测试 11/11
- [ ] 完成真机 AI 云函数与正式模型 provider 核验
- [x] 统一应用内版本号为 v1.0.4
