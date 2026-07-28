# React Solution Console

面向 AI Solution Architect / AI Solutions Engineer 面试演示的独立 Web 控制台。它不迁移或替代现有微信小程序，而是把仓库中的架构能力、AI 决策边界和工程质量变成可讲解、可操作的作品集界面。

## 展示内容

- **方案总览**：用四层蓝图说明 Experience、AI Orchestration、Safety Boundary 与 Quality & Delivery 的职责。
- **安全规则实验室**：切换日常、疫苗后、个体过敏三类档案，通过真实 API 观察可解释决策。
- **端到端类型安全**：直接消费 `@fushi/contracts`，使用 oRPC `OpenAPILink` 调用 Express OpenAPI Handler。
- **服务端与客户端状态分离**：TanStack Query 管理请求状态，Zustand 管理本地实验输入。
- **离线前端测试**：MSW 模拟真实 HTTP 边界，覆盖成功、拦截、空输入、失败与重试路径。

安全结论始终由 `utils/safety.ts` 的确定性规则产生。UI 会显示 `decisionSource: deterministic-rules`，大模型不参与规则判定。

## 本地运行

先安装 workspace 依赖：

```bash
pnpm install
```

打开两个终端：

```bash
pnpm run api:dev
```

```bash
pnpm run web:dev
```

浏览器访问 [http://127.0.0.1:4173](http://127.0.0.1:4173)。Vite 会把 `/api` 和 `/openapi.json` 代理到 `127.0.0.1:3000`。

## 质量门禁

```bash
pnpm --filter @fushi/web-console build
pnpm --filter @fushi/web-console test:coverage
```

前端覆盖率门槛为：语句/行/函数 85%，分支 80%。根目录的 `npm run verify` 会同时执行小程序、Contract API、React 控制台和 MCP Server 的完整检查。
