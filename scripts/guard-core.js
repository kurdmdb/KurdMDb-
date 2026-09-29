import axios from "axios";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const TELEGRAM_BOT_TOKEN =
  process.env.SECURITY_TELEGRAM_BOT_TOKEN ||
  process.env.TELEGRAM_BOT_TOKEN;

const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const WEBSITE_URL =
  process.env.WEBSITE_URL || "https://kurdmdb.vercel.app";

const WINDOW_MINUTES = 75;
const SUSPICIOUS_IP_THRESHOLD = 30;
const HIGH_ACTIVITY_THRESHOLD = 500;
const SLOW_RESPONSE_THRESHOLD_MS = 3000;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error("SUPABASE_URL or SUPABASE_SERVICE_KEY is missing.");
}

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  throw new Error(
    "Telegram configuration is missing: SECURITY_TELEGRAM_BOT_TOKEN/TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID."
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY
);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(date = new Date()) {
  return date.toISOString().replace("T", " ").replace("Z", " UTC");
}

async function analyzeLogs() {
  const since = new Date(
    Date.now() - WINDOW_MINUTES * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("log")
    .select(
      "id,user_id,action,table_name,record_id,created_at,ip_address,description"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(HIGH_ACTIVITY_THRESHOLD + 1);

  if (error) {
    throw new Error(
      `Supabase log query failed: ${error.message}`
    );
  }

  const logs = data || [];

  const ipCounts = new Map();
  const actionCounts = new Map();
  const tableCounts = new Map();

  for (const log of logs) {
    const ip = log.ip_address || "unknown";
    const action = log.action || "unknown";
    const table = log.table_name || "unknown";

    ipCounts.set(ip, (ipCounts.get(ip) || 0) + 1);
    actionCounts.set(
      action,
      (actionCounts.get(action) || 0) + 1
    );
    tableCounts.set(
      table,
      (tableCounts.get(table) || 0) + 1
    );
  }

  const suspiciousIps = [];

  for (const [ip, count] of ipCounts.entries()) {
    if (ip !== "unknown" && count >= SUSPICIOUS_IP_THRESHOLD) {
      suspiciousIps.push({
        ip,
        count
      });
    }
  }

  const alerts = [];

  if (logs.length >= HIGH_ACTIVITY_THRESHOLD) {
    alerts.push({
      level: "high",
      type: "high_activity",
      message:
        `ژمارەی Log ـەکان بەرزە: ${logs.length} ڕووداو لە ${WINDOW_MINUTES} خولەکدا.`
    });
  }

  for (const item of suspiciousIps) {
    alerts.push({
      level: "medium",
      type: "suspicious_ip",
      ip: item.ip,
      count: item.count,
      message:
        `IP ـێک ${item.count} ڕووداوی تۆمار کردووە لە ${WINDOW_MINUTES} خولەکدا.`
    });
  }

  return {
    logs,
    totalLogs: logs.length,
    ipCounts,
    actionCounts,
    tableCounts,
    suspiciousIps,
    alerts
  };
}

async function checkWebsiteHealth() {
  const startedAt = Date.now();

  try {
    const response = await axios.get(WEBSITE_URL, {
      timeout: 10000,
      validateStatus: () => true
    });

    const responseTime = Date.now() - startedAt;

    const statusCode = response.status;
    const healthy =
      statusCode >= 200 && statusCode < 400;

    const slow =
      responseTime >= SLOW_RESPONSE_THRESHOLD_MS;

    const serverError =
      statusCode >= 500 && statusCode <= 599;

    return {
      healthy,
      slow,
      serverError,
      statusCode,
      responseTime,
      error: null
    };
  } catch (error) {
    const responseTime = Date.now() - startedAt;

    return {
      healthy: false,
      slow: false,
      serverError: false,
      statusCode: null,
      responseTime,
      error: error.message
    };
  }
}

async function checkSupabaseHealth() {
  try {
    const { error } = await supabase
      .from("log")
      .select("id")
      .limit(1);

    if (error) {
      return {
        healthy: false,
        error: error.message
      };
    }

    return {
      healthy: true,
      error: null
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}

function buildSecurityAlerts(
  website,
  supabaseHealth,
  logAnalysis
) {
  const alerts = [...logAnalysis.alerts];

  if (!website.healthy) {
    alerts.push({
      level: "critical",
      type: "website_down",
      message:
        "ماڵپەڕ وەڵامی تەندروست نەدا."
    });
  }

  if (website.serverError) {
    alerts.push({
      level: "high",
      type: "server_error",
      message:
        `ماڵپەڕ HTTP ${website.statusCode} ـی وەرگرت.`
    });
  }

  if (website.slow) {
    alerts.push({
      level: "medium",
      type: "slow_website",
      message:
        `ماڵپەڕ خاو بوو: ${website.responseTime} ms.`
    });
  }

  if (!supabaseHealth.healthy) {
    alerts.push({
      level: "critical",
      type: "supabase_down",
      message:
        "پەیوەندی بە Supabase سەرکەوتوو نەبوو."
    });
  }

  return alerts;
}

function buildNormalReport(
  website,
  supabaseHealth,
  logAnalysis
) {
  const actionLines =
    [...logAnalysis.actionCounts.entries()]
      .slice(0, 10)
      .map(
        ([action, count]) =>
          `• ${escapeHtml(action)}: ${count} جار`
      )
      .join("\n") ||
    "• هیچ کردارێک نییە";

  const tableLines =
    [...logAnalysis.tableCounts.entries()]
      .slice(0, 10)
      .map(
        ([table, count]) =>
          `• ${escapeHtml(table)}: ${count} جار`
      )
      .join("\n") ||
    "• هیچ خشتەیەک نییە";

  let ipStatus =
    "🟢 هیچ IP ـێک سنووری چاودێری تێنەپەڕاندووە.";

  if (logAnalysis.suspiciousIps.length > 0) {
    ipStatus =
      logAnalysis.suspiciousIps
        .map(
          (item) =>
            `🟠 ${escapeHtml(item.ip)} — ${item.count} ڕووداو`
        )
        .join("\n");
  }

  const websiteStatus = website.healthy
    ? "🟢 ماڵپەڕ بەردەستە"
    : "🔴 ماڵپەڕ کێشەی هەیە";

  const supabaseStatus = supabaseHealth.healthy
    ? "🟢 Supabase بەردەستە"
    : "🔴 Supabase کێشەی هەیە";

  return `
<b>🛡 ڕاپۆرتی چاودێری KurdMDb</b>

🕒 کات: ${escapeHtml(formatDate())}
⏱ ماوەی چاودێری: ${WINDOW_MINUTES} خولەک

<b>🌐 دۆخی ماڵپەڕ</b>
${websiteStatus}
• HTTP: ${website.statusCode ?? "N/A"}
• وەڵامدانەوە: ${website.responseTime} ms

<b>🗄 دۆخی Supabase</b>
${supabaseStatus}

<b>📊 دۆخی Log ـەکان</b>
• کۆی ڕووداوەکان: ${logAnalysis.totalLogs}

<b>📌 کردارە تۆمارکراوەکان</b>
${actionLines}

<b>🗂 خشتەکانی بەکارهاتوو</b>
${tableLines}

<b>🔎 چاودێری IP</b>
${ipStatus}

<b>🟢 دۆخی گشتی</b>
هەموو پشکنینە سەرەکییەکان بە سەرکەوتوویی تێپەڕین.

📋 ئەم سیستەمە تەنها بۆ چاودێرییە و هیچ گۆڕانکارییەکی خۆکار لە سیستەمدا ناکات.
`.trim();
}

function buildAlertReport(alerts, website, supabaseHealth) {
  const alertLines = alerts
    .map((alert, index) => {
      const level =
        alert.level === "critical"
          ? "🔴"
          : alert.level === "high"
            ? "🟠"
            : "🟡";

      return `${index + 1}. ${level} ${escapeHtml(
        alert.message
      )}`;
    })
    .join("\n");

  const websiteStatus = website.healthy
    ? `🟢 HTTP ${website.statusCode} — ${website.responseTime} ms`
    : `🔴 بەردەست نییە — ${
        website.error || `HTTP ${website.statusCode ?? "N/A"}`
      }`;

  const supabaseStatus = supabaseHealth.healthy
    ? "🟢 بەردەستە"
    : "🔴 پەیوەندی سەرکەوتوو نەبوو";

  return `
<b>🚨 ئاگادارییەکی چاودێری KurdMDb</b>

🕒 کات: ${escapeHtml(formatDate())}
⏱ ماوەی چاودێری: ${WINDOW_MINUTES} خولەک

<b>⚠️ ڕووداوەکان</b>
${alertLines}

<b>🌐 ماڵپەڕ</b>
${websiteStatus}

<b>🗄 Supabase</b>
${supabaseStatus}

<b>ℹ️ تێبینی</b>
ئەم ئاگادارییە تەنها نیشانەی چاودێرییە.
بەرزبوونەوەی چالاکی بە تەنیا بەڵگەی DDoS نییە.

📋 هیچ IP ـێک خۆکارانە block نەکراوە.
`.trim();
}

async function sendTelegramMessage(message) {
  const url =
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  await axios.post(url, {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "HTML",
    disable_web_page_preview: true
  });
}

async function runScheduledReport() {
  const [website, supabaseHealth, logAnalysis] =
    await Promise.all([
      checkWebsiteHealth(),
      checkSupabaseHealth(),
      analyzeLogs()
    ]);

  const alerts = buildSecurityAlerts(
    website,
    supabaseHealth,
    logAnalysis
  );

  if (alerts.length > 0) {
    const message = buildAlertReport(
      alerts,
      website,
      supabaseHealth
    );

    await sendTelegramMessage(message);
    return;
  }

  const message = buildNormalReport(
    website,
    supabaseHealth,
    logAnalysis
  );

  await sendTelegramMessage(message);
}

runScheduledReport()
  .then(() => {
    console.log("Security monitoring completed successfully.");
  })
  .catch((error) => {
    console.error(
      "Security monitoring failed:",
      error.message
    );

    process.exitCode = 1;
  });
