// scripts/health_report.js
import SecurityGuard from './guard-core.js';

(async () => {
  try {
    const guard = new SecurityGuard();
    await guard.runScheduledReport();
  } catch (error) {
    console.error('هەڵەی گشتی لە ڕاپۆرتی خولەکیدا:', error.message);
    process.exit(1);
  }
})();
