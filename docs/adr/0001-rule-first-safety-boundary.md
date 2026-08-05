# ADR-0001：食物安全采用确定性规则边界

- 状态：Accepted
- 日期：2026-07-28
- 决策范围：菜单推荐、食谱适用性、排敏状态、个体过敏和反应后的安全建议

## Context

辅食推荐会直接影响宝宝吃什么。LLM 擅长理解家长问题和解释结果，但模型输出具有概率性，无法作为过敏、观察期或疫苗后限制的唯一判定来源。相同档案和食材必须得到稳定结论，并能够解释为何放行或阻断。

## Decision

所有食物安全结论由共享确定性规则产生：

- 小程序、HTTP API、MCP 和菜单预览复用 `utils/` 中的规则。
- LLM 只能选择工具和解释结果，不能声明安全豁免。
- 菜单和饮食写入必须先通过规则；永久过敏等不可逆操作不能交给 LLM 自动执行。
- 输出携带 `decisionSource: deterministic-rules`，mock/live provider 状态单独展示。
- 阻断路径和允许路径都必须进入自动化回归。

## Alternatives considered

### 让 LLM 直接判断是否安全

拒绝。它难以保证同输入同输出，也无法给出足够稳定的审计证据。

### LLM 判断后再做少量关键词过滤

拒绝。关键词过滤无法表达档案状态、观察窗口、个体例外和搭配规则之间的组合关系。

### 所有能力都只保留规则，不使用 LLM

没有采用。自然语言理解、工具编排和家长可读解释仍适合由 LLM 完成，只是不进入安全判定路径。

## Consequences

正面影响：

- 安全结论可重复、可解释、可离线测试。
- 没有模型密钥时仍能完整运行关键业务路径。
- MCP、API 和 UI 不需要复制安全逻辑。

代价与限制：

- 新规则需要明确的产品或专业来源，不能靠 prompt 临时增加。
- 规则库需要版本管理、专业审核和回归集维护。
- 规则通过不等于医疗诊断，界面仍需保留非医疗建议声明。

## Evidence

- 共享规则：`utils/safety.ts`、`utils/planner.ts`
- HTTP 边界：`POST /api/v1/safety/check`
- 浏览器回归：`apps/web-console/e2e/critical-safety-flows.spec.ts`
- 固定安全评测：`apps/api-server/src/evaluation.ts`
- 安全变更流程：`skills/fushi-safety-change/SKILL.md`

## Production evolution

生产化仍需增加规则版本、内容审核人、变更审计、灰度发布和安全事件告警；这些能力不能由更换模型替代。
