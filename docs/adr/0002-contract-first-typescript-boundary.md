# ADR-0002：使用 Zod + oRPC 建立 contract-first TypeScript 边界

- 状态：Accepted
- 日期：2026-07-28
- 决策范围：React Solution Console 与 Express API 的 HTTP 接口

## Context

同一业务字段若分别在浏览器和服务端手写类型，容易出现请求能编译但运行时失败、错误码新增后 UI 不认识、OpenAPI 与真实实现不一致等问题。项目还需要展示 monorepo 内共享库的维护方式。

## Decision

- 在 `packages/contracts/` 使用 Zod 定义输入和输出。
- 由 oRPC contract 描述路由、方法、标签和 schema。
- Express 通过 oRPC OpenAPI Handler 实现 contract。
- React 通过 `OpenAPILink` 消费同一 contract，不复制 DTO。
- 变更顺序固定为 schema → domain → handler → tests → UI。
- TypeScript 边界保持 strict，不在新接口使用 `any`。

## Alternatives considered

### 前后端分别维护 TypeScript interface

拒绝。interface 不提供运行时验证，重复定义也会产生漂移。

### 只写 OpenAPI YAML，再生成所有代码

暂未采用。对当前 TypeScript monorepo 而言，Zod/oRPC 更接近实现语言，修改和本地反馈更快；OpenAPI 仍由 contract 生成供外部调用方使用。

### 使用 GraphQL

暂未采用。当前接口以明确的命令和查询为主，REST/RPC 边界更简单，也更贴近目标岗位的 Express + oRPC 栈。

## Consequences

正面影响：

- 输入在 HTTP 边界进行运行时校验。
- API、OpenAPI 和 React 客户端共享字段与错误码。
- 合约变化会在编译期暴露未更新的调用方。

代价与限制：

- 共享 contract 会使前后端发布产生版本协同要求。
- 领域规则不能塞进 Zod schema；关键检查仍需在 domain 层重复执行。
- 未来对外开放 API 时需要兼容策略和版本弃用流程。

## Evidence

- 合约：`packages/contracts/src/index.ts`
- 服务实现：`apps/api-server/src/router.ts`
- React 客户端：`apps/web-console/src/api/client.ts`
- OpenAPI 测试：`apps/api-server/test/http.test.ts`
- 工作区：`pnpm-workspace.yaml`

## Production evolution

增加 API 版本兼容矩阵、breaking-change 检查、契约发布包和消费者验证；这些属于后续交付体系，不在本项目继续扩展 CI/CD。
