# fushi-mcp — 辅食搭子 MCP Server

> An MCP server that wraps [辅食搭子](../) (a WeChat mini-program for 4-24 月龄 baby food tracking) into a tool surface for AI agents while keeping food-safety decisions deterministic.

## What this is

辅食搭子 is a real WeChat mini-program with **127 recipes / 9 taboos / 20 categories / 80+ utility functions**, but it's a pure rule system — no LLM, no agent, no `openai` / `langchain` / `claude` strings anywhere. This server takes that deterministic business logic and exposes it through [Model Context Protocol](https://modelcontextprotocol.io) so Claude Desktop, Cursor, or any MCP client can call it.

The point isn't "I can call an LLM API" — it's **"I understand the boundary between a rule system and an LLM"**. The hard guardrails stay in the rule system; the LLM is the explainer.

---

## Architecture at a glance

```
Claude Desktop  ──── stdio ────►  fushi-mcp server  ────►  fushi-ditu utils
  (LLM)                              │                          ▲
                                     │   shim:                  │
                                     │   globalThis.wx          │
                                     ▼   → JSON file            │
                                   data/*.json (7 keys) ────────┘
```

- **Shim** — `src/shim/wx-shim.ts` injects `globalThis.wx` so the WeChat mini-program's `wx.getStorageSync` calls work unchanged inside Node.
- **Guardrails** — `src/domain/guardrails.ts` is the **single chokepoint** for "is this food safe". Every mutating tool (`record_meal_log`, `mark_food_allergic`, `generate_today_menu`) goes through it. No LLM is ever in the safety path.
- **Domain** — `src/domain/*.ts` is thin orchestration over `fushi-ditu/utils/`. Adds two things: a hard-guarded `consentToBypassSafety` flag, and a per-tool `consentToConfirmIrreversible` literal-true gate for irreversible actions.
- **Tools** — `src/tools/*.ts` are the MCP handlers, one file per domain. Shared `safeToolCall` helper centralizes error formatting.

The fushi-ditu 主体 code is **not modified** — zero changes to the mini-program source. All 21 tools, 7 static + 3 template resources, and 3 prompts are pure additions.

---

## Install + run

```bash
cd /Users/x7/fushi-ditu/mcp-server
npm install
npm run test:coverage               # Vitest unit tests + coverage gate
npm test                            # 46/46 smoke test
npm run test:integration            # 11/11 end-to-end flow
npx tsx src/index.ts                # stdio server (talks to MCP clients)
```

Requires Node 20, 22, or 24+.

## Connect to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fushi-mcp": {
      "command": "npx",
      "args": ["tsx", "/Users/x7/fushi-ditu/mcp-server/src/index.ts"]
    }
  }
}
```

Restart Claude Desktop. The 21 tools / 10 resources / 3 prompts should appear in the tool picker.

---

## Demo script (the three questions)

These are the prompts designed to showcase the most distinctive pieces of the system. Each one demonstrates a specific architectural decision worth talking through.

### 1. Today's menu → safe answer

> "今天中午宝宝吃什么?"

Flow: `read_baby_profile` → `generate_today_menu` → returns 3 meals, each with `recipeId / recipeName / trialIngredient? / trialMethod?`.

Talk track: *"Every recipe is `isRecipeApplicable`-verified twice — once inside the planner's pool filter, once as defense in depth in the domain layer. Unsafe recipes never appear in output."*

### 2. Replace a meal using fridge

> "换一道用冰箱现有食材的"

Flow: `read_baby_profile` → `replace_meal` with `topN=3` → returns 3 candidates with `reasons[]` and `inFridgeCount` highlighted.

Talk track: *"Each candidate goes through `isRecipeApplicable` again inside `pickReplacementCandidates`. The reasons array (`✅ 补 DHA` / `🧊 全在冰箱`) is multi-line so the parent can scan the hero card."*

### 3. The killer demo — reaction analysis with ruleTrace

> "宝宝下午拉稀,可能中午吃了什么?"

Flow: `record_reaction` (type=gut, severity=moderate) → returns `initialSuspects` + `recommendation` → `analyze_suspect_foods` (with the returned `reactionId`) → returns `ruleTrace` + `suspects`.

Talk track: *"Look at `ruleTrace` — `allergicSkipped` lists the ingredients already marked allergic (we never re-suspect them), `confirmedSkipped` lists the parent's whitelist, `introducingChecked` lists foods in the 3-day introducing window, `tryingDayLabel` shows which day of the 3-day trying protocol we're on. The verdict is auditable — every classification is traceable to a deterministic rule. This is what 'I understand the rule/LLM boundary' looks like in practice."*

### 4. (Optional) Try a new food

> "想试试虾"

Flow: `get_prompt introduce_new_food` → 6-step system prompt: state check → safety gate → explicit user consent → `start_trying_food` → seed plan → 3-day guidance.

Talk track: *"The prompt hard-rules block: post-vaccine status, active gut reaction, or already in a trying window. `check_food_safety` runs before `start_trying_food` — the LLM can't skip it. If the food is unsafe, the prompt walks the user through 'why' instead of 'try anyway'."*

---

## Tools, resources, prompts (full inventory)

### Tools (23)

| Tool | Hard guardrail | What it does |
|------|---|---|
| `read_baby_profile` | — | Profile + ageMonths + trying state + next recs |
| `check_food_safety` | ⭐ | Per-food verdict with reason + categoryState |
| `list_recipes` | ⭐ (filter) | Applicable recipes with optional fridge / category / exclude filters |
| `get_recipe` | — | One recipe + per-ingredient safety check |
| `generate_today_menu` | ⭐ | 3-meal plan, double-verified |
| `replace_meal` | ⭐ | Top-N replacement candidates with reasons |
| `regenerate_week_plan` | — | Re-roll the week, preserving logged meals |
| `record_meal_log` | ⭐ | Always runs `check_food_safety`; `consentToBypassSafety` for unsafe |
| `undo_meal_log` | — | Restores fridge portions |
| `list_fridge` | — | Fridge items + urgent + low-stock |
| `add_fridge_item` | — | Add an item, auto-fill shelf-life |
| `use_fridge_item` | — | Mark N portions consumed |
| `get_fridge_advice` | — | Today's urgent + low-stock advice |
| `record_reaction` | — | Pull 72h traceback + run analyzer + return recommendation |
| `analyze_suspect_foods` | — | Re-run + return `ruleTrace` (the killer demo) |
| `start_trying_food` | — | 3-day trying window, guards on existing trying / post-vaccine / gut reaction |
| `complete_trying_food` | — | Promote trying → open, blocked if dayIndex < daysRequired |
| `abort_trying_food` | — | Cancel trying window |
| `mark_food_allergic` | ⭐⭐ IRREVERSIBLE | `consentToConfirmIrreversible: literal(true)` + `reactionId` required |
| `enter_observation` | — | 7-day observation, optional reactionId |
| `start_introducing` | ⭐ | Runs `check_food_safety` first |
| `get_week_summary` | — | 4-card summary: loves / new / reactions / nutrition gap |
| `narrate_week` | — | Wraps `get_week_summary` with LLM narration (Anthropic or mock) |

### Resources (10)

Static:
- `fushi://profile`
- `fushi://fridge`
- `fushi://plan/today` (read-only, no side effects — returns `{found: false, hint}` when missing)
- `fushi://plan/week`
- `fushi://journal/week`
- `fushi://profile/trying-progress`
- `fushi://recommendations/next`

URI templates:
- `fushi://recipes/{categoryId}`
- `fushi://journal/{days}`
- `fushi://reactions/{days}`

### Prompts (3)

- `daily_checkin` — 4-question daily check-in: did eat / how much / liked it / any reaction
- `reaction_followup` — walk through record → analyze with `ruleTrace` → apply recommendation
- `introduce_new_food` — 6-step trial-introduction with hard rules

---

## The guardrail philosophy

Three layers, each with a different lever:

| Layer | Where | What it stops | How to bypass |
|---|---|---|---|
| **Schema** | zod in `tools/*.ts` | Wrong type / missing required field | Reject at MCP protocol level (`Input validation error`) |
| **Domain** | `domain/*.ts` | Unsafe / irreversible / state-machine violation | Throw `Error` → `isError: true` MCP result |
| **Tool description** | string passed to `server.tool()` | LLM "inventing" flags it shouldn't | LLM reads it before calling; not enforceable |

The first two are airtight — they never reach the LLM. The third is the soft layer. The most important pattern in this codebase is **`z.literal(true)` for irreversible actions** — see `mark_food_allergic` which requires `consentToConfirmIrreversible: true`. This is the strongest zod has: passing `false` or omitting the field both fail at the protocol layer before the domain even runs.

For `record_meal_log` the equivalent is `consentToBypassSafety: z.boolean().optional()` — a weaker form because the LLM could in principle invent `true`. The audit trail (`[BYPASSED SAFETY]` note prefix) is the only thing that catches that case after the fact.

---

## Project layout

```
mcp-server/
├── src/
│   ├── index.ts                      # stdio entrypoint
│   ├── server.ts                     # McpServer factory + registration
│   ├── lib/tool-helpers.ts           # shared safeToolCall / toolTextResult
│   ├── shim/
│   │   ├── wx-shim.ts                # globalThis.wx = JSON file backed
│   │   ├── storage.ts                # typed readJson / writeJson
│   │   └── paths.ts                  # 7 storage keys (fails fast on typo)
│   ├── domain/
│   │   ├── guardrails.ts             # ⭐ single chokepoint
│   │   ├── safety.ts                 # check_food_safety
│   │   ├── profile.ts                # read_baby_profile
│   │   ├── recipes.ts                # list_recipes / get_recipe
│   │   ├── plan.ts                   # generate / replace / regenerate
│   │   ├── journal.ts                # record_meal_log / undo (with bypass)
│   │   ├── fridge.ts                 # list / add / use / advice
│   │   ├── reactions.ts              # record / analyze (with ruleTrace)
│   │   ├── profile-mutations.ts      # start/complete/abort/mark/observe/introduce
│   │   ├── review.ts                 # get_week_summary
│   │   └── fushi-types.d.ts          # type projection of fushi-ditu types
│   ├── tools/                        # 8 files: one register* per domain
│   ├── resources/                    # 5 files: one register* per group
│   └── prompts/                      # 3 prompt templates
├── test/
│   ├── tools.test.ts                 # 46 e2e smoke tests
│   └── fixtures/                     # seed-{fridge,babyProfile}.json
└── data/                             # 7 JSON files (gitignored runtime)
```

---

## Known trade-offs (the honest list)

These are the things to address before shipping to real parents. They remain visible so callers can distinguish prototype behavior from production guarantees.

1. **Cross-project type boundary** — `mcp-server` imports the mini-program domain through `../../../utils/*.js`, so TypeScript also checks those source files. The MCP config now loads the real WeChat runtime types and passes with `strict` + `noImplicitAny`; `noUncheckedIndexedAccess` remains disabled for this combined legacy graph. A future monorepo extraction should publish the domain as a declaration-emitting package so the MCP package can enable that check independently.
2. **Storage is per-server, not synced with the WeChat mini-program** — same `fushi-ditu` is the source of truth in production, but this demo runs in isolation. An export/import protocol would be needed.
3. **Single active baby** — `STORAGE_KEYS['babyProfile']` is a single object, no `babyId` discriminator. Documented in `fushi-types.d.ts`. Multi-baby needs a storage namespace + activeProfileId.
4. **`record_meal_log`'s `consentToBypassSafety` is `z.boolean().optional()`** — softer than `mark_food_allergic`'s `z.literal(true)`. LLM could in principle invent `true`. The `[BYPASSED SAFETY]` audit prefix catches it after the fact, but the LLM-level invariant is not enforced.
5. **Virtual recipe for custom logs** — when `recipeId` is absent, `domain/journal.ts` synthesizes a Recipe with `mealCategories: ['staple']` to bypass `isRecipeApplicable`'s required-rule check. This is a hack; fushi-ditu's `checkinMeal` should grow a "no recipe" path.
6. **`fushi://plan/today` is intentionally side-effect-free** — if today's plan is missing, the resource returns `{found: false, hint: 'Call generate_today_menu'}` instead of auto-generating. This is correct (MCP resources are read-only), but means the LLM has to follow the hint.

---

## Running the test suite

```bash
npm run test:unit                   # 9 Vitest unit tests
npm run test:coverage               # 90% threshold on the initial AI/MCP boundary scope
npm test                            # 46 isolated smoke tests
npm run test:integration            # 11-step end-to-end demo flow
```

The smoke test runner spawns the stdio server and fires isolated `callTool` / `readResource` / `getPrompt` calls. The integration test chains the same flow an LLM would drive in a real demo session: read profile → list recipes → generate menu → log meal → check fridge → record reaction → analyze → mark allergic → verify unsafe filter → get summary → LLM narration.

Storage is reset to fixtures in `test/fixtures/seed-*.json` at the start of each run, so both suites are idempotent.

The initial Vitest coverage scope is explicit in `vitest.config.ts`: the LLM provider factory, offline provider, and MCP result boundary. All four current metrics are 100%; the enforced floor is 90% so future changes cannot silently remove critical boundary tests.

Last verified result: **9/9 unit + 46/46 smoke + 11/11 integration passed**.

## LLM provider (Day 8)

`src/llm/` provides a thin abstraction over the model API:

- `client.ts` — `LLMClient` interface (`chat({system, messages, model?, temperature?, maxTokens?})` → `ChatResponse`)
- `anthropic.ts` — `@anthropic-ai/sdk` implementation (default model `claude-sonnet-4-5`)
- `mock.ts` — deterministic echo for offline / CI
- `factory.ts` — reads `ANTHROPIC_API_KEY`; logs provider choice to stderr at startup

The decision is **frozen at server startup** — tools cannot hot-swap live → mock mid-demo. The choice is logged so it's visible: `fushi-mcp: LLM provider = anthropic (live)` or `fushi-mcp: LLM provider = mock (set ANTHROPIC_API_KEY for live)`.

Only **one tool** (`narrate_week`) touches the LLM. The system prompt hard-rules:
- 数字必须从数据来,不编造
- 不推荐具体食材(交给其他工具)
- ≤ 200 字,中文,匹配 tone

The rest of the server is **rule-first, LLM-second**: the LLM is the explainer, never the decider. This is the central safety boundary.

---

## License & context

This is an engineering prototype, not a production system. It explores how to expose a complex rule system to an LLM while keeping safety decisions deterministic, auditable, and testable.
