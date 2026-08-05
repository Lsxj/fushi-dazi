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

API 不调用 LLM、不保存真实宝宝档案，也不复制安全规则。安全检查请求只携带判断所需的最小档案快照，并且不提供由客户端声明的安全豁免字段；家庭协作演示仅保存明确标注的合成数据。

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
- `GET /api/v1/collaboration/household`
- `GET /api/v1/collaboration/menu-preview`
- `POST /api/v1/collaboration/allergy-changes/request`
- `POST /api/v1/collaboration/allergy-changes/confirm`
- `GET /api/v1/collaboration/audit`

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

家庭协作接口使用明确标注的 `synthetic-demo` 数据，复现一个真实多人照护
流程：共同照护人根据已存在的反应记录提交永久过敏变更申请，主照护人使用
`consentToConfirmIrreversible: true` 显式确认后，服务才更新合成安全档案并
递增 `profileVersion`。只读家人、伪造角色、缺少反应依据、重复申请和重复
确认均被阻断，所有结果都有审计 ID。

非测试环境默认把家庭协作合成状态原子写入
`apps/api-server/.data/collaboration-state.json`，也可通过
`FUSHI_COLLABORATION_STORE_PATH` 指定文件。每次申请和确认都必须携带读取时的
`expectedProfileVersion`；若其他照护者已经更新档案，服务返回
`profile-version-conflict`，保留原档案和菜单并写入拒绝审计。这是可重启恢复的
单节点本地演示，不是支持多副本并发、账号隔离或灾备的生产数据库。

`menu-preview` 从真实食谱库中读取候选，并逐道调用共享的
`utils/safety.ts` 确定性规则。申请仍处于待确认状态时菜单不变；主照护人
确认后，同一生成链路会排除包含过敏食材的食谱、选择安全替代，并返回
`profileVersion`、被排除食谱及具体规则理由。该接口不调用 LLM。

## 测试策略

- 直接调用 oRPC procedure，验证安全、阻断、搭配提示和排敏目标分支。
- 通过 Supertest 访问真实 Express/OpenAPI 边界，验证成功响应和非法输入。
- 用生成的 OpenAPI 文档反查安全、可观测性、评测和家庭协作接口均已接入。
- API 测试覆盖成功、非法输入、隐私最小化、容量上限、固定回归集、家庭角色越权、反应依据、重复申请、显式确认、档案版本冲突、重启恢复和菜单安全重算；四项覆盖率门槛均为 90%。
