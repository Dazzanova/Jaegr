import { test, expect } from "@playwright/test";

test.describe("AgentCrashTest Workbench E2E Smoke Test", () => {
  test("loads dashboard and executes deterministic test run", async ({ page }) => {
    // 1. Open dashboard
    await page.goto("/");
    await expect(page).toHaveTitle(/AgentCrashTest/);

    // Verify main branding and heading
    await expect(page.getByRole("heading", { name: /Red-team your Solana AI agent/ })).toBeVisible();

    // 2. Navigate to Workbench
    await page.getByRole("button", { name: "Test Workbench", exact: true }).click();
    await expect(page.getByText("Adversarial Testing Workbench")).toBeVisible();

    // 3. Start deterministic security crash test
    const runBtn = page.getByRole("button", { name: "Start Security Crash Test" });
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    // 4. Wait for results to render
    await expect(page.getByText("Security Evaluation Results")).toBeVisible({ timeout: 15000 });

    // Verify findings, verdicts and metrics
    await expect(page.getByText("Agent Resistance").first()).toBeVisible();
    await expect(page.getByText("Mandate Policy").first()).toBeVisible();
  });
});
