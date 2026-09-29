import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

class SecurityGuard {
  constructor() {
    this.BOT_TOKEN = process.env.SECURITY_TELEGRAM_BOT_TOKEN;
    this.CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    this.SUPABASE_URL = process.env.SUPABASE_URL;
    this.SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

    this.WEBSITE_URL =
      process.env.WEBSITE_URL || 'https://kurd-m-db.vercel.app';

    this.WINDOW_MINUTES = Number(
      process.env.MONITOR_WINDOW_MINUTES || 75
    );

    this.TIMEOUT_MS = Number(
      process.env.MONITOR_TIMEOUT_MS || 8000
    );

    if (
      !this.BOT_TOKEN ||
      !this.CHAT_ID ||
      !this.SUPABASE_URL ||
      !this.SUPABASE_KEY
    ) {
      throw new Error(
        'Missing required monitoring environment variables.'
      );
    }

    this.supabase = createClient(
      this.SUPABASE_URL,
      this.SUPABASE_KEY
    );

    this.telegramApi =
      `https://api.telegram.org/bot${this.BOT_TOKEN}`;
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  formatNumber(value) {
    return new Intl.NumberFormat('en-US')
      .format(Number(value || 0));
  }

  formatTime(value) {
    return new Date(value).toLocaleString('ckb-IR', {
      timeZone: 'Asia/Baghdad',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // =========================================================
  // LOG MONITORING
  // =========================================================

  async analyzeLogs(
    timeWindowMinutes = this.WINDOW_MINUTES
  ) {
    const since = new Date(
      Date.now() -
      timeWindowMinutes * 60 * 1000
    ).toISOString();

    const { data: logs, error } = await this.supabase
      .from('log')
      .select(
        'created_at,status_code,path,ip,error_message'
      )
      .gte('created_at', since)
      .order('created_at', {
        ascending: false
      });

    if (error) {
      throw new Error(
        `Supabase log query failed: ${error.message}`
      );
    }

    const rows = logs || [];

    const statuses = {};
    const paths = {};
    const ipCounts = {};

    const suspiciousIps = new Set();

    for (const row of rows) {
      const status =
        row.status_code ?? 'unknown';

      statuses[status] =
        (statuses[status] || 0) + 1;

      const path =
        row.path || '/';

      paths[path] =
        (paths[path] || 0) + 1;

      if (row.ip) {
        ipCounts[row.ip] =
          (ipCounts[row.ip] || 0) + 1;
      }

      const errorText =
        String(
          row.error_message || ''
        ).toLowerCase();

      /*
       * Security signals.
       * These are signals for review, not proof of an attack.
       */

      if (
        row.ip &&
        /(sql|script|exec|union select|javascript:)/i
          .test(errorText)
      ) {
        suspiciousIps.add(row.ip);
      }
    }

    /*
     * High request activity.
     *
     * This is intentionally much higher than the old
     * 10 requests/minute rule to reduce false positives.
     */

    for (const [ip, count] of Object.entries(ipCounts)) {
      if (count >= 30) {
        suspiciousIps.add(ip);
      }
    }

    const total = rows.length;

    const errors = rows.filter(row =>
      Number(row.status_code) >= 400 ||
      Boolean(row.error_message)
    ).length;

    const clientErrors = rows.filter(row =>
      Number(row.status_code) >= 400 &&
      Number(row.status_code) < 500
    ).length;

    const serverErrors = rows.filter(row =>
      Number(row.status_code) >= 500
    ).length;

    const errorRate =
      total > 0
        ? (errors / total) * 100
        : 0;

    return {
      total,
      requests: total,

      errors,
      clientErrors,
      serverErrors,

      errorRate,

      statuses,
      paths,
      ipCounts,

      suspiciousIps:
        Array.from(suspiciousIps),

      firstLog:
        rows.at(-1)?.created_at || null,

      lastLog:
        rows.at(0)?.created_at || null,

      windowMinutes:
        timeWindowMinutes
    };
  }

  // =========================================================
  // WEBSITE HEALTH
  // =========================================================

  async checkWebsiteHealth() {
    const started = Date.now();

    try {
      const response = await axios.get(
        this.WEBSITE_URL,
        {
          timeout: this.TIMEOUT_MS,

          /*
           * Do not throw automatically for 4xx/5xx.
           * We want to record the actual HTTP status.
           */
          validateStatus: () => true,

          maxRedirects: 5
        }
      );

      const responseTime =
        Date.now() - started;

      return {
        isOnline:
          response.status >= 200 &&
          response.status < 400,

        statusCode:
          response.status,

        responseTime,

        error: null
      };
    } catch (error) {
      return {
        isOnline: false,

        statusCode: null,

        responseTime:
          Date.now() - started,

        error:
          error.code === 'ECONNABORTED'
            ? 'Timeout'
            : error.message
      };
    }
  }

  // =========================================================
  // SUPABASE HEALTH
  // =========================================================

  async checkSupabaseHealth() {
    const started = Date.now();

    try {
      const { error } =
        await this.supabase
          .from('log')
          .select('created_at')
          .limit(1);

      return {
        isOnline: !error,

        responseTime:
          Date.now() - started,

        error:
          error?.message || null
      };
    } catch (error) {
      return {
        isOnline: false,

        responseTime:
          Date.now() - started,

        error:
          error.message
      };
    }
  }

  // =========================================================
  // MONITORING ASSESSMENT
  // =========================================================

  assess(
    stats,
    website,
    database
  ) {
    const issues = [];

    /*
     * Website
     */

    if (!website.isOnline) {
      issues.push(
        'Website is unavailable'
      );
    } else if (
      website.responseTime >= 3000
    ) {
      issues.push(
        'Website response is slow'
      );
    }

    /*
     * Database
     */

    if (!database.isOnline) {
      issues.push(
        'Supabase is unavailable'
      );
    }

    /*
     * Server errors
     */

    if (stats.serverErrors > 0) {
      issues.push(
        `${stats.serverErrors} server error(s) detected`
      );
    }

    /*
     * Error rate
     */

    if (stats.errorRate >= 10) {
      issues.push(
        `High error rate: ${stats.errorRate.toFixed(1)}%`
      );
    }

    /*
     * Security signals
     */

    if (
      stats.suspiciousIps.length > 0
    ) {
      issues.push(
        `${stats.suspiciousIps.length} IP(s) need review`
      );
    }

    /*
     * Overall level
     */

    let level = 'OK';

    if (
      !website.isOnline ||
      !database.isOnline ||
      stats.serverErrors >= 10 ||
      stats.errorRate >= 20
    ) {
      level = 'CRITICAL';
    } else if (
      issues.length > 0
    ) {
      level = 'ATTENTION';
    }

    return {
      level,
      issues
    };
  }

  // =========================================================
  // STATUS FORMAT
  // =========================================================

  statusLine(
    ok,
    good = 'OK',
    bad = 'DOWN'
  ) {
    return ok
      ? `🟢 ${good}`
      : `🔴 ${bad}`;
  }

  // =========================================================
  // MAIN TELEGRAM REPORT
  // =========================================================

  buildExquisiteReport(
    stats,
    website,
    database
  ) {
    const assessment =
      this.assess(
        stats,
        website,
        database
      );

    const statusIcon =
      assessment.level === 'OK'
        ? '🟢'
        : assessment.level === 'ATTENTION'
          ? '🟠'
          : '🔴';

    const now =
      this.formatTime(
        new Date()
      );

    const topPaths =
      Object.entries(stats.paths)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const topIps =
      Object.entries(stats.ipCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const statuses =
      Object.entries(stats.statuses)
        .sort(
          (a, b) =>
            Number(a[0]) -
            Number(b[0])
        );

    const report = [
      '<b>🎛 KurdMDb Monitoring</b>',
      '<i>Operational health &amp; security overview</i>',

      '',

      `<b>${statusIcon} Overall:</b> ${assessment.level}`,

      `🕒 <b>Checked:</b> ${
        this.escapeHtml(now)
      }`,

      `📊 <b>Window:</b> ${
        stats.windowMinutes
      } minutes`,

      '',

      '<b>🌐 SERVICES</b>',

      `Website   ${
        this.statusLine(
          website.isOnline
        )
      } • ${
        website.statusCode ?? '—'
      } • ${
        website.responseTime
      } ms`,

      `Supabase  ${
        this.statusLine(
          database.isOnline
        )
      } • ${
        database.responseTime
      } ms`,

      '',

      '<b>📈 TRAFFIC</b>',

      `Requests       <b>${
        this.formatNumber(
          stats.total
        )
      }</b>`,

      `Errors         <b>${
        this.formatNumber(
          stats.errors
        )
      }</b> (${
        stats.errorRate.toFixed(1)
      }%)`,

      `4xx            <b>${
        this.formatNumber(
          stats.clientErrors
        )
      }</b>`,

      `5xx            <b>${
        this.formatNumber(
          stats.serverErrors
        )
      }</b>`,

      '',

      '<b>📍 TOP ENDPOINTS</b>',

      topPaths.length
        ? topPaths
            .map(
              ([path, count]) =>
                `• <code>${
                  this.escapeHtml(path)
                }</code> — ${count}`
            )
            .join('\n')
        : '• No requests recorded',

      '',

      '<b>🔢 HTTP STATUS</b>',

      statuses.length
        ? statuses
            .map(
              ([status, count]) =>
                `• <code>${
                  this.escapeHtml(status)
                }</code> — ${count}`
            )
            .join('\n')
        : '• No status data',

      '',

      '<b>🛡 SECURITY SIGNALS</b>',

      stats.suspiciousIps.length
        ? `⚠️ Review IP(s): ${
            stats.suspiciousIps
              .slice(0, 8)
              .map(
                ip =>
                  `<code>${
                    this.escapeHtml(ip)
                  }</code>`
              )
              .join(', ')
          }`
        : '🟢 No high-confidence anomaly detected in observed logs.',

      topIps.length
        ? `🔥 Highest activity: ${
            this.escapeHtml(
              topIps[0][0]
            )
          } (${
            topIps[0][1]
          } requests)`
        : '',

      '',

      '<b>🧭 ISSUES</b>',

      assessment.issues.length
        ? assessment.issues
            .map(
              issue =>
                `• ${
                  this.escapeHtml(issue)
                }`
            )
            .join('\n')
        : '• None detected',

      '',

      '<i>Monitoring only • Backup system untouched</i>'
    ];

    return report.join('\n');
  }

  // =========================================================
  // ALERT
  // =========================================================

  buildExquisiteAlert(
    stats,
    website,
    database,
    triggerReason
  ) {
    const assessment =
      this.assess(
        stats,
        website,
        database
      );

    return [
      '<b>🚨 KurdMDb Monitoring Alert</b>',

      '',

      `<b>Trigger:</b> ${
        this.escapeHtml(
          triggerReason
        )
      }`,

      `<b>Level:</b> ${
        assessment.level
      }`,

      `<b>Website:</b> ${
        this.statusLine(
          website.isOnline
        )
      } • ${
        website.statusCode ?? '—'
      } • ${
        website.responseTime
      } ms`,

      `<b>Supabase:</b> ${
        this.statusLine(
          database.isOnline
        )
      } • ${
        database.responseTime
      } ms`,

      `<b>Window:</b> ${
        stats.windowMinutes
      } minutes`,

      '',

      `Requests: <b>${
        stats.total
      }</b>`,

      `Errors: <b>${
        stats.errors
      }</b> (${
        stats.errorRate.toFixed(1)
      }%)`,

      `5xx: <b>${
        stats.serverErrors
      }</b>`,

      `Suspicious IPs: <b>${
        stats.suspiciousIps.length
      }</b>`,

      '',

      assessment.issues.length
        ? assessment.issues
            .map(
              issue =>
                `• ${
                  this.escapeHtml(issue)
                }`
            )
            .join('\n')
        : '• No additional issue detected.',

      '',

      '<i>Review the underlying logs before taking action.</i>'
    ].join('\n');
  }

  // =========================================================
  // TELEGRAM
  // =========================================================

  async sendMessage(text) {
    try {
      const response =
        await axios.post(
          `${this.telegramApi}/sendMessage`,
          {
            chat_id: this.CHAT_ID,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true
          }
        );

      return response.data.result.message_id;
    } catch (error) {
      console.error(
        'Telegram send failed:',
        error.response?.data
          ?.description ||
        error.message
      );

      /*
       * Fallback without HTML.
       */

      try {
        const fallback =
          await axios.post(
            `${this.telegramApi}/sendMessage`,
            {
              chat_id: this.CHAT_ID,
              text: text.replace(
                /<[^>]+>/g,
                ''
              ),
              disable_web_page_preview: true
            }
          );

        return fallback.data.result.message_id;
      } catch (fallbackError) {
        console.error(
          'Telegram fallback failed:',
          fallbackError.message
        );

        return null;
      }
    }
  }

  // =========================================================
  // OLD TELEGRAM MESSAGE CLEANUP
  // =========================================================

  async deleteOldMessages() {
    const cutoff =
      new Date(
        Date.now() -
        30 *
        24 *
        60 *
        60 *
        1000
      ).toISOString();

    const {
      data,
      error
    } = await this.supabase
      .from('security_logs')
      .select(
        'id,message_id'
      )
      .lt(
        'sent_at',
        cutoff
      );

    if (
      error ||
      !data
    ) {
      return;
    }

    for (const row of data) {
      try {
        await axios.post(
          `${this.telegramApi}/deleteMessage`,
          {
            chat_id: this.CHAT_ID,
            message_id:
              row.message_id
          }
        );

        await this.supabase
          .from('security_logs')
          .delete()
          .eq(
            'id',
            row.id
          );
      } catch {
        // Ignore already-deleted messages.
      }
    }
  }

  // =========================================================
  // SAVE MESSAGE ID
  // =========================================================

  async saveMessageId(messageId) {
    if (!messageId) {
      return;
    }

    await this.supabase
      .from('security_logs')
      .insert([
        {
          message_id:
            messageId,

          chat_id:
            String(
              this.CHAT_ID
            ),

          sent_at:
            new Date().toISOString()
        }
      ]);
  }

  // =========================================================
  // EXISTING IP FUNCTIONS
  // =========================================================

  async blockIp(
    ipAddress,
    reason = 'Suspicious activity'
  ) {
    if (!ipAddress) {
      return false;
    }

    const {
      error
    } = await this.supabase
      .from('blocked_ips')
      .upsert(
        {
          ip_address:
            ipAddress,

          reason,

          expires_at:
            new Date(
              Date.now() +
              24 *
              60 *
              60 *
              1000
            ).toISOString()
        },
        {
          onConflict:
            'ip_address'
        }
      );

    return !error;
  }

  async isIpBlocked(
    ipAddress
  ) {
    if (!ipAddress) {
      return false;
    }

    const {
      data,
      error
    } = await this.supabase
      .from('blocked_ips')
      .select(
        'expires_at'
      )
      .eq(
        'ip_address',
        ipAddress
      )
      .maybeSingle();

    if (
      error ||
      !data
    ) {
      return false;
    }

    if (
      new Date(
        data.expires_at
      ) < new Date()
    ) {
      await this.supabase
        .from('blocked_ips')
        .delete()
        .eq(
          'ip_address',
          ipAddress
        );

      return false;
    }

    return true;
  }

  // =========================================================
  // IMPORTANT:
  // MONITORING ONLY
  //
  // This function is intentionally NOT called by the
  // scheduled monitoring report.
  // =========================================================

  async autoBlockSuspiciousIps(
    stats
  ) {
    for (
      const ip of
      stats?.suspiciousIps || []
    ) {
      await this.blockIp(
        ip,
        'Suspicious activity detected by monitor'
      );
    }
  }

  // =========================================================
  // SCHEDULED MONITORING
  // =========================================================

  async runScheduledReport() {
    console.log(
      `📡 Monitoring started: ${
        this.WINDOW_MINUTES
      } minute window`
    );

    const [
      website,
      database
    ] = await Promise.all([
      this.checkWebsiteHealth(),
      this.checkSupabaseHealth()
    ]);

    let stats;

    try {
      stats =
        await this.analyzeLogs();
    } catch (error) {
      console.error(
        error.message
      );

      const id =
        await this.sendMessage(
          `<b>⚠️ KurdMDb Monitoring</b>\n\n` +
          `Could not read monitoring logs.\n` +
          `<code>${
            this.escapeHtml(
              error.message
            )
          }</code>`
        );

      await this.saveMessageId(
        id
      );

      return;
    }

    const id =
      await this.sendMessage(
        this.buildExquisiteReport(
          stats,
          website,
          database
        )
      );

    await this.saveMessageId(
      id
    );

    await this.deleteOldMessages();

    console.log(
      '✅ Monitoring report sent.'
    );
  }

  // =========================================================
  // MANUAL / INSTANT ALERT
  // =========================================================

  async runInstantAlert(
    triggerReason =
      'Manual monitoring alert'
  ) {
    const [
      website,
      database
    ] = await Promise.all([
      this.checkWebsiteHealth(),
      this.checkSupabaseHealth()
    ]);

    let stats;

    try {
      stats =
        await this.analyzeLogs();
    } catch (error) {
      await this.sendMessage(
        `<b>⚠️ Monitoring alert failed</b>\n` +
        `<code>${
          this.escapeHtml(
            error.message
          )
        }</code>`
      );

      return false;
    }

    /*
     * IMPORTANT:
     * Do NOT automatically block IPs here.
     *
     * This system is monitoring-only.
     */

    const id =
      await this.sendMessage(
        this.buildExquisiteAlert(
          stats,
          website,
          database,
          triggerReason
        )
      );

    await this.saveMessageId(
      id
    );

    return Boolean(id);
  }
}

export default SecurityGuard;
