# 辅食搭子 API Server

最小 contract-first 后端，用于展示 pnpm monorepo、Zod、oRPC、Express 和 OpenAPI 的完整链路。

## 架构边界

```text
HTTP request
  → packages/contracts (Zod + oRPC contract)
  → apps/api-server (Express adapter)
  → utils/safety.ts
  → utils/planner.ts deterministic rules
```

API 不调用 LLM、不保存宝宝档案，也不复制安全规则。请求只携带判断所需的最小档案快照，并且不提供由客户端声明的安全豁免字段。

## 运行

在仓库根目录执行：

```bash
pnpm install
pnpm run workspace:verify
pnpm run api:dev
```

服务默认监听 `127.0.0.1:3000`：

- `GET /health`
- `GET /openapi.json`
- `POST /api/v1/safety/check`

示例：

```bash
curl -X POST http://127.0.0.1:3000/api/v1/safety/check \
  -H 'Content-Type: application/json' \
  --data @request.json
```

接口输出包含 `decisionSource: "deterministic-rules"`，让调用方能够审计结论来源。

## 测试策略

- 直接调用 oRPC procedure，验证安全、阻断、搭配提示和排敏目标分支。
- 通过 Supertest 访问真实 Express/OpenAPI 边界，验证成功响应和非法输入。
- 用生成的 OpenAPI 文档反查 `/v1/safety/check` 已接入。
- `src/app.ts`、`src/openapi.ts`、`src/router.ts` 四项覆盖率门槛均为 90%；当前均为 100%。
