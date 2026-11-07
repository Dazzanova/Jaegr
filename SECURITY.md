# Security Policy

## Responsible Disclosure

The AgentCrashTest team takes security seriously. If you discover a vulnerability or security flaw in the policy evaluator, Solana instruction parser, or API boundaries, please report it privately rather than opening a public issue.

Email: `security@agentcrashtest.dev` (or reach out to repository maintainers directly).

Please include:
- A description of the vulnerability.
- Steps to reproduce or a minimal proof of concept.
- The potential impact on user funds or agent policies.

We commit to acknowledging reports within 48 hours and providing a coordinated remediation timeline.

---

## Security Boundaries & Limitations

### 1. Adversarial AI & Prompt Injection
Prompt injection is an inherent property of current generation Large Language Models. AgentCrashTest does **not** certify that any AI model is 100% immune to prompt injection. The primary security guarantee in an agentic Solana system must come from the **independent runtime authorization policy evaluator** that clamps amounts and verifies recipients regardless of what the LLM proposes.

### 2. Transaction Signing & Private Keys
AgentCrashTest **never requests, accepts, stores, or logs private keys or mnemonic seed phrases**. All actions evaluated by this product are unsigned instruction proposals.

### 3. Execution Scope
The MVP evaluates Solana System Program transfers and explicitly rejects unallowlisted third-party programs. It does not broadcast transactions to Solana Mainnet.
