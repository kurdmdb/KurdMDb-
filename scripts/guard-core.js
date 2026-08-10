// scripts/guard-core.js
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

class SecurityGuard {
  constructor() {
    this.BOT_TOKEN = process.env.SECURITY_TELEGRAM_BOT_TOKEN;
    this.CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    this.SUPABASE_URL = process.env.SUPABASE_URL;
    this.SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
    this.WEBSITE_URL = process.env.WEBSITE_URL || "https://kurd-m-db.vercel.app";

    if (!this.BOT_TOKEN || !this.CHAT_ID || !this.SUPABASE_URL || !this.SUPABASE_KEY) {
      throw new Error('Missing required environment variables!');
    }

    this.supabase = createClient(this.SUPABASE_URL, this.SUPABASE_KEY);
    this.telegramApi = `https://api.telegram.org/bot${this.BOT_TOKEN}`;
  }

  // ------------------- پاککردنەوەی دەق بۆ Telegram legacy Markdown -------------------
  // Telegram-ی "Markdown" (V1) تەنها ئەم کاراکتەرانە تایبەتن: _ * ` [
  // ئەگەر بێ‌کۆنترۆڵ لەناو دەقی دینامیکیدا (path, ip, reason, error message) دابنرێن،
  // sendMessage بە 400 Bad Request "can't parse entities" شکێنراوە.
  escapeMd(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(/([_*`[\]])/g, '\\$1');
  }

  // ------------------- شیکردنەوەی لۆگەکان -------------------
  async analyzeLogs(timeWindowMinutes = 1) {
    const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString();

    const { data: logs, error } = await this.supabase
      .from('log')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('هەڵە لە کاتی خوێندنەوەی لۆگ:', error.message);
      // پێشتر ئەمە null دەگەڕایەوە و runScheduledReport/runInstantAlert بێدەنگ کۆتایی دەهات
      // بەبێ ناردنی هیچ ئاگاداریەک. ئێستا throw دەکەین تاکو هەڵەکە لە GitHub Actions logs
      // دا دیار بێت و کاتیش وا بکات نامەیەکی fallback بنێردرێت (بڕوانە runScheduledReport).
      throw new Error(`Supabase query failed (logs): ${error.message}`);
    }

    if (!logs || logs.length === 0) {
      return { total: 0, errors: 0, errorRate: 0, requests: 0, statuses: {}, paths: {}, suspiciousIps: [] };
    }

    const total = logs.length;
    const errors = logs.filter(row => row.status_code >= 400 || row.error_message).length;
    const errorRate = total > 0 ? (errors / total) * 100 : 0;
    const statuses = {};
    const paths = {};
    let suspiciousIps = new Set();

    logs.forEach(row => {
      const status = row.status_code || 'unknown';
      statuses[status] = (statuses[status] || 0) + 1;
      const path = row.path || '/';
      paths[path] = (paths[path] || 0) + 1;
      if (row.error_message && (row.error_message.includes('SQL') || row.error_message.includes('script') || row.error_message.includes('exec'))) {
        if (row.ip) suspiciousIps.add(row.ip);
      }
    });

    const ipCounts = {};
    logs.forEach(row => { if (row.ip) ipCounts[row.ip] = (ipCounts[row.ip] || 0) + 1; });
    for (const [ip, count] of Object.entries(ipCounts)) {
      if (count > 10) suspiciousIps.add(ip);
    }

    return {
      total,
      errors,
      errorRate,
      requests: total,
      statuses,
      paths,
      suspiciousIps: Array.from(suspiciousIps),
      firstLog: logs[logs.length - 1]?.created_at,
      lastLog: logs[0]?.created_at
    };
  }

  // ------------------- پشکنینی تەندروستی ماڵپەڕ -------------------
  async checkWebsiteHealth() {
    const startTime = Date.now();
    let statusText = '🟢 بە تەواوی کاردەکات';
    let isOnline = true;
    let statusCode = 200;
    let responseTime = 0;

    try {
      const response = await axios.get(this.WEBSITE_URL, { timeout: 8000 });
      responseTime = Date.now() - startTime;
      statusCode = response.status;
      if (response.status !== 200) {
        statusText = `🟡 کۆدی وەڵام: ${response.status}`;
        isOnline = false;
      }
    } catch (error) {
      responseTime = Date.now() - startTime;
      statusText = `🔴 بەردەست نییە! هەڵە: ${error.message}`;
      isOnline = false;
      statusCode = 500;
    }
    return { isOnline, statusText, statusCode, responseTime };
  }

  // ------------------- دروستکردنی ڕاپۆرتی نایاب -------------------
  buildExquisiteReport(stats, health) {
    const now = new Date();
    const dateStr = now.toLocaleString('ckb-IR', { timeZone: 'Asia/Tehran', hour12: false });
    const dayOfWeek = now.toLocaleString('ckb-IR', { weekday: 'long', timeZone: 'Asia/Tehran' });

    let riskLevel = '🟢 ئاسایی';
    let riskEmoji = '🌿';
    if (stats.errorRate > 20) { riskLevel = '🔴 مەترسی زۆر بەرز'; riskEmoji = '🚨'; }
    else if (stats.errorRate > 5) { riskLevel = '🟠 مەترسی ناوەند'; riskEmoji = '⚠️'; }

    const topPaths = Object.entries(stats.paths)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([p, c]) => `  • ${this.escapeMd(p)} : ${c} داواکاری`)
      .join('\n');

    const suspiciousIpsList = stats.suspiciousIps.map(ip => this.escapeMd(ip)).join('\n  • ');

    const message = `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   📢 *KurdMDb - چاودێری تەندروستی*  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

🌹 *بۆ سەرۆکی گەورەی KurdMDb، بەڕێز ئامێز،*
سڵاو و ڕێزی تایبەت. سیستەمی زیرەکی چاودێری سەلامەتی،
ڕاپۆرتی خوارەوەی ئامادە کردووە.

────────────────────────────────
📅 *ڕۆژ و کات:* ${dayOfWeek}، ${this.escapeMd(dateStr)}
🌐 *ماڵپەڕ:* ${this.escapeMd(this.WEBSITE_URL)}
📊 *دۆخی سەرەکی:* ${health.isOnline ? '🟢 ئۆنلاین و چالاک' : '🔴 ئۆفلاین (پێویستی بە چاودێری هەنگاوەکانە)'}
⏱️ *کاتی وەڵامدانەوە:* ${health.responseTime} میلیچرکە
📡 *کۆدی دۆخ:* ${health.statusCode}

────────────────────────────────
📈 *ئامارەکانی کۆتایی (١ خولەکی ڕابردوو):*
• *کۆی گشتی داواکاری:* ${stats.total}
• *ژمارەی هەڵەکان:* ${stats.errors} (${stats.errorRate.toFixed(2)}%)
• *پلەی مەترسی:* ${riskLevel} ${riskEmoji}

📋 *پڕداواکاریترین پەڕەکان:*
${topPaths || '  • هیچ داواکارییەک تۆمار نەکراوە'}

🌍 *پۆلێنی کۆدەکانی دۆخ (HTTP):*
${Object.entries(stats.statuses).map(([code, count]) => `  • ${code} : ${count} جار`).join('\n') || '  • هیچ'}

${stats.suspiciousIps.length > 0 ? `🛡️ *ئاگاداری ئاسایش:* ئەم ئایپییانە هەڵەی گوماناویان هەیە:\n  • ${suspiciousIpsList}` : '✅ *هیچ هێرش یان چالاکییەکی گوماناوی نەدۆزراوەتەوە.*'}

────────────────────────────────
💎 *کورتە:* 
ماڵپەڕی KurdMDb لەم ساتەدا ${health.isOnline ? 'ساغ و بەهێزە' : 'دۆخی ئۆفڵاینە'}. سیستەمەکە بەردەوامە لە چاودێریکردن.

---
*ئەم ڕاپۆرتە لەلایەن سکرێپتی چاودێری سەلامەتی KurdMDb ـەوە ئامادە کراوە و نێردراوە.*
🌹 *سوپاس بۆ سەرپەرشتی و پشتیوانی بەڕێزیان.* 
    `.trim();
    return message;
  }

  // ------------------- دروستکردنی نامەی فریاگوزاری -------------------
  buildExquisiteAlert(stats, health, triggerReason) {
    const now = new Date();
    const dateStr = now.toLocaleString('ckb-IR', { timeZone: 'Asia/Tehran', hour12: false });

    const suspiciousIpsInline = stats.suspiciousIps.length > 0
      ? stats.suspiciousIps.map(ip => this.escapeMd(ip)).join(', ')
      : 'هیچ نەدۆزرایەوە';

    const topPaths = Object.entries(stats.paths)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p, c]) => `  • ${this.escapeMd(p)} : ${c} داواکاری`)
      .join('\n');

    const message = `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   🚨 *ئاگادارکردنەوەی فریاگوزاری سەلامەتی* 🚨 ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

💢 *بە سەرۆکی KurdMDb، بەڕێز ئامێز،*
ئاگادارکردنەوەیەکی زۆر لە ڕادەبەدەر! سیستەمەکەمان چالاکییەکی نائاسایی دۆزیوەتەوە 
کە دەتوانێت مەترسی لەسەر بەردەوامی ماڵپەڕەکە دروست بکات.

────────────────────────────────
📌 *هۆکاری ئاگادارکردنەوە:* 
${this.escapeMd(triggerReason)}

⏰ *کاتی ڕوودان:* ${this.escapeMd(dateStr)}
🌐 *ماڵپەڕی مەبەست:* ${this.escapeMd(this.WEBSITE_URL)}
📊 *دۆخی ئێستای ماڵپەڕ:* ${health.isOnline ? '🟢 هێشتا ئۆنلاینە' : '🔴 کەوتووەتە خوارەوە یان خاوە'}

────────────────────────────────
📉 *ئامارەکانی ١ خولەکی کۆتایی (هۆکاری ئاگاداری):*
• *کۆی داواکاری:* ${stats.total}
• *ڕێژەی هەڵە:* ${stats.errors} لە کۆی ${stats.total} (${stats.errorRate.toFixed(2)}%)
• *ئایپیە گوماناوەکان:* ${suspiciousIpsInline}

📋 *پەڕە بەرکارەکان (لەوانەیە ئامانجی هێرش بن):*
${topPaths || '  • دەستنیشان نەکراوە'}

────────────────────────────────
⚡ *پێشنیاری خێرا:*
١. سەیری لاگەکانی ڕاژەخۆر بکە بۆ بینینی ئایپیە تایبەتەکان.
٢. ئەگەر هێرشەکە بەردەوام بوو، ڕێگای سەلامەتی (Cloudflare یان WAF) چالاک بکە.
٣. تیمی تەکنیکی ئاگادار بکەرەوە بۆ ڕووبەڕووبوونەوەی خێرا.

---
*ئەم نامە لە ڕێگەی سیستەمی فریاگوزاریی KurdMDb ـەوە ڕاستەوخۆ نێردراوە.*
🔥 *هیوای سەلامەتی و بەهێزی بۆ ماڵپەڕەکەمان!*
    `.trim();
    return message;
  }

  // ------------------- ناردنی نامە -------------------
  // ئەگەر Markdown هەر شکا (بۆ نموونە کاراکتەرێکی چاوەڕوان‌نەکراو تێپەڕی escaping بوو)،
  // بەبێ parse_mode دووبارە هەوڵ دەدەینەوە وەکو دەقی سادە، تاکو بەلایەنی کەم ئاگاداریەکە بگات
  // لە جیاتی ئەوەی بە تەواوی بفەوتێت.
  async sendMessage(text) {
    try {
      const response = await axios.post(`${this.telegramApi}/sendMessage`, {
        chat_id: this.CHAT_ID,
        text: text,
        parse_mode: 'Markdown',
      });
      return response.data.result.message_id;
    } catch (error) {
      const apiDescription = error.response?.data?.description;
      console.error('ناردنی نامە بە Markdown سەرنەکەوت:', apiDescription || error.message);

      // fallback: هەمان دەق بەبێ parse_mode بنێرە (ئەستێرەکان وەک دەقی ئاسایی دەردەکەون،
      // بەڵام لانیکەم نامەکە دەگات)
      try {
        const fallbackResponse = await axios.post(`${this.telegramApi}/sendMessage`, {
          chat_id: this.CHAT_ID,
          text: text,
        });
        console.warn('⚠️ نامە بەبێ Markdown formatting نێردرا (fallback).');
        return fallbackResponse.data.result.message_id;
      } catch (fallbackError) {
        console.error('ناردنی fallback ـیش سەرنەکەوت:', fallbackError.response?.data?.description || fallbackError.message);
        return null;
      }
    }
  }

  // ------------------- سڕینەوەی نامە کۆنەکان -------------------
  async deleteOldMessages() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: oldLogs, error } = await this.supabase
      .from('security_logs')
      .select('id, message_id, chat_id')
      .lt('sent_at', thirtyDaysAgo.toISOString());

    if (error || !oldLogs) return;

    for (const log of oldLogs) {
      try {
        await axios.post(`${this.telegramApi}/deleteMessage`, {
          chat_id: this.CHAT_ID,
          message_id: log.message_id,
        });
        await this.supabase.from('security_logs').delete().eq('id', log.id);
        console.log(`🗑️ نامەی ${log.message_id} سڕایەوە.`);
      } catch (e) { /* بێدەنگ */ }
    }
  }

  // ------------------- هەڵگرتنی ناسنامەی نامە -------------------
  async saveMessageId(messageId) {
    if (!messageId) return;
    await this.supabase.from('security_logs').insert([
      { message_id: messageId, chat_id: String(this.CHAT_ID), sent_at: new Date().toISOString() }
    ]);
  }

  // =================== بلۆککردنی ئایپ ===================
  async blockIp(ipAddress, reason = 'هێرش یان داواکاریی زۆر') {
    if (!ipAddress) return false;
    try {
      const { error } = await this.supabase
        .from('blocked_ips')
        .upsert({ ip_address: ipAddress, reason: reason, expires_at: new Date(Date.now() + 24*60*60*1000).toISOString() }, { onConflict: 'ip_address' });
      if (error) throw error;
      console.log(`🔒 ئایپی ${ipAddress} بە سەرکەوتوویی ڕەشکرا.`);
      return true;
    } catch (e) {
      console.error('هەڵە لە بلۆککردنی ئایپ:', e.message);
      return false;
    }
  }

  async isIpBlocked(ipAddress) {
    if (!ipAddress) return false;
    const { data, error } = await this.supabase
      .from('blocked_ips')
      .select('expires_at')
      .eq('ip_address', ipAddress)
      .maybeSingle();

    if (error || !data) return false;
    if (new Date(data.expires_at) < new Date()) {
      await this.supabase.from('blocked_ips').delete().eq('ip_address', ipAddress);
      return false;
    }
    return true;
  }

  async autoBlockSuspiciousIps(stats) {
    if (!stats || !stats.suspiciousIps || stats.suspiciousIps.length === 0) return;
    for (const ip of stats.suspiciousIps) {
      await this.blockIp(ip, 'دۆزرایەوە لە کاتی هێرشی ئاسایشدا');
    }
  }

  // =================== کارە سەرەکییەکان ===================
  async runScheduledReport() {
    console.log('📡 دەستپێکردنی ڕاپۆرتی خولەکی...');
    const health = await this.checkWebsiteHealth();
    let stats;
    try {
      stats = await this.analyzeLogs(1);
    } catch (error) {
      // پێشتر: analyzeLogs لە کاتی هەڵەی Supabase دا بێدەنگ null دەگەڕایەوە و runScheduledReport
      // بەبێ ناردنی هیچ نامەیەک کۆتایی دەهات. ئێستا بەلایەنی کەم ئاگاداریەکی خێرا دەنێرین
      // تاکو بزانیت مۆنیتەرینگەکە خۆی شکاوە.
      console.error('❌ analyzeLogs شکا:', error.message);
      await this.sendMessage(`⚠️ *ڕاپۆرتی چاودێری سەرنەکەوت*\nهەڵە لە خوێندنەوەی لۆگەکانی Supabase: ${this.escapeMd(error.message)}`);
      return;
    }
    if (!stats) return;
    const msg = this.buildExquisiteReport(stats, health);
    const msgId = await this.sendMessage(msg);
    if (!msgId) {
      console.error('❌ نامەی ڕاپۆرت بە تەواوی نەنێردرا (نە Markdown و نە fallback).');
    }
    await this.saveMessageId(msgId);
    await this.deleteOldMessages();
    console.log('✅ ڕاپۆرت تەواو بوو.');
  }

  async runInstantAlert(triggerReason = 'دەستی پاچکرا لەلایەن ڕاژەخۆرەوە (مەترسی دۆزرایەوە)') {
    console.log('🚨 دەستپێکردنی ئاگاداری فریاگوزاری...');
    const health = await this.checkWebsiteHealth();
    let stats;
    try {
      stats = await this.analyzeLogs(1);
    } catch (error) {
      console.error('❌ analyzeLogs شکا:', error.message);
      await this.sendMessage(`⚠️ *ئاگاداری فریاگوزاری سەرنەکەوت*\nهەڵە لە خوێندنەوەی لۆگەکانی Supabase: ${this.escapeMd(error.message)}`);
      return false;
    }
    if (!stats) return false;

    if (stats.suspiciousIps && stats.suspiciousIps.length > 0) {
      await this.autoBlockSuspiciousIps(stats);
    }

    const msg = this.buildExquisiteAlert(stats, health, triggerReason);
    const msgId = await this.sendMessage(msg);
    if (!msgId) {
      console.error('❌ نامەی ئاگاداری بە تەواوی نەنێردرا (نە Markdown و نە fallback).');
    }
    await this.saveMessageId(msgId);
    console.log('✅ ئاگاداری فریاگوزاری نێردرا و ئایپە گوماناوەکان بلۆک کران.');
    return true;
  }
}

export default SecurityGuard;
