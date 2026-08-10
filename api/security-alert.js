// api/security-alert.js
import SecurityGuard from '../scripts/guard-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const guard = new SecurityGuard();
    let reason = 'دەستی پاچکرا لەلایەن ڕاژەخۆر (هێرشی هاتووچۆ)';
    if (req.method === 'POST' && req.body && req.body.reason) {
      reason = req.body.reason;
    } else if (req.method === 'GET' && req.query.reason) {
      reason = req.query.reason;
    }

    await guard.runInstantAlert(reason);
    res.status(200).json({
      success: true,
      message: 'ئاگاداری فریاگوزاری بە سەرکەوتوویی نێردرا و ئایپەکان بلۆک کران.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('هەڵە لە API ی ئاگاداری:', error.message);
    res.status(500).json({
      success: false,
      error: 'ئاگادارییەکە نەنێردرا، تکایە دواتر هەوڵبدەرەوە.'
    });
  }
}
