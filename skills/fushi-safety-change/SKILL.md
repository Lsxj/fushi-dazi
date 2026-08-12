---
name: fushi-safety-change
description: Review and implement safety-sensitive changes in the 辅食搭子 mini-program or MCP server. Use for food recommendations, allergy or observation state changes, reaction analysis, meal logging, AI tool schemas, LLM provider boundaries, irreversible actions, or any change that can alter what a baby is advised to eat.
---

# Fushi Safety Change

Preserve the rule-first, LLM-second architecture while changing safety-sensitive behavior.

## Workflow

1. Trace the complete path from input schema to tool handler, domain function, shared rule, storage mutation, and user-visible result.
2. State the affected invariant before editing:
   - Every recommendation and meal mutation must pass deterministic food-safety rules.
   - Every logged meal is an immutable historical fact. Non-user operations may update only unlogged meals; changing a logged menu requires an explicit user edit of the meal record.
   - LLMs may explain or orchestrate but must not decide safety.
   - Irreversible mutations require explicit literal-true consent and an auditable record ID.
   - MCP resources remain read-only.
   - Any permitted safety bypass must be explicit and written into the audit trail.
3. Define or update the Zod input contract before implementation. Keep validation at the protocol boundary and repeat critical checks in the domain layer.
4. Implement business behavior in `utils/` or `mcp-server/src/domain/`; keep `mcp-server/src/tools/` limited to registration, schemas, and result formatting.
5. Add negative-path tests before happy-path tests. Include blocked unsafe food, missing consent, invalid state transition, missing audit record, mutation rollback, and unchanged logged meals after automatic replanning when relevant.
6. Run `npm run verify` from the repository root. Do not weaken a test or coverage threshold to make the command pass.
7. Report the invariant protected, tests added, verification result, and any residual risk.

## Escalation rules

Stop and request a product decision when a change introduces a new medical or age rule without an existing source of truth, allows the LLM to bypass deterministic checks, silently uploads new user data, or makes an irreversible action possible without explicit confirmation.

Treat mock mode as visibly non-production. Never present mock output as a live model response.
