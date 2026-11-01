import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVAL_SCENARIOS } from './scenarios';
import { runAllScenarios } from './evaluator';
import type { EvalReport } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runEvalCLI(): Promise<EvalReport> {
  console.log('\n======================================================================');
  console.log('  تِل بغداد — منصة تقييم مساعد المبيعات الذكي (0-D2 Evaluation Harness)');
  console.log('  نطاق التقييم: فرع كربلاء فقط (branch-karbala)');
  console.log('======================================================================\n');

  console.log(`جارٍ فحص ${EVAL_SCENARIOS.length} سيناريو عراقياً وفحوصات الكناري السلبية...`);
  const report = await runAllScenarios(EVAL_SCENARIOS);

  // Write JSON report
  const reportsDir = path.resolve(__dirname, '../reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  const reportPath = path.join(reportsDir, 'latest-eval-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  // Print Summary Table
  console.log('\n----------------------------------------------------------------------');
  console.log('  نتائج تقييم الفئات العشر:');
  console.log('----------------------------------------------------------------------');
  console.log(
    'الفئة'.padEnd(45) +
      ' | ' +
      'الإجمالي'.padStart(7) +
      ' | ' +
      'الناجح'.padStart(6) +
      ' | ' +
      'الفاشل'.padStart(6) +
      ' | ' +
      'المتخطي'.padStart(7)
  );
  console.log(''.padEnd(78, '-'));

  for (const cat of report.categorySummaries) {
    const name = cat.labelAr.length > 42 ? cat.labelAr.slice(0, 39) + '...' : cat.labelAr;
    console.log(
      name.padEnd(45) +
        ' | ' +
        String(cat.total).padStart(7) +
        ' | ' +
        String(cat.passed).padStart(6) +
        ' | ' +
        String(cat.failedBehavior).padStart(6) +
        ' | ' +
        String(cat.skippedUnconfigured).padStart(7)
    );
  }

  console.log(''.padEnd(78, '-'));
  console.log(
    'المجموع الكلي'.padEnd(45) +
      ' | ' +
      String(report.totals.totalScenarios).padStart(7) +
      ' | ' +
      String(report.totals.passed).padStart(6) +
      ' | ' +
      String(report.totals.failedBehavior).padStart(6) +
      ' | ' +
      String(report.totals.skippedUnconfigured).padStart(7)
  );

  console.log('\n----------------------------------------------------------------------');
  console.log('  فحص الكناري السلبي (Canary Self-Check):');
  console.log('----------------------------------------------------------------------');
  console.log(
    report.canaryVerification.allCanariesCaught
      ? '  [✓] نجح فحص الكناري: جميع الحالات الخاطئة تم كشفها واعتراضها بنجاح.'
      : '  [✗] فشل فحص الكناري: هناك حالات خاطئة لم يتم كشفها بواسطة المقيم!'
  );
  for (const canary of report.canaryVerification.results) {
    const symbol = canary.detectedFailure ? '✓' : '✗';
    console.log(`    [${symbol}] ${canary.titleAr}: ${canary.detectedFailure ? 'تم الكشف' : 'فشل الكشف'}`);
  }

  console.log('\n----------------------------------------------------------------------');
  console.log('  إحصائيات التشغيل والحدود:');
  console.log('----------------------------------------------------------------------');
  console.log(`  - إجمالي السيناريوهات: ${report.totals.totalScenarios}`);
  console.log(`  - السيناريوهات متعددة الأدوار (Multi-turn): ${report.totals.multiTurnScenarios}`);
  console.log(`  - إجمالي الأدوار الحوارية: ${report.totals.totalTurns}`);
  console.log(`  - إجمالي المعايير المحققة: ${report.totals.totalCriteriaChecked}`);
  console.log(`  - نمط التشغيل: ${report.executionMode}`);
  console.log(`  - حالة التقييم الحي (Live LLM): ${report.liveLLMStatus.labelAr}`);
  console.log(`  - مسار التقرير المحفوظ: packages/eval/reports/latest-eval-report.json`);
  console.log(`\n  * تنبيه: ${report.executionModeDisclaimerAr}`);

  // Print failures if any
  if (report.totals.failedBehavior > 0 || report.totals.errorEnvironment > 0) {
    console.log('\n[!] تفاصيل السيناريوهات الفاشلة:');
    for (const r of report.scenarioResults) {
      if (r.status !== 'PASSED') {
        console.log(`  - [${r.status}] ${r.scenarioId} (${r.titleAr}):`);
        for (const reason of r.failureReasonsAr) {
          console.log(`      * ${reason}`);
        }
      }
    }
    process.exitCode = 1;
  } else if (!report.canaryVerification.allCanariesCaught) {
    process.exitCode = 1;
  } else {
    console.log('\n[✓] اكتمل تقييم 0-D2 بنجاح تام بنسبة 100% وبدون أي إخفاق سلوكي أو بيئي.');
    process.exitCode = 0;
  }

  return report;
}

// Run directly when invoked from CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runEvalCLI().catch((err) => {
    console.error('فشل غير متوقع أثناء تشغيل منصة التقييم:', err);
    process.exit(1);
  });
}
