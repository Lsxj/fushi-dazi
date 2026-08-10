# SAP 定向简历项目模块

目标岗位：AI Solution Architect / AI Solutions Engineer（SAP Built-In Support JD）

> 使用说明：这是可复制进简历的项目模块，不是完整简历。项目时间依据当前 Git 历史写为 2026.07–至今；姓名、工作年限、公司经历和生产基础设施经验仍需在完整简历中单独核实。

## 推荐的候选人定位

**AI Solutions Engineer｜TypeScript Full-Stack & Agentic Workflow Engineering**

15 秒招聘方印象应当是：一名能把真实业务约束转成类型安全产品、确定性安全规则和可复用 AI 工具的 hands-on AI Solutions Engineer；目前最强证据来自端到端个人项目，不把它包装成生产级企业平台。

## 中文版（建议放在第一页上半部分）

### 辅食搭子｜个人 AI 工程作品集｜2026.07–至今

[github.com/Lsxj/fushi-dazi](https://github.com/Lsxj/fushi-dazi)

面向 4–24 月龄宝宝家庭，独立设计并实现由微信小程序和 React 管理后台组成的辅食辅助决策产品：家长在小程序管理档案、排敏、菜单、库存和饮食记录，并通过 AI 获取应用内帮助；当菜单或 AI 回答出现疑问时，可授权提交最小诊断信息，由后台完成调查、安全复核和审计。

- 打通 **家长端到内部支持端** 的完整流程：小程序内的问题上报携带客户端版本、发生时间和可选诊断标识；React 后台支持工单认领、结构化调查、Critical 安全升级和处理时间线，形成与 Built-In Support / Case Management 相近的应用内支持场景，同时禁止后台代替家长修改永久过敏档案。
- 设计 **rule-first / LLM-second** 架构：将食谱适用性、过敏状态、尝试窗口和菜单重算放入共享 TypeScript 规则，LLM 仅负责理解问题、选择工具和解释结果，使小程序、API 与 MCP Agent 使用同一安全判断来源。
- 在 **pnpm workspace** 中以 **Zod + oRPC** 先定义共享契约，再实现 Express/OpenAPI 服务和 React 19 客户端；使用 React Query 管理工单、Trace 与评测等服务端状态，Zustand 仅管理页面内交互状态，避免前后端类型和状态职责漂移。
- 将重复的产品操作和 AI 开发流程封装为 **23 个 MCP tools、10 个 resources、3 个 prompts**，并编写项目级 `AGENTS.md` 与安全变更 Skill，把工具调用边界、负向测试、人工确认和质量门禁沉淀为可复用工程资产。
- 建立可重复质量门：70 项 API、36 项 React/MSW、3 项 Playwright Chromium E2E、9 项 MCP 单元、46 项冒烟和 11 步集成测试全部通过；API / React 行覆盖率分别为 96.92% / 89.16%，9 个固定 agentic 案例覆盖工具选择、安全阻断和 grounding proxy，并明确标注为离线 `mock-policy` 结果。
- 通过 ADR 记录确定性安全、contract-first、显式授权和离线评估等取舍；明确当前单节点文件存储、本地演示身份、合成数据和未验证线上模型的限制，不将 Docker、Kubernetes、Istio 或 ArgoCD 描述为本项目已实现能力。

**技术栈：** TypeScript、Node.js、Express、oRPC、Zod、React 19、React Router、TanStack Query、Zustand、Vite、Tailwind CSS、Vitest、MSW、Playwright、MCP、pnpm workspaces、GitHub Actions

> GitHub Actions 工作流已配置，但若线上运行记录不可展示，面试中只表述为“配置了 CI 工作流，本地 `npm run verify` 已实际通过”，不要声称已验证远程 CI 结果。

## English version

### Fushi Dazi | Personal AI Engineering Portfolio | Jul 2026–Present

[github.com/Lsxj/fushi-dazi](https://github.com/Lsxj/fushi-dazi)

Independently designed and implemented a complementary-feeding decision-support product for caregivers of children aged 4–24 months, comprising a WeChat Mini Program and a React operations console. Caregivers manage profiles, allergen trials, menus, inventory, and feeding records in the Mini Program, use AI for in-context assistance, and can submit minimal diagnostics for investigation and safety review when a menu or AI response appears incorrect.

- Connected the **caregiver experience to an internal support workflow**: in-app reports carry client version, occurrence time, and optional diagnostic identifiers; the React console supports assignment, structured investigation, Critical-case escalation, and an auditable resolution timeline, demonstrating a Built-In Support / case-management pattern without allowing operators to modify permanent allergy records.
- Designed a **rule-first, LLM-second** architecture that keeps recipe applicability, allergy state, trial windows, and menu recomputation in shared deterministic TypeScript rules; constrained the LLM to interpreting requests, selecting tools, and explaining rule results across the Mini Program, API, and MCP Agent.
- Used **Zod and oRPC** to define shared contracts before implementing the Express/OpenAPI service and React 19 client in a **pnpm workspace**; applied React Query to cases, traces, and evaluations, while limiting Zustand to local interaction state to prevent type and state-ownership drift.
- Turned repeated product operations and AI engineering checks into **23 MCP tools, 10 resources, and 3 prompts**, backed by a repository-level `AGENTS.md` and reusable safety-change Skill covering tool boundaries, negative tests, human approval, and quality gates.
- Built a reproducible quality gate with 70 API, 36 React/MSW, 3 Playwright Chromium E2E, 9 MCP unit, 46 smoke, and an 11-step integration test suite; achieved 96.92% API and 89.16% React line coverage, with 9 fixed agentic cases for tool selection, safety blocking, and a grounding proxy explicitly reported as offline `mock-policy` results.
- Recorded deterministic safety, contract-first delivery, explicit consent, and offline evaluation trade-offs in ADRs; kept the single-node file store, local demo identity, synthetic data, and unverified live-model path explicit, without claiming Docker, Kubernetes, Istio, or ArgoCD implementation in this project.

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

- 第一页只保留 4–5 条最强项目 bullet；优先保留小程序到支持后台的端到端闭环、rule-first、contract-first、AI workflow 和测试证据。生产边界可留到面试展开。
- 不把 23 个工具或 100% 离线评测单独当作业务影响；面试时始终解释它们证明的是工程范围和回归稳定性。
- `faker`、Jira-linked commits、Storybook、Stryker 和 SonarQube 没有证据，不应为了 ATS 写入技能表。

## 仍需本人确认的信息

- 毕业时间，以及毕业后生产 TypeScript 的实际年限。
- 现任和过往公司、岗位、项目日期、团队规模、个人 ownership 与可披露指标。
- 可用于证明 CI/CD、Docker、Kubernetes、Istio 或 GitOps 的其他项目，以及本人实际负责的环节。
- 求职地点、语言版本和简历目标长度；这些信息确认后才能完成整份一至两页简历和最终 PDF 审核。
