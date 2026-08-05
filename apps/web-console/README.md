# React 运营与安全控制台

面向产品、安全支持和工程人员的独立内部 Web 控制台。它不迁移或替代家长使用的微信小程序：主界面负责运营判断、发布前规则验证、AI 质量和只读家庭支持，技术作品集与合成变更场景集中在开发者专区。

## 使用场景

- **运营总览**：聚合待家庭确认事项、安全回归、AI workflow 回归和 summary-only trace；可将当前评测固化为发布候选，由内部审核人明确批准或阻断并留存记录。安全门禁未通过时 API 拒绝批准，批准本身不会触发自动部署。
- **规则验证**：切换日常、疫苗后和个体过敏三类代表性档案，通过真实 API 验证规则或内容变更是否正确放行、提醒或阻断。
- **AI 质量**：展示规则 trace、provider 状态、固定安全回归与 9 个合成问题组成的 agentic workflow 评估；明确区分离线 mock 与线上模型指标。
- **家庭支持**：只读查看档案版本、授权结果、菜单影响和审计证据；后台没有代替家长确认永久过敏变更的入口。
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

## 质量门禁

```bash
pnpm --filter @fushi/web-console build
pnpm --filter @fushi/web-console test:coverage
pnpm --filter @fushi/web-console test:e2e
```

前端覆盖率门槛为：语句/行/函数 85%，分支 80%。Playwright 会在隔离端口启动真实 API 与 Vite，使用 Chromium 验证规则验证页的个体过敏阻断，以及开发者合成场景中的只读拒绝、共同照护人申请、主照护人显式确认和菜单替换。根目录的 `npm run verify` 会同时执行小程序、Contract API、React 控制台、MCP Server 和 Playwright E2E 的完整检查。
