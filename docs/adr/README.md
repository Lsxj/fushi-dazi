# Architecture Decision Records

这些 ADR 记录“辅食搭子”已经落地的关键架构决策。它们不是愿景清单；每项决策都链接到可运行代码、API 或测试证据。

| ADR | 决策 | 状态 | 主要取舍 |
|---|---|---|---|
| [ADR-0001](./0001-rule-first-safety-boundary.md) | 食物安全采用确定性规则边界 | Accepted | 牺牲 LLM 的自由度，换取可解释、可测试和稳定阻断 |
| [ADR-0002](./0002-contract-first-typescript-boundary.md) | 使用 Zod + oRPC 建立 contract-first 边界 | Accepted | 增加共享契约维护成本，避免前后端类型漂移 |
| [ADR-0003](./0003-explicit-consent-and-optimistic-concurrency.md) | 不可逆档案变更采用显式确认、角色授权和乐观并发 | Accepted | 增加操作步骤，避免多人照护中的静默覆盖和误改 |
| [ADR-0004](./0004-offline-agentic-evaluation.md) | 离线 agentic 评估必须区分 mock、规则结果和线上模型质量 | Accepted | 指标范围更保守，但不会把离线路由准确率包装成模型能力 |

## 使用方式

- 设计评审：先看 Context、Decision 和 Alternatives。
- 代码评审：检查 Consequences 中的约束是否仍成立。
- 面试演示：配合 [5 分钟演示脚本](../interview-demo.md)，用业务问题解释技术取舍。
- 未来变更：若决策被替代，新增 ADR 并将旧记录标为 Superseded，不覆盖历史。
