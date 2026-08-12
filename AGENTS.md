# 辅食搭子 Agent Guide

This repository is a safety-sensitive TypeScript product and an AI engineering portfolio. Keep changes explainable, testable, and small enough to review.

## Architecture invariants

- Food safety, recipe applicability, allergy state, and trial-window decisions are deterministic rules. LLMs may explain results but never replace these rules.
- Put shared product rules in `utils/`. Put reusable HTTP contracts in `packages/contracts/`, API orchestration in `apps/api-server/`, the portfolio UI in `apps/web-console/`, MCP orchestration in `mcp-server/src/domain/`, and MCP registration schemas in `mcp-server/src/tools/`.
- The React console consumes the shared oRPC contract through `OpenAPILink`; do not hand-write duplicate request or response types. Use React Query for server state and Zustand only for local interaction state.
- Require explicit confirmation for irreversible actions. Preserve an audit record that explains who or what authorized the mutation.
- Treat every `mealJournal` entry as an immutable historical fact. Automatic rules, profile/status changes, AI/MCP tools, retries, and plan regeneration may change only unlogged meals. A logged menu may change only through an explicit user edit of that meal record; destructive reset/restore flows require their own confirmation and recovery story.
- Keep MCP resources read-only and make mock/provider state visible to callers.
- Do not add or upload personal data without updating the product disclosure and deletion story.

For food safety, reactions, meal mutations, AI tools, or irreversible operations, follow [`skills/fushi-safety-change/SKILL.md`](skills/fushi-safety-change/SKILL.md).

## Required workflow

1. Inspect the caller, contract, domain rule, persistence path, and existing tests before editing.
2. State the invariant the change must preserve.
3. Prefer contract-first changes: Zod schema, domain implementation, handler wiring, then tests.
4. Test failures and blocked paths as well as successful behavior.
5. Run the repository quality gate before committing:

```bash
npm run verify
```

The command covers mini-program regression tests, pnpm workspace contracts, HTTP and React/MSW tests, MCP TypeScript, Vitest coverage thresholds, MCP smoke tests, and the end-to-end agent flow.

## Review and Git hygiene

- Use TypeScript strict mode and avoid `any` at new boundaries.
- Never reduce a coverage threshold or remove a guardrail without documenting the product decision.
- Keep secrets, runtime data, and generated coverage out of Git.
- Use Conventional Commits and separate unrelated changes.
- In the handoff, include changed behavior, verification evidence, and remaining risks.
