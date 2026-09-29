import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const {
  SECURITY_TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  WEBSITE_URL = 'https://kurd-m-db.vercel.app',
} = process.env;

const WINDOW_MINUTES = 75;
const SUSPICIOUS_IP_THRESHOLD = 30;

class SecurityGuard {
  constructor() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error(
        'SUPABASE_URL or SUPABASE_SERVICE_KEY is missing.'
      );
    }

    this.supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_KEY
    );
  }

  // ==========================================
  // خوێندنەوە و شیکردنەوەی Log ـەکان
  // ==========================================
  async analyzeLogs(timeWindowMinutes = WINDOW_MINUTES) {
    const since = new Date(
      Date.now() - timeWindowMinutes * 60 * 1000
    ).toISOString();

    try {
      const { data, error } = await this.supabase
        .from('log')
        .select(`
          id,
          user_id,
          action,
          table_name,
          record_id,
          created_at,
          ip_address,
          description
        `)
        .gte('created_at', since)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(
          `Supabase log query failed: ${error.message}`
        );
      }

      const logs = data || [];

      // ------------------------------------------
      // کۆکردنەوەی IP ـەکان
      // ------------------------------------------
      const ipCounts = new Map();

      for (const log of logs) {
        const ip = log.ip_address;

        if (!ip) continue;

        ipCounts.set(
          ip,
          (ipCounts.get(ip) || 0) + 1
        );
      }

      // ------------------------------------------
      // IP ـە زۆر چالاکەکان
      // ------------------------------------------
      const suspiciousIps = [...ipCounts.entries()]
        .filter(
          ([, count]) =>
            count >= SUSPICIOUS_IP_THRESHOLD
        )
        .sort((a, b) => b[1] - a[1])
        .map(([ip, count]) => ({
          ip,
          count,
        }));

      // ------------------------------------------
      // ژماردنی Action ـەکان
      // ------------------------------------------
      const actionCounts = {};

      for (const log of logs) {
        const action = log.action || 'نادیار';

        actionCounts[action] =
          (actionCounts[action] || 0) + 1;
      }

      // ------------------------------------------
      // ژماردنی Table ـەکان
      // ------------------------------------------
      const tableCounts = {};

      for (const log of logs) {
        const table =
          log.table_name || 'نادیار';

        tableCounts[table] =
          (tableCounts[table] || 0) + 1;
      }

      return {
        success: true,
        totalLogs: logs.length,
        suspiciousIps,
        actionCounts,
        tableCounts,
        logs,
        windowMinutes: timeWindowMinutes,
      };
    } catch (error) {
      console.error(
        'Log analysis error:',
        error.message
      );

      return {
        success: false,
        totalLogs: 0,
        suspiciousIps: [],
        actionCounts: {},
        tableCounts: {},
        logs: [],
        windowMinutes: timeWindowMinutes,
        error: error.message,
      };
    }
  }

  // ==========================================
  // پشکنینی Website
  // ==========================================
  async checkWebsiteHealth() {
    try {
      const start = Date.now();

      const response = await axios.get(
        WEBSITE_URL,
        {
          timeout: 10000,
          validateStatus: () => true,
        }
      );

      const responseTime = Date.now() - start;
      const status = response.status;

      return {
        healthy:
          status >= 200 &&
          status < 400,

        status,
        responseTime,
      };
    } catch (error) {
      return {
        healthy: false,
        status: null,
        responseTime: null,
        error: error.message,
      };
    }
  }

  // ==========================================
  // پشکنینی Supabase
  // ==========================================
  async checkSupabaseHealth() {
    try {
      const { error } = await this.supabase
        .from('log')
        .select('id')
        .limit(1);

      if (error) {
        return {
          healthy: false,
          error: error.message,
        };
      }

      return {
        healthy: true,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
      };
    }
  }

  // ==========================================
  // دروستکردنی ڕاپۆرتی Telegram
  // ==========================================
  buildReport(
    website,
    supabase,
    logs
  ) {
    const now = new Date();

    const baghdadTime =
      new Intl.DateTimeFormat(
        'ku-IQ',
        {
          timeZone: 'Asia/Baghdad',
          dateStyle: 'medium',
          timeStyle: 'medium',
        }
      ).format(now);

    const lines = [];

    // ------------------------------------------
    // سەرەتا
    // ------------------------------------------
    lines.push(
      '<b>🛡 ڕاپۆرتی چاودێری KurdMDb</b>'
    );

    lines.push('');

    lines.push(
      `🕒 کات: ${this.escapeHtml(baghdadTime)}`
    );

    lines.push(
      `⏱ ماوەی چاودێری: ${logs.windowMinutes} خولەک`
    );

    lines.push('');

    // ------------------------------------------
    // Website
    // ------------------------------------------
    lines.push('<b>🌐 دۆخی ماڵپەڕ</b>');

    if (website.healthy) {
      lines.push(
        `🟢 ماڵپەڕ بەردەستە`
      );

      lines.push(
        `• HTTP: ${website.status}`
      );

      if (website.responseTime !== null) {
        lines.push(
          `• وەڵامدانەوە: ${website.responseTime} ms`
        );
      }
    } else {
      lines.push(
        '🔴 کێشە لە ماڵپەڕ دۆزرایەوە'
      );

      if (website.status) {
        lines.push(
          `• HTTP: ${website.status}`
        );
      }

      if (website.responseTime !== null) {
        lines.push(
          `• وەڵامدانەوە: ${website.responseTime} ms`
        );
      }

      if (website.error) {
        lines.push(
          `• هەڵە: ${this.escapeHtml(
            website.error
          )}`
        );
      }
    }

    lines.push('');

    // ------------------------------------------
    // Supabase
    // ------------------------------------------
    lines.push(
      '<b>🗄 دۆخی Supabase</b>'
    );

    if (supabase.healthy) {
      lines.push(
        '🟢 Supabase بەردەستە'
      );

      lines.push(
        '• خوێندنەوەی Log ـەکان سەرکەوتوو بوو'
      );
    } else {
      lines.push(
        '🔴 کێشە لە Supabase دۆزرایەوە'
      );

      if (supabase.error) {
        lines.push(
          `• هەڵە: ${this.escapeHtml(
            supabase.error
          )}`
        );
      }
    }

    lines.push('');

    // ------------------------------------------
    // Log ـەکان
    // ------------------------------------------
    lines.push(
      '<b>📊 دۆخی Log ـەکان</b>'
    );

    if (logs.success) {
      lines.push(
        `• کۆی ڕووداوەکان: ${logs.totalLogs}`
      );

      if (logs.totalLogs === 0) {
        lines.push(
          'ℹ️ لەم ماوەیەدا هیچ Log ـێک تۆمار نەکراوە.'
        );
      }
    } else {
      lines.push(
        '🔴 نەکرا Log ـەکان بخوێندرێنەوە.'
      );

      if (logs.error) {
        lines.push(
          `• هۆکار: ${this.escapeHtml(
            logs.error
          )}`
        );
      }
    }

    lines.push('');

    // ------------------------------------------
    // Action ـەکان
    // ------------------------------------------
    const actions =
      Object.entries(logs.actionCounts);

    if (actions.length > 0) {
      lines.push(
        '<b>📌 کردارە تۆمارکراوەکان</b>'
      );

      for (
        const [action, count]
        of actions.slice(0, 10)
      ) {
        lines.push(
          `• ${this.escapeHtml(
            action
          )}: ${count} جار`
        );
      }

      lines.push('');
    }

    // ------------------------------------------
    // Table ـەکان
    // ------------------------------------------
    const tables =
      Object.entries(logs.tableCounts);

    if (tables.length > 0) {
      lines.push(
        '<b>🗂 خشتەکانی بەکارهاتوو</b>'
      );

      for (
        const [table, count]
        of tables.slice(0, 10)
      ) {
        lines.push(
          `• ${this.escapeHtml(
            table
          )}: ${count} جار`
        );
      }

      lines.push('');
    }

    // ------------------------------------------
    // IP ـەکان
    // ------------------------------------------
    lines.push(
      '<b>🔎 چاودێری IP</b>'
    );

    if (
      logs.suspiciousIps.length > 0
    ) {
      lines.push(
        `⚠️ ${logs.suspiciousIps.length} IP ـی زۆر چالاک دۆزرایەوە:`
      );

      for (
        const item
        of logs.suspiciousIps.slice(0, 10)
      ) {
        lines.push(
          `• <code>${this.escapeHtml(
            item.ip
          )}</code> — ${item.count} ڕووداو`
        );
      }

      lines.push('');

      lines.push(
        'ℹ️ تەنها چاودێری کراوە؛ هیچ IP ـێک خۆکارانە block نەکراوە.'
      );
    } else {
      lines.push(
        '🟢 هیچ IP ـێک سنووری چاودێری تێنەپەڕاندووە.'
      );
    }

    lines.push('');

    // ------------------------------------------
    // دۆخی گشتی
    // ------------------------------------------
    const overallHealthy =
      website.healthy &&
      supabase.healthy &&
      logs.success;

    if (overallHealthy) {
      lines.push(
        '<b>🟢 دۆخی گشتی</b>'
      );

      lines.push(
        'هەموو پشکنینە سەرەکییەکان بە سەرکەوتوویی تێپەڕین.'
      );
    } else {
      lines.push(
        '<b>🟠 دۆخی گشتی</b>'
      );

      lines.push(
        'یەکێک لە پشکنینەکان کێشەی هەیە و پێویستی بە پشکنینە.'
      );
    }

    lines.push('');

    lines.push(
      '📋 ئەم سیستەمە تەنها بۆ چاودێرییە و هیچ گۆڕانکارییەکی خۆکار لە سیستەمدا ناکات.'
    );

    return lines.join('\n');
  }

  // ==========================================
  // پاراستنی HTML ـی Telegram
  // ==========================================
  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ==========================================
  // ناردنی پەیام بۆ Telegram
  // ==========================================
  async sendMessage(message) {
    if (
      !SECURITY_TELEGRAM_BOT_TOKEN ||
      !TELEGRAM_CHAT_ID
    ) {
      throw new Error(
        'Telegram environment variables are missing.'
      );
    }

    const url =
      `https://api.telegram.org/bot${SECURITY_TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {
      await axios.post(
        url,
        {
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        },
        {
          timeout: 10000,
        }
      );
    } catch (error) {
      console.error(
        'Telegram send error:',
        error.response?.data ||
          error.message
      );

      throw error;
    }
  }

  // ==========================================
  // ڕاپۆرتی خۆکار
  // ==========================================
  async runScheduledReport() {
    const [
      website,
      supabase,
      logs,
    ] = await Promise.all([
      this.checkWebsiteHealth(),
      this.checkSupabaseHealth(),
      this.analyzeLogs(
        WINDOW_MINUTES
      ),
    ]);

    const report =
      this.buildReport(
        website,
        supabase,
        logs
      );

    await this.sendMessage(report);
  }

  // ==========================================
  // ئاگادارکردنەوەی خێرا
  // تەنها چاودێری — هیچ Block ـێک ناکرێت
  // ==========================================
  async runInstantAlert() {
    const [
      website,
      supabase,
      logs,
    ] = await Promise.all([
      this.checkWebsiteHealth(),
      this.checkSupabaseHealth(),
      this.analyzeLogs(
        WINDOW_MINUTES
      ),
    ]);

    const report =
      this.buildReport(
        website,
        supabase,
        logs
      );

    await this.sendMessage(report);
  }
}

export default SecurityGuard;
