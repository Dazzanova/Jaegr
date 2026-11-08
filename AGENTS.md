# AGENTS.md — Jaegr Engineering Guidelines

This document provides instructions and standards for Antigravity and any automated coding agents or engineers contributing to Jaegr.

## 1. Project Purpose & Core Architecture

Jaegr is a security testing workbench that red-teams Solana AI agents before they touch funds.

Key distinction:
1. **Agent Resistance**: Did the reference agent resist prompt injection or malicious contexts?
2. **Authorization Enforcement**: Did the independent policy evaluator block the unauthorized Solana instruction proposal?

Never collapse these two distinct security metrics into a single ambiguous score.

### Architectural Boundaries

- `src/domain/`: Pure business logic, authorization invariants, schemas, and types. Zero external framework/HTTP dependencies.
- `src/server/`: Server-side services, LLM adapters (Gemini SDK), Solana instruction builders/inspectors, persistence, and test orchestration.
- `src/app/api/`: Thin Next.js Route Handlers. Strictly validate input, delegate to orchestrator/domain services, return structured JSON.
- `src/features/` & `src/components/`: React client/server components. Never run security policy evaluation or transaction decoding directly inside UI components.

## 2. TypeScript & Code Strictness

- Strict mode enabled (`"strict": true` in `tsconfig.json`).
- No `any` type escapes or blind type assertions (`as unknown as ...`).
- Validate all untrusted inputs at runtime using Zod (mandates, API bodies, LLM outputs).
- Financial values: **Always use integer Lamports (`bigint` or integer string)**. Never use floating-point math for SOL comparisons or balances.

## 3. Solana & Web3 Safety Constraints

- Official SDK: Prefer `@solana/kit` and `@solana-program/system`.
- Never ask for, accept, store, or log private keys or seed phrases.
- Unsigned proposals only: Jaegr generates and inspects instruction proposals, never signs or broadcasts mainnet transactions.
- Never blindly trust natural language output from an LLM. Decode and inspect the actual Solana instruction structure.
- Always use the official `SYSTEM_PROGRAM_ADDRESS` constant (`11111111111111111111111111111111`), never arbitrary hardcoded strings without verification.
- For unknown or unsupported instruction formats, return an explicit `UNSUPPORTED_INSTRUCTION` finding. Never treat uninspected instructions as safe.

## 4. LLM & Deterministic Fallback Invariants

- Keep Gemini API keys strictly server-side. Never expose keys or prefixes in client bundles or public APIs.
- The system must remain fully functional in **Deterministic Demo Mode** when no API key is supplied.
- Clearly label deterministic fixtures and mock outputs in the UI. Never fabricate or masquerade mock responses as live AI outputs.
- An LLM must never evaluate whether its own transaction proposal is safe. The policy evaluator must remain 100% deterministic and independent.

## 5. Testing Expectations

- Testing is mandatory. Every authorization rule and edge case must have corresponding unit tests.
- Minimum unit coverage:
  - Valid and invalid mandates
  - Exact spending limit ($amount == limit$ vs $amount > limit$)
  - Allowed vs disallowed recipient addresses
  - Allowed vs disallowed program IDs
  - Duplicate/replayed action IDs
  - Malformed or unsupported instruction payloads
  - Safe vs malicious agent proposals
  - Wire-level decoding and tamper detection (changed recipient/amount/program/instructions)
  - Cumulative multi-instruction spending limits
- Integration coverage:
  - End-to-end flow: Scenario -> Agent -> Proposal -> Solana Instruction -> Policy Evaluator -> Findings Report.
  - Prepare/execute routes: authorization, Devnet enforcement, idempotency, duplicate/replay rejection, simulation failure, submission failure, confirmation timeout, blockhash expiry, Explorer URL.
- E2E smoke test:
  - Dashboard loads, starts test run, displays findings and policy verdicts.
- Tests must be deterministic and never fail due to lack of network access or external API keys.
- Live Devnet tests are opt-in only: `pnpm test:devnet` (`RUN_DEVNET_TESTS=1`). They must never run in default CI, and they never sign or submit a transaction.
- Never claim live network verification from mocked tests. Report automated, mocked, live-Devnet, and manual-wallet status separately.

## 5a. Transaction Execution Invariants (Phase G)

- Preparation, simulation, execution, and confirmation are Devnet-only and enforced server-side with `isDevnetConfigured()` / `assertDevnetCluster()`, never only in the UI.
- The server never trusts a browser-supplied authorization verdict, simulation result, signature, or fee payer. It re-derives all of them.
- `/api/solana/prepare` decodes its own wire bytes and asserts they match the independently inspected instruction.
- `/api/solana/execute` decodes the unsigned wire, re-runs the deterministic evaluator on the wire instruction, requires the signed message bytes to equal the prepared message bytes, requires the expected fee payer, simulates the signed transaction with signature verification enabled, and only then submits.
- A `sendTransaction` response is not confirmation. The server polls `getTransaction`; ambiguous outcomes are `UNKNOWN` and are never retried automatically.
- Persist by `actionId`: `PENDING` only after signed simulation passes, `CONFIRMED` is idempotent, any unresolved prior record returns `409`.
- Supported execution instructions: System `transferSol`, SPL Token `transferChecked`/`transfer`. Address-lookup-table transactions, batch execution, and all other programs fail closed.
- Never auto-sign, never ask for private keys or seed phrases, never log sensitive wallet data, and never fabricate signatures, balances, or success states.

## 6. Git & Commit Standards

- Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`.
- Meaningful, reviewable commits representing coherent units of work.
- Never commit `.env`, secrets, `.sqlite` databases, or build artifacts.
- Run tests and typecheck before committing.

## 7. Quality & Integrity

- No fabricated metrics, decorative charts with bogus data, or fake pass rates.
- Do not claim Devnet or on-chain simulation unless actually implemented and verified.
- Keep documentation in sync with working code.
