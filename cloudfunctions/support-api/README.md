# Support API HTTP Function

该目录是 `apps/api-server` 的 CloudBase HTTP 云函数部署壳，不包含另一套业务实现。
`scripts/build-support-http-function.sh` 使用 esbuild 将 API、共享契约、确定性规则和必要数据打包为忽略提交的 `server.mjs`。

本地构建与健康检查：

```bash
./scripts/build-support-http-function.sh --check
```

只读云端预检：

```bash
./scripts/deploy-support-http-function.sh --check
```

真实部署会创建或更新 `support-api` HTTP 云函数，但不会自动创建公网 HTTP 网关：

```bash
ALLOW_HTTP_FUNCTION_DEPLOY=1 ./scripts/deploy-support-http-function.sh
```

函数启动在 CloudBase HTTP 函数规定的 `9000` 端口，工单写入 `support_cases`；用户授权、状态机、版本冲突和审计逻辑仍来自 `apps/api-server`。
