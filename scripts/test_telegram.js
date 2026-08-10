// scripts/test_telegram.js
import axios from 'axios';

const BOT_TOKEN = process.env.SECURITY_TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('❌ گۆڕاوەکانی BOT_TOKEN یان CHAT_ID دانەنراوە!');
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendTestMessage() {
  try {
    console.log('📤 هەوڵی ناردنی نامەی تاقیکردنەوە...');
    const response = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: CHAT_ID,
      text: `🔔 **نامەی تاقیکردنەوە لە سیستەمی ئاسایشی KurdMDb**\n\nکات: ${new Date().toLocaleString('ckb-IR', { timeZone: 'Asia/Tehran' })}\nئەم نامە ئەگەر گەیشت، ئەوا بۆتە و گۆڕاوەکان بە تەواوی کاردەکەن. ✅`,
      parse_mode: 'Markdown',
    });

    if (response.data && response.data.ok) {
      console.log('✅ نامەی تاقیکردنەوە بە سەرکەوتوویی نێردرا!');
    } else {
      console.log('⚠️ وەڵامی تیلیگرام:', response.data);
    }
  } catch (error) {
    console.error('❌ هەڵە لە ناردنی نامەی تاقیکردنەوەدا:');
    if (error.response) {
      console.error('وەڵامی تیلیگرام:', error.response.data);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

sendTestMessage();
