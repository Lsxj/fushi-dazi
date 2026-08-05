# ADR-0004：离线 agentic 评估必须区分 mock、规则结果和线上模型质量

- 状态：Accepted
- 日期：2026-08-05
- 决策范围：AI 工具路由、grounding、安全阻断和评估展示

## Context

项目需要在没有模型密钥和付费服务时重复验证 agentic workflow，但离线关键词路由的高分不能证明线上模型同样可靠。若把 mock 结果包装成模型能力，评估会失去可信度，也会掩盖回答没有引用工具结果的问题。

## Decision

- 建立 9 个固定合成问题的离线评估集。
- 工具选择复用小程序与云函数 mock 的共享路由策略。
- 安全案例真实调用确定性规则，不伪造 allow/block。
- 输出四项指标：工具选择正确率、安全阻断召回、grounding proxy、端到端成功率。
- `provider: mock-policy` 和 `executionMode: offline-deterministic` 必须可见。
- Grounding proxy 只表示“回答前选择了正确数据源工具”，不等同于回答事实准确率。
- Mock 最终回答必须读取工具结果；结果缺失时拒绝判断，不能使用固定业务数据补齐。

## Alternatives considered

### 只展示几个成功对话截图

拒绝。不可重复、无法发现回归，也不能量化失败。

### 使用 LLM-as-a-judge 给所有回答打分

暂未采用。会引入模型成本、评分漂移和新的可信边界；后续线上抽样可以把它作为人工标注的补充，而不是唯一裁判。

### 把 mock 的 100% 直接描述为模型准确率

拒绝。当前指标只覆盖固定数据集和确定性路由策略。

## Consequences

正面影响：

- 无密钥环境仍能运行回归并发现工具路由变化。
- 安全指标与模型质量指标保持边界清晰。
- 评估曾直接发现 mock 固定回答“安全”和虚构菜单的问题，并推动修复。

代价与限制：

- 9 个案例不能代表真实用户语言分布。
- Grounding proxy 不检查回答是否完整、措辞是否恰当。
- 暂无线上 provider 的人工标注基准、置信区间和分群分析。

## Evidence

- 共享路由：`utils/agentRouting.ts`
- 评估集：`utils/agentEvaluation.ts`
- API：`GET /api/v1/evaluations/agentic`
- 面板：`apps/web-console/src/pages/ObservabilityPage.tsx`
- 回归：`test/chat-ai-agentic-evaluation.test.js`

## Production evolution

收集去标识化真实问题并经过授权；建立人工标注集、线上 provider 分版本对比、失败分类、成本/延迟指标和周期性漂移检查。任何新增数据采集都必须同步更新隐私披露和删除机制。
