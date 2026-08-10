# React 运营与安全控制台

React Web Console 是辅食搭子面向产品运营、安全支持和工程人员的内部管理端，与家长使用的微信小程序共同组成完整产品链路。小程序负责菜单、排敏、记录、AI 问答和问题上报；Web Console 接收家长明确授权提交的最小诊断信息，用于定位问题、复核关键安全事件和观察 AI 质量。它不会迁移或替代家长端功能，也不能从后台修改家庭的永久过敏档案。

## 使用场景

- **运营总览**：聚合待认领/关键安全工单、安全回归、AI workflow 回归和 summary-only trace；可将当前评测固化为发布候选，由内部审核人明确批准或阻断并留存记录。安全门禁未通过时 API 拒绝批准，批准本身不会触发自动部署。
- **规则验证**：切换日常、疫苗后和个体过敏三类代表性档案，通过真实 API 验证规则或内容变更是否正确放行、提醒或阻断。
- **AI 质量**：展示规则 trace、provider 状态、固定安全回归与 9 个合成问题组成的 agentic workflow 评估；明确区分离线 mock 与线上模型指标。
- **家庭支持**：围绕“发生了什么、为什么、下一步做什么”处理家长明确授权提交的 metadata-only 工单；证据由现有结构化数据自动汇总，关键安全问题必须人工复核，后台没有代替家长修改永久过敏档案的入口。
- **开发者工具**：集中展示架构、OpenAPI、MCP 与工程质量；家庭角色切换和不可逆确认只存在于 `/developer/scenarios/collaboration` 合成测试场景。
- **端到端类型安全**：直接消费 `@fushi/contracts`，使用 oRPC `OpenAPILink` 调用 Express OpenAPI Handler。
- **服务端与客户端状态分离**：TanStack Query 管理请求状态，Zustand 管理本地实验输入。
- **离线前端测试**：MSW 模拟真实 HTTP 边界，覆盖成功、拦截、空输入、失败与重试路径。
- **失败时安全收敛**：运营或支持数据有任一来源加载失败时，不展示旧的发布结论或家庭快照。

安全结论始终由 `utils/safety.ts` 的确定性规则产生。UI 会显示
`decisionSource: deterministic-rules` 与 `provider: none`，大模型不参与规则判定。
发布候选审核同样由确定性门禁约束：安全通过率、阻断召回率和离线工作流成功率必须全部为 100%，才允许记录“批准”结论；本地记录不能替代生产身份系统或正式发布平台。

## 本地运行

先安装 workspace 依赖：

```bash
pnpm install
pnpm --filter @fushi/web-console exec playwright install chromium
```

打开两个终端：

```bash
pnpm run api:dev
```

```bash
pnpm run web:dev
```

浏览器访问 [http://127.0.0.1:4173](http://127.0.0.1:4173)。Vite 会把 `/api` 和 `/openapi.json` 代理到 `127.0.0.1:3000`。

本地默认使用服务端演示会话。线上支持工单控制台设置两个公开的构建变量：

```bash
VITE_CLOUDBASE_ENV_ID=cloud1-d8g02cdnld86f3823
VITE_API_BASE_URL=https://cloud1-d8g02cdnld86f3823-1451658149.ap-shanghai.app.tcloudbase.com/api
```

线上页面使用 CloudBase SDK 登录，oRPC 客户端自动携带 Access Token。管理员角色只由 API 的 UID 白名单决定，浏览器端不保存密码、不提交 actor，也不能切换角色。线上构建使用 Hash Router，并将首页收敛到真实支持工单，避免把本地合成开发者场景暴露为线上运营能力。

当前部署地址：[https://cloud1-d8g02cdnld86f3823-1451658149.tcloudbaseapp.com/admin/](https://cloud1-d8g02cdnld86f3823-1451658149.tcloudbaseapp.com/admin/)

## 质量门禁

```bash
pnpm --filter @fushi/web-console build
pnpm --filter @fushi/web-console test:coverage
pnpm --filter @fushi/web-console test:e2e
```

前端覆盖率门槛为：语句/行/函数 85%，分支 80%。Playwright 会在隔离端口启动真实 API 与 Vite，使用 Chromium 验证个体过敏阻断、开发者合成场景中的家庭显式确认，以及工单认领、升级、安全复核和关闭。根目录的 `npm run verify` 会同时执行小程序、Contract API、React 控制台、MCP Server 和 Playwright E2E 的完整检查。
