# Security Policy

## Responsible Disclosure

The Jaegr team takes security seriously. If you discover a vulnerability or security flaw in the policy evaluator, Solana instruction parser, or API boundaries, please report it privately rather than opening a public issue.

Please use GitHub's private vulnerability reporting (repository **Security → Advisories**) or contact the maintainers directly.

Please include:
- A description of the vulnerability.
- Steps to reproduce or a minimal proof of concept.
- The potential impact on user funds or agent policies.

We commit to acknowledging reports within 48 hours and providing a coordinated remediation timeline.

---

## Security Boundaries & Limitations

### 1. Adversarial AI & Prompt Injection
Prompt injection is an inherent property of current generation Large Language Models. Jaegr does **not** certify that any AI model is 100% immune to prompt injection. The primary security guarantee in an agentic Solana system must come from the **independent runtime authorization policy evaluator** that clamps amounts and verifies recipients regardless of what the LLM proposes.

### 2. Transaction Signing & Private Keys
Jaegr **never requests, accepts, stores, or logs private keys or mnemonic seed phrases**. All actions evaluated by this product are unsigned instruction proposals.

### 3. Execution Scope
The MVP evaluates Solana System Program transfers and explicitly rejects unallowlisted third-party programs. It does not broadcast transactions to Solana Mainnet.
