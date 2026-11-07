# Contributing to AgentCrashTest

Thank you for your interest in contributing to **AgentCrashTest**! We welcome contributions to expand attack scenarios, enhance policy evaluation invariants, and integrate Solana programs.

---

## 1. Development Prerequisites

- **Node.js:** `>= 20.0.0` (Recommended: `v24.x`)
- **Package Manager:** `pnpm` (`v12.x` or compatible)
- **Git**

---

## 2. Getting Started

1. Clone the repository and checkout the active feature branch:
   ```bash
   git clone <repo-url>
   cd agentcrashtest
   git checkout feat/agentcrashtest-mvp
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Configure environment:
   ```bash
   cp .env.example .env.local
   # Optional: set GEMINI_API_KEY=your_key if testing live Google GenAI integration
   ```

4. Start the local development server:
   ```bash
   pnpm dev
   ```
   Open `http://localhost:3000` in your browser.

---

## 3. Quality & Testing Gates

Before submitting any Pull Request, ensure that all quality gates pass:

```bash
# 1. Run unit and integration tests
pnpm test

# 2. Run TypeScript strict typecheck
pnpm typecheck

# 3. Run ESLint
pnpm lint

# 4. Verify Next.js production build
pnpm build

# 5. Run Playwright E2E smoke tests
pnpm test:e2e
```

---

## 4. Architecture Invariants to Maintain

When adding new features or scenarios, adhere strictly to the invariants defined in `AGENTS.md` and `docs/architecture.md`:
1. **Never use floating-point math** for SOL amounts or balance comparisons. Always compute with integer Lamports (`BigInt`).
2. **Never expose API secrets or private keys.**
3. **Unsigned proposals only:** Never implement transaction signing or broadcasting in the testing harness.
4. **Distinguish Agent Resistance from Policy Enforcement.** Never merge these two distinct metrics into a single score.
5. **Always preserve deterministic offline execution.** Every new scenario must have working deterministic fixtures so the test suite can run with zero network connectivity.

---

## 5. Git & Commit Guidelines

We enforce **Conventional Commits**:
- `feat:` New features or capabilities
- `fix:` Bug fixes
- `test:` New or updated unit, integration, or E2E tests
- `docs:` Documentation improvements
- `chore:` Tooling, dependency, or configuration updates
- `refactor:` Code improvements that do not change external behavior
