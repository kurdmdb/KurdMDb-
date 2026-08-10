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

  // ------------------- شیکردنەوەی لۆگەکان -------------------
  async analyzeLogs(timeWindowMinutes = 1) {
    const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString();

    const { data: logs, error } = await this.supabase
      .from('logs')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('هەڵە لە کاتی خوێندنەوەی لۆگ:', error.message);
      return null;
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
      .map(([p, c]) => `  • ${p} : ${c} داواکاری`)
      .join('\n');

    const message = `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   📢 **کوردMDb - چاودێری تەندروستی**  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

🕌 **بۆ سەرۆکی گەورەی کوردMDb، بەڕێز ئامێز،**
سڵاو و ڕێزی تایبەت. ئەمڕۆ لەم کاتە پیرۆزەدا،
سیستەمی زیرەکی چاودێری سەلامەتی ڕاپۆرتی خوارەوە ئامادە کردووە.

────────────────────────────────
📅 **ڕۆژ و کات:** ${dayOfWeek}، ${dateStr}
🌐 **ماڵپەڕ:** ${this.WEBSITE_URL}
📊 **دۆخی سەرەکی:** ${health.isOnline ? '🟢 ئۆنلاین و چالاک' : '🔴 ئۆفلاین (پێویستی بە چاودێری هەنگاوەکانە)'}
⏱️ **کاتی وەڵامدانەوە:** ${health.responseTime} میلیچرکە
📡 **کۆدی دۆخ:** ${health.statusCode}

────────────────────────────────
📈 **ئامارەکانی کۆتایی (١ خولەکی ڕابردوو):**
• **کۆی گشتی داواکاری:** ${stats.total}
• **ژمارەی هەڵەکان:** ${stats.errors} (${stats.errorRate.toFixed(2)}%)
• **پلەی مەترسی:** ${riskLevel} ${riskEmoji}

📋 **پڕداواکاریترین پەڕەکان:**
${topPaths || '  • هیچ داواکارییەک تۆمار نەکراوە'}

🌍 **پۆلێنی کۆدەکانی دۆخ (HTTP):**
${Object.entries(stats.statuses).map(([code, count]) => `  • ${code} : ${count} جار`).join('\n') || '  • هیچ'}

${stats.suspiciousIps.length > 0 ? `🛡️ **ئاگاداری ئاسایش:** ئەم ئایپییانە هەڵەی گوماناویان هەیە:\n  • ${stats.suspiciousIps.join('\n  • ')}` : '✅ **هیچ هێرش یان چالاکییەکی گوماناوی نەدۆزراوەتەوە.**'}

────────────────────────────────
💎 **کورتە:** 
ماڵپەڕی کوردMDb لەم ساتەدا ${health.isOnline ? 'ساغ و بەهێزە' : 'ڕووبەڕووی کێشە بووەتەوە'}. سیستەمەکە بەردەوامە لە چاودێریکردن.

---
*ئەم ڕاپۆرتە لەلایەن سکرێپتی چاودێری سەلامەتی کوردMDb -ەوە ئامادە کراوە و نێردراوە.*
🌹 **سوپاس بۆ سەرپەرشتی و پشتیوانی بەڕێزیان.** 
    `.trim();
    return message;
  }

  // ------------------- دروستکردنی نامەی فریاگوزاری -------------------
  buildExquisiteAlert(stats, health, triggerReason) {
    const now = new Date();
    const dateStr = now.toLocaleString('ckb-IR', { timeZone: 'Asia/Tehran', hour12: false });

    const message = `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   🚨 **ئاگادارکردنەوەی فریاگوزاری سەلامەتی** 🚨 ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

💢 **بە سەرۆکی کوردMDb، بەڕێز ئامێز،**
ئاگادارکردنەوەیەکی زۆر لە ڕادەبەدەر! سیستەمەکەمان چالاکییەکی نائاسایی دۆزیوەتەوە 
کە دەتوانێت مەترسی لەسەر بەردەوامی ماڵپەڕەکە دروست بکات.

────────────────────────────────
📌 **هۆکاری ئاگادارکردنەوە:** 
${triggerReason}

⏰ **کاتی ڕوودان:** ${dateStr}
🌐 **ماڵپەڕی مەبەست:** ${this.WEBSITE_URL}
📊 **دۆخی ئێستای ماڵپەڕ:** ${health.isOnline ? '🟢 هێشتا ئۆنلاینە' : '🔴 کەوتووەتە خوارەوە یان خاوە'}

────────────────────────────────
📉 **ئامارەکانی ١ خولەکی کۆتایی (هۆکاری ئاگاداری):**
• **کۆی داواکاری:** ${stats.total}
• **ڕێژەی هەڵە:** ${stats.errors} لە کۆی ${stats.total} (${stats.errorRate.toFixed(2)}%)
• **ئایپیە گوماناوەکان:** ${stats.suspiciousIps.length > 0 ? stats.suspiciousIps.join(', ') : 'هیچ نەدۆزرایەوە'}

📋 **پەڕە بەرکارەکان (لەوانەیە ئامانجی هێرش بن):**
${Object.entries(stats.paths).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([p,c]) => `  • ${p} : ${c} داواکاری`).join('\n') || '  • دەستنیشان نەکراوە'}

────────────────────────────────
⚡ **پێشنیاری خێرا:**
١. سەیری لاگەکانی ڕاژەخۆر بکە بۆ بینینی ئایپیە تایبەتەکان.
٢. ئەگەر هێرشەکە بەردەوام بوو، ڕێگای سەلامەتی (Cloudflare یان WAF) چالاک بکە.
٣. تیمی تەکنیکی ئاگادار بکەرەوە بۆ ڕووبەڕووبوونەوەی خێرا.

---
*ئەم نامە لە ڕێگەی سیستەمی فریاگوزاریی کوردMDb -ەوە ڕاستەوخۆ نێردراوە.*
🔥 **هیوای سەلامەتی و بەهێزی بۆ ماڵپەڕەکەمان!**
    `.trim();
    return message;
  }

  // ------------------- ناردنی نامە -------------------
  async sendMessage(text) {
    try {
      const response = await axios.post(`${this.telegramApi}/sendMessage`, {
        chat_id: this.CHAT_ID,
        text: text,
        parse_mode: 'Markdown',
      });
      return response.data.result.message_id;
    } catch (error) {
      console.error('ناردنی نامە سەرنەکەوت:', error.message);
      return null;
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
    const stats = await this.analyzeLogs(1);
    if (!stats) return;
    const msg = this.buildExquisiteReport(stats, health);
    const msgId = await this.sendMessage(msg);
    await this.saveMessageId(msgId);
    await this.deleteOldMessages();
    console.log('✅ ڕاپۆرت تەواو بوو.');
  }

  async runInstantAlert(triggerReason = 'دەستی پاچکرا لەلایەن ڕاژەخۆرەوە (مەترسی دۆزرایەوە)') {
    console.log('🚨 دەستپێکردنی ئاگاداری فریاگوزاری...');
    const health = await this.checkWebsiteHealth();
    const stats = await this.analyzeLogs(1);
    if (!stats) return;
    
    if (stats.suspiciousIps && stats.suspiciousIps.length > 0) {
      await this.autoBlockSuspiciousIps(stats);
    }

    const msg = this.buildExquisiteAlert(stats, health, triggerReason);
    const msgId = await this.sendMessage(msg);
    await this.saveMessageId(msgId);
    console.log('✅ ئاگاداری فریاگوزاری نێردرا و ئایپە گوماناوەکان بلۆک کران.');
    return true;
  }
}

export default SecurityGuard;
