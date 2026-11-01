import { describe, it, expect } from 'vitest';
import {
  EVAL_CATEGORIES,
  EVAL_CATEGORY_LABELS_AR,
  EVAL_SCENARIOS,
  executeScenario,
  runAllScenarios,
  runCanaryVerification,
  MOCK_EXECUTION_DISCLAIMER_AR,
} from '../src/index';

describe('AI Assistant Evaluation Harness (0-D2)', () => {
  describe('Scenarios Definition & Distribution', () => {
    it('contains at least 50 distinct Iraqi scenarios (actual: 55)', () => {
      expect(EVAL_SCENARIOS.length).toBeGreaterThanOrEqual(50);
      expect(EVAL_SCENARIOS.length).toBe(55);
    });

    it('covers all 10 required evaluation categories with at least 5 scenarios each', () => {
      expect(EVAL_CATEGORIES.length).toBe(10);

      const categoryCounts: Record<string, number> = {};
      for (const cat of EVAL_CATEGORIES) {
        categoryCounts[cat] = 0;
      }

      for (const scen of EVAL_SCENARIOS) {
        expect(EVAL_CATEGORIES).toContain(scen.category);
        categoryCounts[scen.category] = (categoryCounts[scen.category] || 0) + 1;
      }

      for (const cat of EVAL_CATEGORIES) {
        expect(
          categoryCounts[cat],
          `Category ${cat} (${EVAL_CATEGORY_LABELS_AR[cat]}) should have at least 5 scenarios`
        ).toBeGreaterThanOrEqual(5);
      }
    });

    it('ensures all scenarios have unique IDs, valid Arabic descriptions, and criteria', () => {
      const ids = new Set<string>();
      for (const scen of EVAL_SCENARIOS) {
        expect(ids.has(scen.id), `Duplicate scenario ID: ${scen.id}`).toBe(false);
        ids.add(scen.id);

        expect(scen.titleAr.trim().length).toBeGreaterThan(0);
        expect(scen.descriptionAr.trim().length).toBeGreaterThan(0);
        expect(scen.expectedBehaviorAr.trim().length).toBeGreaterThan(0);
        expect(scen.turns.length).toBeGreaterThanOrEqual(1);
        expect(scen.criteria.length).toBeGreaterThanOrEqual(1);

        for (const crit of scen.criteria) {
          expect(crit.id.trim().length).toBeGreaterThan(0);
          expect(crit.descriptionAr.trim().length).toBeGreaterThan(0);
          expect(typeof crit.verify).toBe('function');
        }
      }
    });

    it('includes multi-turn conversational scenarios', () => {
      const multiTurn = EVAL_SCENARIOS.filter((s) => s.turns.length > 1);
      expect(multiTurn.length).toBeGreaterThan(0);
    });
  });

  describe('Canary Verification (Negative Security & Guardrail Fixtures)', () => {
    it('catches all 5 intentional negative fixtures (hallucinated price, false confirm, premature order, false handoff, unapproved knowledge leak)', async () => {
      const canaryResult = await runCanaryVerification();
      expect(canaryResult.allCanariesCaught).toBe(true);
      expect(canaryResult.results.length).toBe(5);

      for (const res of canaryResult.results) {
        expect(
          res.detectedFailure,
          `Canary check failed to detect invalid behavior: ${res.canaryId} (${res.titleAr})`
        ).toBe(true);
      }
    });
  });

  describe('Scenario Execution & Live LLM Boundaries', () => {
    it('returns SKIPPED_UNCONFIGURED when live LLM is requested without API configuration', async () => {
      const sampleScenario = EVAL_SCENARIOS[0]!;
      const result = await executeScenario(sampleScenario, {
        liveLLM: {
          enabled: true,
          apiKeyConfigured: false,
          model: 'gemini-1.5-pro',
          maxRequests: 10,
          maxTotalTokens: 20000,
          timeoutMs: 5000,
        },
      });

      expect(result.status).toBe('SKIPPED_UNCONFIGURED');
      expect(result.failureReasonsAr[0]).toContain('غير مهيأ');
    });

    it('successfully executes an individual scenario in deterministic mock mode', async () => {
      const budgetScenario = EVAL_SCENARIOS.find((s) => s.id === 'scen_bud_01_colloquial_thousands');
      expect(budgetScenario).toBeDefined();

      const result = await executeScenario(budgetScenario!);
      expect(result.status).toBe('PASSED');
      expect(result.failureReasonsAr.length).toBe(0);
      expect(result.criteriaResults.every((c) => c.passed)).toBe(true);
    });
  });

  describe('Full Suite Execution & Report Totals', () => {
    it('executes all 55 scenarios with 100% pass rate in deterministic mock mode', async () => {
      const report = await runAllScenarios(EVAL_SCENARIOS);

      expect(report.totals.totalScenarios).toBe(55);
      expect(report.totals.passed).toBe(55);
      expect(report.totals.failedBehavior).toBe(0);
      expect(report.totals.errorEnvironment).toBe(0);
      expect(report.totals.passRatePercent).toBe(100);

      expect(report.canaryVerification.allCanariesCaught).toBe(true);
      expect(report.executionMode).toBe('deterministic_mock_integration');
      expect(report.executionModeDisclaimerAr).toBe(MOCK_EXECUTION_DISCLAIMER_AR);
      expect(report.liveLLMStatus.status).toBe('SKIPPED_UNCONFIGURED');

      // Verify category summaries
      expect(report.categorySummaries.length).toBe(10);
      for (const summary of report.categorySummaries) {
        expect(summary.total).toBeGreaterThanOrEqual(5);
        expect(summary.passed).toBe(summary.total);
        expect(summary.failedBehavior).toBe(0);
      }
    }, 30000); // 30s timeout for all 55 scenarios
  });
});
