# 辅食搭子 Agent Guide

This repository is a safety-sensitive TypeScript product and an AI engineering portfolio. Keep changes explainable, testable, and small enough to review.

## Architecture invariants

- Food safety, recipe applicability, allergy state, and trial-window decisions are deterministic rules. LLMs may explain results but never replace these rules.
- Put shared product rules in `utils/`. Put reusable HTTP contracts in `packages/contracts/`, API orchestration in `apps/api-server/`, MCP orchestration in `mcp-server/src/domain/`, and MCP registration schemas in `mcp-server/src/tools/`.
- Require explicit confirmation for irreversible actions. Preserve an audit record that explains who or what authorized the mutation.
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

The command covers mini-program regression tests, pnpm workspace contracts and HTTP tests, MCP TypeScript, Vitest coverage thresholds, MCP smoke tests, and the end-to-end agent flow.

## Review and Git hygiene

- Use TypeScript strict mode and avoid `any` at new boundaries.
- Never reduce a coverage threshold or remove a guardrail without documenting the product decision.
- Keep secrets, runtime data, and generated coverage out of Git.
- Use Conventional Commits and separate unrelated changes.
- In the handoff, include changed behavior, verification evidence, and remaining risks.
