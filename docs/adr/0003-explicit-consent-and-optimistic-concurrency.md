# ADR-0003：不可逆档案变更采用显式确认、角色授权和乐观并发

- 状态：Accepted
- 日期：2026-08-05
- 决策范围：多人照护场景中的永久过敏档案变更

## Context

老人、保姆或另一位家长可能最先发现进食反应，但“永久过敏”会影响所有后续菜单。允许任何照护人直接修改会产生误改风险；多人同时打开页面时，较旧页面还可能覆盖刚完成的新档案。

## Decision

- 共同照护人只能基于已有反应记录提交申请，不能直接改档案。
- 只读成员不能提交；服务端根据 actor ID 重新绑定角色，不信任客户端自报权限。
- 主照护人必须勾选确认框，并向 API 发送字面量 `true` 的不可逆确认。
- 申请与确认携带读取时的 `expectedProfileVersion`。
- 当前版本变化时返回 `profile-version-conflict`，不修改档案或菜单。
- 成功、拒绝和待确认结果都写入包含角色、原因、版本和确认凭证的审计记录。
- 确认成功后，菜单通过共享安全规则重新计算，而不是由 UI 手动替换。

## Alternatives considered

### 最后写入者覆盖前一次修改

拒绝。简单但会静默丢失另一位照护者刚完成的安全决策。

### 所有成员都能直接修改

拒绝。降低操作步骤的同时放大了误触和权限滥用风险。

### 对单个合成档案使用悲观数据库锁

暂未采用。当前是单节点作品集，版本检查更容易解释和测试；生产多副本环境应由事务数据库保证比较与写入的原子性。

## Consequences

正面影响：

- 不可逆修改有明确责任人和证据。
- 旧页面无法静默覆盖新状态。
- 申请待确认时菜单保持不变，符合真实照护预期。

代价与限制：

- 用户多一步确认，冲突后需要重新核对并提交。
- 当前文件存储只适用于单节点合成演示，不支持多副本锁和灾备。
- 当前身份是 mock IdP，不是生产认证。

## Evidence

- Contract：`RequestAllergyChangeInputSchema`、`ConfirmAllergyChangeInputSchema`
- Domain：`apps/api-server/src/collaboration.ts`
- 存储：`apps/api-server/src/collaboration-store.ts`
- UI：`apps/web-console/src/pages/CollaborationPage.tsx`
- E2E：`apps/web-console/e2e/critical-safety-flows.spec.ts`

## Production evolution

接入真实家庭邀请与身份系统；使用事务数据库执行条件更新；增加通知、撤销策略、数据导出/删除、备份恢复和多副本一致性验证。
