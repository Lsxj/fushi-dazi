# SAP 定向简历项目模块

目标岗位：AI Solution Architect / AI Solutions Engineer（SAP Built-In Support JD）

> 使用说明：这是可复制进简历的项目模块，不是完整简历。项目时间依据当前 Git 历史写为 2026.07–至今；姓名、工作年限、公司经历和生产基础设施经验仍需在完整简历中单独核实。

## 推荐的候选人定位

**AI Solutions Engineer｜TypeScript Full-Stack & Agentic Workflow Engineering**

15 秒招聘方印象应当是：一名能把真实业务约束转成类型安全产品、确定性安全规则和可复用 AI 工具的 hands-on AI Solutions Engineer；目前最强证据来自端到端个人项目，不把它包装成生产级企业平台。

## 中文版（建议放在第一页上半部分）

### 辅食搭子｜个人 AI 工程作品集｜2026.07–至今

[github.com/Lsxj/fushi-dazi](https://github.com/Lsxj/fushi-dazi)

面向 4–24 月龄儿童多照护者家庭，设计并实现连接宝宝档案、排敏、库存、菜单、饮食执行与反应记录的辅助决策产品；重点解决 AI 建议不能绕过食物安全规则，以及多人修改过敏档案可能引发误喂的问题。

- 设计 **rule-first / LLM-second** 架构：将食谱适用性、过敏状态、尝试窗口和菜单重算沉淀为共享确定性规则，LLM 仅负责意图理解、工具编排与解释，使小程序、API 和 MCP 工作流复用同一安全边界。
- 在 **pnpm monorepo** 中完成 React 19 与 TypeScript 后端的端到端实现：以 **Zod + oRPC** 先定义共享契约，再接入 Express/OpenAPI 与 React；使用 React Query 管理服务端状态、Zustand 管理本地交互状态，并在核心 workspace 边界启用 TypeScript strict mode。
- 将多人照护场景实现为可审计业务闭环：危险档案变更必须经过 RBAC、字面量显式确认和乐观并发版本校验；成功后原子持久化档案与审计事件并重算菜单，过期写入被拒绝且不改变原状态。
- 将重复的 AI 开发与业务操作固化为 **23 个 MCP tools、10 个 resources、3 个 prompts**，并编写项目级 `AGENTS.md` 与安全变更 Skill，把契约优先、负向测试、人工确认和质量门禁沉淀为团队可复用工程资产。
- 建立本地可重复的质量门禁：API 40/40、React/MSW 24/24、Playwright Chromium E2E 2/2、MCP 单元 9/9、冒烟 46/46、集成 11/11；API 行覆盖率 98.77%，React 行覆盖率 94.38%。9 个固定 agentic 案例覆盖工具选择、安全阻断与 grounding 代理，离线 `mock-policy` 全部通过，明确不等同于线上模型准确率。
- 通过 ADR 记录规则边界、contract-first、显式授权与离线评估等关键取舍，并明确当前单节点文件存储、mock IdP、合成数据和未完成线上模型验证的边界，为后续迁移数据库、真实认证和生产可观测性保留演进路径。

**技术栈：** TypeScript、Node.js、Express、oRPC、Zod、React 19、React Router、TanStack Query、Zustand、Vite、Tailwind CSS、Vitest、MSW、Playwright、MCP、pnpm workspaces、GitHub Actions

> GitHub Actions 工作流已配置，但若线上运行记录不可展示，面试中只表述为“配置了 CI 工作流，本地 `npm run verify` 已实际通过”，不要声称已验证远程 CI 结果。

## English version

### Fushi Dazi | Personal AI Engineering Portfolio | Jul 2026–Present

[github.com/Lsxj/fushi-dazi](https://github.com/Lsxj/fushi-dazi)

Designed and implemented a decision-support product for caregivers of children aged 4–24 months, connecting child profiles, allergen trials, pantry inventory, meal plans, feeding records, and reaction tracking. The core design constraint was preventing AI suggestions or concurrent caregiver edits from bypassing food-safety rules.

- Designed a **rule-first, LLM-second** architecture that keeps recipe applicability, allergy state, trial windows, and menu recomputation in shared deterministic rules; limited the LLM boundary to intent interpretation, tool orchestration, and explanation across the mini-program, API, and MCP workflows.
- Delivered an end-to-end React 19 and TypeScript backend in a **pnpm monorepo** using **Zod and oRPC** contract-first schemas, Express/OpenAPI, React Query for server state, Zustand for local interaction state, and strict TypeScript at the core workspace boundaries.
- Implemented an auditable multi-caregiver mutation flow with RBAC, literal confirmation, optimistic version checks, atomic profile/audit persistence, and deterministic menu recomputation; stale writes are rejected without changing the profile or menu.
- Turned repeated engineering and product workflows into **23 MCP tools, 10 resources, and 3 prompts**, supported by a repository-level `AGENTS.md` and a reusable safety-change Skill that codifies contract-first delivery, negative tests, human approval, and quality gates.
- Built a reproducible local quality gate covering 40 API tests, 24 React/MSW tests, 2 Playwright Chromium E2E flows, 9 MCP unit tests, 46 smoke tests, and an 11-step integration flow; API line coverage is 98.77% and React line coverage is 94.38%. Added 9 deterministic agentic regression cases for tool selection, safety-block recall, and a grounding proxy, explicitly reported as offline `mock-policy` results rather than live-model accuracy.
- Documented architectural trade-offs through ADRs and made the current single-node file store, mock identity provider, synthetic data, and unverified live-model path explicit, with an evolution path toward production persistence, authentication, and observability.

**Stack:** TypeScript, Node.js, Express, oRPC, Zod, React 19, React Router, TanStack Query, Zustand, Vite, Tailwind CSS, Vitest, MSW, Playwright, MCP, pnpm workspaces, GitHub Actions

## JD 证据矩阵

| JD 要求 | 重要性 | 证据等级 | 本项目证据 | 简历风险 |
| --- | --- | --- | --- | --- |
| React 19 + TypeScript backend 端到端交付 | 核心结果 | Demonstrated | React Console、Express/oRPC API、共享 contracts | 低 |
| oRPC + Zod contract-first | 核心结果 | Demonstrated | schema → handler → OpenAPI client；前后端共享类型 | 低 |
| React Router / React Query / Zustand / Vite / Tailwind | 硬性要求 | Demonstrated | Web Console 中均有实际调用 | 低 |
| Vitest / MSW / Playwright 与覆盖率 | 硬性要求 | Demonstrated | 已通过的测试数量与覆盖率门槛 | 低 |
| pnpm monorepo | 硬性要求 | Demonstrated | contracts、API、Web workspace | 低；规模小于 JD 的约 50 包 |
| TypeScript strict mode | 硬性要求 | Demonstrated | contracts、API、Web、MCP 边界启用 strict | 中；微信小程序根 tsconfig 尚未开启 strict，不能写成“全仓 strict” |
| Conventional Commits / clean Git | 硬性要求 | Demonstrated | Git 历史可见 Conventional Commits | 中；没有 Jira-linked commit 证据 |
| 扩展 AI coding workflow | 核心结果 | Demonstrated | MCP、Skill、prompts、AGENTS.md、离线 eval | 低，是本项目最强匹配点之一 |
| Feature flag / offline mock mode | 工作方式 | Transferable | provider 与 execution mode 可见，支持 mock/live 边界 | 中；不是完整渐进发布平台 |
| GitHub Actions CI/CD | 加分项 | Transferable | workflow 已配置，本地门禁已验证 | 中；线上执行记录需另行证明 |
| Docker / Kubernetes / Istio / ArgoCD | 加分项 | Gap（本项目） | 无 | 高；应由其他项目或工作经历提供，不写入本项目 |
| Storybook / Stryker / SonarQube | 加分项 | Gap | 无 | 低到中；不要关键词堆砌 |
| 3+ 年毕业后生产 TypeScript 经验 | 硬性要求 | Unverified | 不能由个人项目证明 | Blocking；必须在完整工作经历中核实并前置展示 |
| 生产规模、SLA、事故处理与长期运维 | 隐含 seniority | Gap（本项目） | 当前是本地合成演示 | 高；其他真实项目需要给出规模与责任范围 |

## Recruiter-screen 结论

### Blocking

- **3+ 年生产 TypeScript 经历尚未核实。** 这是 JD 的明确硬门槛，文案无法补救。完整简历必须给出公司、岗位、时间、个人责任和至少一个可归因的生产结果；若实际不足，应接受该岗位筛选风险。

### High risk

- **企业生产深度不足。** 本项目证明了架构判断和 hands-on 实现，但不证明 Kubernetes/Istio/ArgoCD、真实流量、SLA、on-call 或事故处理。把这些证据放到其他项目，且标明规模、部署环境和本人责任。
- **Architect 头衔可能高于现有项目证据。** 当前材料更自然地支持 hands-on **AI Solutions Engineer**；若使用 AI Solution Architect，需要工作经历补充跨团队方案设计、客户沟通、非功能需求和生产落地证据。

### Advisory

- 第一页只保留 4–5 条最强项目 bullet；优先保留 rule-first、contract-first、多人照护安全闭环、AI workflow 和测试证据。
- 不把 23 个工具或 100% 离线评测单独当作业务影响；面试时始终解释它们证明的是工程范围和回归稳定性。
- `faker`、Jira-linked commits、Storybook、Stryker 和 SonarQube 没有证据，不应为了 ATS 写入技能表。

## 仍需本人确认的信息

- 毕业时间，以及毕业后生产 TypeScript 的实际年限。
- 现任和过往公司、岗位、项目日期、团队规模、个人 ownership 与可披露指标。
- 可用于证明 CI/CD、Docker、Kubernetes、Istio 或 GitOps 的其他项目，以及本人实际负责的环节。
- 求职地点、语言版本和简历目标长度；这些信息确认后才能完成整份一至两页简历和最终 PDF 审核。
