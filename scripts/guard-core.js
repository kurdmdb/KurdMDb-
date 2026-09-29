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
    this.supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_KEY
    );
  }

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
        throw new Error(`Supabase log query failed: ${error.message}`);
      }

      const logs = data || [];

      const ipCounts = new Map();

      for (const log of logs) {
        const ip = log.ip_address;

        if (!ip) continue;

        ipCounts.set(
          ip,
          (ipCounts.get(ip) || 0) + 1
        );
      }

      const suspiciousIps = [...ipCounts.entries()]
        .filter(([, count]) => count >= SUSPICIOUS_IP_THRESHOLD)
        .sort((a, b) => b[1] - a[1])
        .map(([ip, count]) => ({
          ip,
          count,
        }));

      const actionCounts = {};

      for (const log of logs) {
        const action = log.action || 'unknown';
        actionCounts[action] = (actionCounts[action] || 0) + 1;
      }

      return {
        success: true,
        totalLogs: logs.length,
        suspiciousIps,
        actionCounts,
        logs,
        windowMinutes: timeWindowMinutes,
      };
    } catch (error) {
      console.error('Log analysis error:', error.message);

      return {
        success: false,
        totalLogs: 0,
        suspiciousIps: [],
        actionCounts: {},
        logs: [],
        windowMinutes: timeWindowMinutes,
        error: error.message,
      };
    }
  }

  async checkWebsiteHealth() {
    try {
      const response = await axios.get(WEBSITE_URL, {
        timeout: 10000,
        validateStatus: () => true,
      });

      const status = response.status;

      return {
        healthy: status >= 200 && status < 400,
        status,
        responseTime: response.headers['x-response-time'] || null,
      };
    } catch (error) {
      return {
        healthy: false,
        status: null,
        error: error.message,
      };
    }
  }

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

  buildReport(website, supabase, logs) {
    const now = new Date();

    const lines = [];

    lines.push('<b>🛡 KurdMDb Security Monitoring</b>');
    lines.push('');
    lines.push(
      `🕒 ${now.toISOString()}`
    );
    lines.push(
      `⏱ Monitoring window: ${logs.windowMinutes} minutes`
    );
    lines.push('');

    // Website
    if (website.healthy) {
      lines.push(
        `🌐 Website: <b>OK</b> (${website.status})`
      );
    } else {
      lines.push(
        `🌐 Website: <b>PROBLEM</b>`
      );

      if (website.status) {
        lines.push(
          `HTTP status: ${website.status}`
        );
      }

      if (website.error) {
        lines.push(
          `Error: ${this.escapeHtml(website.error)}`
        );
      }
    }

    // Supabase
    if (supabase.healthy) {
      lines.push(
        '🗄 Supabase logs: <b>OK</b>'
      );
    } else {
      lines.push(
        '🗄 Supabase logs: <b>PROBLEM</b>'
      );

      if (supabase.error) {
        lines.push(
          `Error: ${this.escapeHtml(supabase.error)}`
        );
      }
    }

    lines.push('');

    // Logs
    if (logs.success) {
      lines.push(
        `📊 Log events: <b>${logs.totalLogs}</b>`
      );

      if (logs.totalLogs === 0) {
        lines.push(
          'ℹ️ No log events were recorded in this window.'
        );
      }
    } else {
      lines.push(
        '📊 Log events: <b>UNAVAILABLE</b>'
      );

      lines.push(
        `Error: ${this.escapeHtml(logs.error || 'Unknown error')}`
      );
    }

    lines.push('');

    // Actions
    const actions = Object.entries(logs.actionCounts);

    if (actions.length > 0) {
      lines.push('<b>Actions</b>');

      for (const [action, count] of actions.slice(0, 10)) {
        lines.push(
          `• ${this.escapeHtml(action)}: ${count}`
        );
      }

      lines.push('');
    }

    // Suspicious IPs
    if (logs.suspiciousIps.length > 0) {
      lines.push('<b>⚠️ High activity IPs</b>');

      for (const item of logs.suspiciousIps.slice(0, 10)) {
        lines.push(
          `• <code>${this.escapeHtml(item.ip)}</code> — ${item.count} events`
        );
      }

      lines.push('');
      lines.push(
        'ℹ️ Monitoring only — no automatic IP blocking was performed.'
      );
    } else {
      lines.push(
        '✅ No IP exceeded the monitoring threshold.'
      );
    }

    lines.push('');
    lines.push(
      '<i>This report is for monitoring and observation only.</i>'
    );

    return lines.join('\n');
  }

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async sendMessage(message) {
    if (!SECURITY_TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      throw new Error(
        'Telegram environment variables are missing.'
      );
    }

    const url =
      `https://api.telegram.org/bot${SECURITY_TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {
      await axios.post(url, {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    } catch (error) {
      console.error(
        'Telegram send error:',
        error.response?.data || error.message
      );

      throw error;
    }
  }

  async runScheduledReport() {
    const [website, supabase, logs] = await Promise.all([
      this.checkWebsiteHealth(),
      this.checkSupabaseHealth(),
      this.analyzeLogs(WINDOW_MINUTES),
    ]);

    const report = this.buildReport(
      website,
      supabase,
      logs
    );

    await this.sendMessage(report);
  }

  async runInstantAlert() {
    const [website, supabase, logs] = await Promise.all([
      this.checkWebsiteHealth(),
      this.checkSupabaseHealth(),
      this.analyzeLogs(WINDOW_MINUTES),
    ]);

    const report = this.buildReport(
      website,
      supabase,
      logs
    );

    await this.sendMessage(report);
  }
}

export default SecurityGuard;
