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
支持工单只接收经过用户字面量授权的结构化诊断元数据，不接收宝宝姓名、自由备注、完整聊天、食材清单或联系方式。

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
- `GET /api/v1/evaluations/agentic`
- `GET /api/v1/collaboration/household`
- `GET /api/v1/collaboration/menu-preview`
- `POST /api/v1/collaboration/allergy-changes/request`
- `POST /api/v1/collaboration/allergy-changes/confirm`
- `GET /api/v1/collaboration/audit`
- `POST /api/v1/support/cases`
- `POST /api/v1/support/cases/track`
- `GET /api/v1/support/cases`
- `POST /api/v1/support/cases/update`

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

Agentic 评测接口运行 9 个固定的合成家庭问题，复用小程序与云函数 mock 的
共享工具路由，并真实调用确定性安全规则。它量化工具选择正确率、安全阻断
召回率、grounding 代理指标和端到端成功率。`provider: "mock-policy"` 表示
这里没有调用线上模型；grounding 代理只验证是否先选择了正确数据来源工具，
不等同于自然语言回答事实准确率。

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

支持工单使用 `new → investigating → escalated → resolved → closed` 状态机和
`expectedCaseVersion` 乐观并发。关键安全工单必须先升级，再由绑定角色的安全审核人解决；伪造角色、过期版本和非法流转均被拒绝并写入 metadata-only 审计。家庭追踪需要 case ID 与仅提交端持有的 tracking token，服务端只保存 token 的 SHA-256 哈希。

默认开发模式仍使用原子文件。部署到 CloudBase HTTP 云函数时，通过环境变量切换到事务型云数据库存储：

```bash
HOST=0.0.0.0 \
FUSHI_SUPPORT_STORE=cloudbase \
CLOUDBASE_ENV_ID=cloud1-your-env \
FUSHI_SUPPORT_COLLECTION=support_cases \
pnpm --filter @fushi/api-server start
```

需要预先在对应环境创建 `support_cases` 集合。每个工单及其审计记录保存在同一文档，状态更新在数据库事务中完成版本检查、工单写入和审计写入。本地运行使用演示身份；线上管理员 API 验证 CloudBase Access Token，并通过 `FUSHI_ADMIN_OPERATORS` 在服务端完成 UID 到角色的映射。

`cloudfunctions/support-api/` 只是部署壳，业务实现仍来自当前 API、共享契约和规则层。部署脚本默认只做构建、健康检查和只读云端预检：

```bash
./scripts/deploy-support-http-function.sh --check
```

真实部署必须显式设置 `ALLOW_HTTP_FUNCTION_DEPLOY=1`，并可能使用 CloudBase 配额。云函数通过 `FUSHI_ROUTE_SCOPE=support-intake` 只开放创建工单、凭令牌查询状态和健康检查；演示登录及后台管理接口全部返回 404。小程序通过 `wx.cloud.callHTTPFunction` 访问服务。

管理员 API 使用独立的 `admin-api` HTTP 云函数，与小程序入口隔离。它只开放会话检查、工单读取/更新和关联 Trace 查询，通过 `FUSHI_ADMIN_OPERATORS` 将已验证的 CloudBase UID 映射为服务端角色。部署前检查：

```bash
./scripts/deploy-admin-api.sh --check
```

真实部署必须显式设置 `ALLOW_ADMIN_API_DEPLOY=1`。对应 HTTP 网关路由必须启用 CloudBase 身份认证；API 会再次调用 CloudBase 用户信息接口验证 Bearer Token，并拒绝不在 UID 白名单中的账号。

浏览器跨域访问还必须配置逗号分隔的 `FUSHI_ADMIN_ALLOWED_ORIGINS`。未列入白名单的预检请求返回 403，不能使用 `*` 代替明确的后台站点来源。

当前部署入口：

```text
https://cloud1-d8g02cdnld86f3823-1451658149.ap-shanghai.app.tcloudbase.com/api
```

网关使用 `/api` 前缀匹配并保留原始路径，开启身份认证、安全域名校验，以及总 QPS 20 / 单 IP QPS 5 的限流。匿名请求应返回 `401 MISSING_CREDENTIALS`。

## 测试策略

- 直接调用 oRPC procedure，验证安全、阻断、搭配提示和排敏目标分支。
- 通过 Supertest 访问真实 Express/OpenAPI 边界，验证成功响应和非法输入。
- 用生成的 OpenAPI 文档反查安全、可观测性、评测和家庭协作接口均已接入。
- API 测试覆盖成功、非法输入、隐私最小化、容量上限、安全与 agentic 固定回归集、家庭角色越权、反应依据、重复申请、显式确认、档案版本冲突、重启恢复和菜单安全重算；四项覆盖率门槛均为 90%。
