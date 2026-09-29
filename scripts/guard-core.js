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

export default class SecurityGuard {
  constructor() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error(
        "SUPABASE_URL or SUPABASE_SERVICE_KEY is missing."
      );
    }

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      throw new Error(
        "Telegram configuration is missing."
      );
    }

    this.supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_KEY
    );
  }

  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  formatDate() {
    return new Date()
      .toISOString()
      .replace("T", " ")
      .replace("Z", " UTC");
  }

  async checkWebsite() {
    const started = Date.now();

    try {
      const response = await axios.get(WEBSITE_URL, {
        timeout: 10000,
        validateStatus: () => true
      });

      const responseTime = Date.now() - started;

      return {
        healthy:
          response.status >= 200 &&
          response.status < 400,
        status: response.status,
        responseTime,
        slow:
          responseTime >= SLOW_RESPONSE_THRESHOLD_MS
      };
    } catch (error) {
      return {
        healthy: false,
        status: null,
        responseTime: Date.now() - started,
        slow: false,
        error: error.message
      };
    }
  }

  async checkSupabase() {
    const { error } = await this.supabase
      .from("log")
      .select("id")
      .limit(1);

    return {
      healthy: !error,
      error: error ? error.message : null
    };
  }

  async readLogs() {
    const since = new Date(
      Date.now() - WINDOW_MINUTES * 60 * 1000
    ).toISOString();

    const { data, error } = await this.supabase
      .from("log")
      .select(
        "id,user_id,action,table_name,record_id,created_at,ip_address,description"
      )
      .gte("created_at", since)
      .order("created_at", {
        ascending: false
      })
      .limit(HIGH_ACTIVITY_THRESHOLD + 1);

    if (error) {
      throw new Error(
        `Supabase log query failed: ${error.message}`
      );
    }

    return data || [];
  }

  analyzeLogs(logs) {
    const ipCounts = new Map();
    const actionCounts = new Map();
    const tableCounts = new Map();

    for (const log of logs) {
      const ip = log.ip_address || "unknown";
      const action = log.action || "unknown";
      const table = log.table_name || "unknown";

      ipCounts.set(
        ip,
        (ipCounts.get(ip) || 0) + 1
      );

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

    for (const [ip, count] of ipCounts) {
      if (
        ip !== "unknown" &&
        count >= SUSPICIOUS_IP_THRESHOLD
      ) {
        suspiciousIps.push({
          ip,
          count
        });
      }
    }

    return {
      total: logs.length,
      ipCounts,
      actionCounts,
      tableCounts,
      suspiciousIps
    };
  }

  buildAlerts(website, supabase, analysis) {
    const alerts = [];

    if (!website.healthy) {
      alerts.push(
        "🔴 ماڵپەڕ بەردەست نییە."
      );
    }

    if (website.status >= 500) {
      alerts.push(
        `🔴 ماڵپەڕ HTTP ${website.status} ـی وەرگرت.`
      );
    }

    if (website.slow) {
      alerts.push(
        `🟡 وەڵامدانەوەی ماڵپەڕ خاوە: ${website.responseTime} ms`
      );
    }

    if (!supabase.healthy) {
      alerts.push(
        "🔴 پەیوەندی بە Supabase سەرکەوتوو نەبوو."
      );
    }

    if (analysis.total >= HIGH_ACTIVITY_THRESHOLD) {
      alerts.push(
        `🟠 چالاکی زۆرە: ${analysis.total} Log لە ${WINDOW_MINUTES} خولەکدا.`
      );
    }

    for (const item of analysis.suspiciousIps) {
      alerts.push(
        `🟡 IP ${item.ip} ـی ${item.count} ڕووداو هەیە.`
      );
    }

    return alerts;
  }

  buildReport(website, supabase, analysis) {
    const actions = [
      ...analysis.actionCounts.entries()
    ]
      .slice(0, 10)
      .map(
        ([action, count]) =>
          `• ${this.escapeHtml(action)}: ${count} جار`
      )
      .join("\n");

    const tables = [
      ...analysis.tableCounts.entries()
    ]
      .slice(0, 10)
      .map(
        ([table, count]) =>
          `• ${this.escapeHtml(table)}: ${count} جار`
      )
      .join("\n");

    const ips =
      analysis.suspiciousIps.length === 0
        ? "🟢 هیچ IP ـێک سنووری چاودێری تێنەپەڕاندووە."
        : analysis.suspiciousIps
            .map(
              (item) =>
                `🟡 ${this.escapeHtml(item.ip)} — ${item.count} ڕووداو`
            )
            .join("\n");

    return `
<b>🛡 ڕاپۆرتی چاودێری KurdMDb</b>

🕒 کات: ${this.escapeHtml(this.formatDate())}
⏱ ماوەی چاودێری: ${WINDOW_MINUTES} خولەک

<b>🌐 دۆخی ماڵپەڕ</b>
${website.healthy ? "🟢 ماڵپەڕ بەردەستە" : "🔴 ماڵپەڕ کێشەی هەیە"}
• HTTP: ${website.status ?? "N/A"}
• وەڵامدانەوە: ${website.responseTime} ms

<b>🗄 دۆخی Supabase</b>
${supabase.healthy ? "🟢 Supabase بەردەستە" : "🔴 Supabase کێشەی هەیە"}

<b>📊 دۆخی Log ـەکان</b>
• کۆی ڕووداوەکان: ${analysis.total}

<b>📌 کردارە تۆمارکراوەکان</b>
${actions || "• هیچ کردارێک نییە"}

<b>🗂 خشتەکانی بەکارهاتوو</b>
${tables || "• هیچ خشتەیەک نییە"}

<b>🔎 چاودێری IP</b>
${ips}

🟢 سیستەمی چاودێری بەردەوامە.
📋 هیچ IP ـێک خۆکارانە block نەکراوە.
`.trim();
  }

  buildAlertReport(alerts) {
    return `
<b>🚨 ئاگادارییەکی چاودێری KurdMDb</b>

🕒 کات: ${this.escapeHtml(this.formatDate())}
⏱ ماوەی چاودێری: ${WINDOW_MINUTES} خولەک

<b>⚠️ ئاگادارییەکان</b>

${alerts
  .map(
    (alert, index) =>
      `${index + 1}. ${this.escapeHtml(alert)}`
  )
  .join("\n")}

<b>ℹ️ تێبینی</b>
ئەم ئاگادارییە تەنها نیشانەی چالاکییەکی نائاساییە.
بە تەنیا بەڵگەی DDoS نییە.

📋 هیچ IP ـێک خۆکارانە block نەکراوە.
`.trim();
  }

  async sendTelegram(message) {
    const url =
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
  }

  async runScheduledReport() {
    const website = await this.checkWebsite();
    const supabase = await this.checkSupabase();

    const logs = await this.readLogs();
    const analysis = this.analyzeLogs(logs);

    const alerts = this.buildAlerts(
      website,
      supabase,
      analysis
    );

    if (alerts.length > 0) {
      await this.sendTelegram(
        this.buildAlertReport(alerts)
      );
      return;
    }

    await this.sendTelegram(
      this.buildReport(
        website,
        supabase,
        analysis
      )
    );
  }
}
