const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');
const FormData = require('form-data');

// --------------------------------------------------------------
// 1. پشکنینی گۆڕەکانی ژینگە (Environment Variables)
// --------------------------------------------------------------
console.log('🔍 Checking environment variables:');
console.log('  SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Set' : '❌ MISSING');
console.log('  SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '✅ Set' : '❌ MISSING');
console.log('  TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? '✅ Set' : '❌ MISSING');
console.log('  TELEGRAM_CHAT_ID:', process.env.TELEGRAM_CHAT_ID ? '✅ Set' : '❌ MISSING');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY is missing!');
  process.exit(1);
}

// --------------------------------------------------------------
// 2. دەستپێکردنی Supabase Client
// --------------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const BACKUP_DIR = './backups';

// --------------------------------------------------------------
// 3. فەرمانی سەرەکی باکئەپ
// --------------------------------------------------------------
async function runBackup() {
  try {
    console.log('🚀 Backup process started...');

    // هەموو خشتەکانی public schema وەربگرە (بەکارهێنانی RPC function)
    const { data: tables, error: tableError } = await supabase.rpc('get_public_tables');

    if (tableError) {
      console.error('❌ Error fetching tables:', tableError.message);
    }

    const allData = {};
    if (tables && tables.length > 0) {
      for (const row of tables) {
        const tableName = row.table_name;
        console.log(`📥 Fetching table: ${tableName}`);
        const { data, error, count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact' });
        if (!error) {
          allData[tableName] = data;
          console.log(`   ✅ ${tableName}: ${data.length} rows (count: ${count})`);
        } else {
          console.warn(`⚠️ Could not fetch ${tableName}: ${error.message}`);
          allData[tableName] = [];
        }
      }
    } else {
      console.warn('⚠️ No tables found via RPC. Make sure get_public_tables() function exists in Supabase.');
    }

    // دروستکردنی ناوی فایل بە کاتی ڕاستەوخۆ
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
    const fileName = `${timestamp}.json`;
    const filePath = path.join(BACKUP_DIR, fileName);

    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const backupPayload = {
      backup_time: now.toISOString(),
      database: 'supabase',
      data: allData,
    };

    fs.writeFileSync(filePath, JSON.stringify(backupPayload, null, 2), { encoding: 'utf8' });
    console.log(`✅ JSON backup saved: ${filePath}`);

    // --------------------------------------------------------------
    // 4. ناردنی فایل بۆ تیلیگرام
    // --------------------------------------------------------------
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      try {
        const form = new FormData();
        form.append('chat_id', process.env.TELEGRAM_CHAT_ID);
        form.append('document', fs.createReadStream(filePath));
        form.append('caption', `📦 Backup completed at ${now.toISOString()}`);

        await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendDocument`,
          form,
          { headers: form.getHeaders() }
        );
        console.log('📤 File sent to Telegram successfully.');
      } catch (tgError) {
        console.error('❌ Failed to send to Telegram:', tgError.message);
      }
    } else {
      console.warn('⚠️ Telegram credentials missing, skipping Telegram send.');
    }

    // --------------------------------------------------------------
    // 5. پاڵنانی بۆ GitHub
    // --------------------------------------------------------------
    try {
      execSync(`git config user.name "github-actions[bot]"`, { stdio: 'inherit' });
      execSync(`git config user.email "github-actions[bot]@users.noreply.github.com"`, { stdio: 'inherit' });
      execSync(`git add ${BACKUP_DIR}/*.json`, { stdio: 'inherit' });
      execSync(`git commit -m "🤖 Automatic backup: ${now.toISOString()}" || echo "No changes to commit"`, {
        stdio: 'inherit',
      });
      execSync(`git push origin main`, { stdio: 'inherit' });
      console.log('🚀 Pushed to GitHub successfully.');
    } catch (gitError) {
      console.error('❌ Git push failed:', gitError.message);
    }

    // --------------------------------------------------------------
    // 6. جێبەجێکردنی سیاسەتی هەڵگرتن
    // --------------------------------------------------------------
    cleanupOldBackups();

    console.log('✅ Backup process completed successfully!');
  } catch (error) {
    console.error('💥 Unhandled error in runBackup:', error.message);
    process.exit(1);
  }
}

// --------------------------------------------------------------
// 7. فەرمانی پاککردنەوەی باکئەپە کۆنەکان
// --------------------------------------------------------------
function cleanupOldBackups() {
  console.log('🧹 Running retention policy...');
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
      }))
      .map((f) => {
        const dateStr = f.name.split('.')[0].replace(/_/g, 'T').replace(/-/g, ':');
        const date = new Date(dateStr);
        return { ...f, date };
      })
      .filter((f) => !isNaN(f.date.getTime()))
      .sort((a, b) => a.date - b.date);

    const now = new Date();
    const toDelete = [];
    const monthGroups = {};

    for (const file of files) {
      const diffDays = (now - file.date) / (1000 * 60 * 60 * 24);
      if (diffDays > 30) {
        toDelete.push(file.path);
      } else {
        const monthKey = file.date.getFullYear() + '-' + String(file.date.getMonth() + 1).padStart(2, '0');
        if (!monthGroups[monthKey]) monthGroups[monthKey] = [];
        monthGroups[monthKey].push(file);
      }
    }

    for (const month in monthGroups) {
      const group = monthGroups[month].sort((a, b) => a.date - b.date);
      for (let i = 0; i < group.length - 1; i++) {
        toDelete.push(group[i].path);
      }
    }

    for (const filePath of toDelete) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Deleted: ${path.basename(filePath)}`);
      }
    }
    console.log('✅ Cleanup finished.');
  } catch (cleanupError) {
    console.error('❌ Cleanup error:', cleanupError.message);
  }
}

// --------------------------------------------------------------
// 8. جێبەجێکردنی سەرەکی
// --------------------------------------------------------------
runBackup();
