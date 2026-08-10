// scripts/health_report.js
const SecurityGuard = require('./guard-core');

(async () => {
  try {
    const guard = new SecurityGuard();
    await guard.runScheduledReport();
  } catch (error) {
    console.error('هەڵەی گشتی لە ڕاپۆرتی خولەکیدا:', error.message);
    process.exit(1);
  }
})();
