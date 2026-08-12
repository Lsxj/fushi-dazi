# ADR-0005：已打卡菜单作为不可自动改写的历史事实

- 状态：Accepted
- 日期：2026-08-12
- 决策范围：周计划重算、观察期与过敏状态变化、身体状态变化、排敏开始/完成/中止、AI/MCP 菜单工具和菜单替换

## Context

家长记录“已经吃了”之后，该餐不再只是计划，而是反应回溯、排敏进度、库存变化和家庭记忆依赖的历史事实。

曾出现以下故障：家长记录新食材已吃并上报不适，将怀疑食材加入观察期后，页面删除整份 `weeklyPlan`；首页随后自动重建计划，导致当天已经吃过的菜单也发生变化。相邻审计还发现，排敏加料清理和 AI 菜单生成存在同类风险。

如果 `mealJournal` 记录的实际食用与 `weeklyPlan` 显示的历史菜单不一致，家长和支持人员无法可靠回答“当时计划吃了什么、实际吃了什么、为什么怀疑这个食材”。

## Decision

- `mealJournal` 中的 `date + mealIndex` 是已打卡餐的稳定业务键。
- 任何非用户手动编辑操作都必须保留该键对应的完整菜单对象，包括食谱、食材、`trialIngredient` 和 `trialMethod`。
- 自动规则、档案/身体状态变化、观察期、过敏状态、排敏流程、AI/MCP 工具和计划重算只能修改未打卡餐。
- 共享规则层使用 `preserveLoggedMealFacts(existingPlan, proposedPlan)` 合并自动计划结果；即使候选计划遗漏该餐次，也必须恢复历史餐。
- 排敏加料的自动添加与清理同样跳过已打卡餐。
- 菜单替换入口必须在领域层检查 `mealJournal`，不能只依赖按钮隐藏或调用方自律。
- AI/MCP 不提供绕过历史保护的参数。
- 用户主动编辑饮食记录是改变实际食用内容的唯一普通入口。清空档案、恢复备份等整库操作属于独立的破坏性流程，必须显式确认并具备恢复说明，不能复用自动重算语义。

## Alternatives considered

### 只在反应页面保留当天第一餐

拒绝。它只能修复当前症状，其他身体状态、AI 或排敏入口仍可能再次覆盖历史。

### 以数组下标保存旧餐

拒绝。餐次顺序和每日餐数可能变化；数组下标不是稳定业务标识，应使用 `date + mealIndex`。

### 只保存 `recipeId`

拒绝。历史展示还依赖食材份数和排敏加料信息；未来食谱库升级也可能改变同一 ID 的内容，因此必须保留当时完整菜单对象。

### 允许 Agent 通过参数选择是否保留

拒绝。历史完整性不是模型或调用者可选策略。

## Consequences

正面影响：

- 反应回溯和历史展示不会因后续规则变化漂移。
- 自动安全调整仍可及时排除未吃餐中的风险食材。
- 页面、AI 与 MCP 共享同一数据不变量，降低遗漏入口的概率。

代价与限制：

- 旧的已打卡餐可能包含后来进入观察期或标记过敏的食材；它必须继续显示，因为这是过去事实，不代表当前仍可推荐。
- 修改每日餐数后，已打卡的额外餐次仍会保留，历史日的餐数可能高于新的档案设置。
- 当前 `weeklyPlan` 与 `mealJournal` 分开存储；若计划本身已在打卡前丢失，仅凭日志中的 `recipeId/recipeName/ingredients` 不能恢复完整 `PlannedMeal` 元数据。

## Evidence

- 统一保护：`utils/planner.ts` 中的 `preserveLoggedMealFacts`。
- 反应流程：`pages/reaction-new/reaction-new.ts` 使用 `rebuildPlanPreservingLoggedMeals`，不再删除整份计划。
- AI 云函数：`cloudfunctions/chat-ai/index.js` 在写回前合并历史餐。
- MCP：`generate_today_menu` 合并历史餐；`replace_meal` 拒绝已打卡餐；`regenerate_week_plan` 无绕过参数。
- 页面替换：首页与计划页在变更前重新检查 `mealJournal`。
- 回归：`test/core-parent-flow-regression.test.js`、`test/chat-ai-history-regression.test.js` 和 MCP smoke test。

## Future changes

任何新增菜单写入必须回答：

1. 这是用户明确编辑历史，还是系统自动调整未来？
2. 是否按 `date + mealIndex` 识别已打卡餐？
3. 候选计划遗漏已打卡餐时是否会恢复完整历史对象？
4. 是否覆盖食谱、食材、加料标记和餐次数量变化？
5. 是否有负向测试证明 `mealJournal` 与已吃菜单保持不变？

如果未来把“计划”和“实际食用”拆成事件模型，应新增 ADR 并迁移历史数据；在此之前不得削弱本决策。
