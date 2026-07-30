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
- `GET /api/v1/observability/traces`
- `GET /api/v1/evaluations/safety`
- `GET /api/v1/governance/policy`
- `POST /api/v1/governance/actions/request`
- `POST /api/v1/governance/actions/confirm`
- `GET /api/v1/governance/audit`

示例：

```bash
curl -X POST http://127.0.0.1:3000/api/v1/safety/check \
  -H 'Content-Type: application/json' \
  --data @request.json
```

安全检查输出包含 `traceId`、`durationMs` 和
`decisionSource: "deterministic-rules"`，让调用方能够关联并审计结论来源。

Trace 使用容量为 100 的进程内存储，只保存食材数量、档案状态和结果计数，
不保存食材名、宝宝姓名或备注。评测接口运行固定的安全回归集，不生成线上
trace，也不调用模型；`provider: "none"` 是明确的运行状态，不是 mock 模型。

治理接口是显式标注的 `mock-demo` Identity Provider / `simulation`
执行模式，用于展示确定性 RBAC、一次性确认令牌和 metadata-only 审计。
永久过敏标记授权只有绑定的 `safety-admin` 可以申请，确认接口要求
`consentToConfirmIrreversible: true`；演示不会写入真实档案，响应始终包含
`externalMutationPerformed: false`。

## 测试策略

- 直接调用 oRPC procedure，验证安全、阻断、搭配提示和排敏目标分支。
- 通过 Supertest 访问真实 Express/OpenAPI 边界，验证成功响应和非法输入。
- 用生成的 OpenAPI 文档反查安全、可观测性、评测和治理接口均已接入。
- API 测试覆盖成功、非法输入、隐私最小化、容量上限、固定回归集、越权、令牌过期与重放；四项覆盖率门槛均为 90%，当前均为 100%。
