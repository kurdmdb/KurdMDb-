const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');
const FormData = require('form-data');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const BACKUP_DIR = './backups';

async function runBackup() {
  console.log('🚀 Backup started...');

  const { data: tables, error: tableError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_type', 'BASE TABLE');

  if (tableError) {
    console.error('Error fetching tables:', tableError);
    process.exit(1);
  }

  const allData = {};
  for (const row of tables) {
    const tableName = row.table_name;
    console.log(`📥 Fetching: ${tableName}`);
    const { data, error } = await supabase.from(tableName).select('*');
    if (!error) allData[tableName] = data;
    else allData[tableName] = [];
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
  const fileName = `${timestamp}.json`;
  const filePath = path.join(BACKUP_DIR, fileName);

  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const backupPayload = {
    backup_time: now.toISOString(),
    database: 'supabase',
    data: allData,
  };

  fs.writeFileSync(filePath, JSON.stringify(backupPayload, null, 2));
  console.log(`✅ JSON saved: ${filePath}`);

  // ناردن بۆ تیلیگرام
  try {
    const form = new FormData();
    form.append('chat_id', TELEGRAM_CHAT_ID);
    form.append('document', fs.createReadStream(filePath));
    form.append('caption', `📦 Backup at ${now.toISOString()}`);

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`, form, {
      headers: form.getHeaders(),
    });
    console.log('📤 Sent to Telegram.');
  } catch (tgError) {
    console.error('❌ Telegram error:', tgError.message);
  }

  // ناردن بۆ GitHub
  try {
    execSync(`git config user.name "github-actions[bot]"`, { stdio: 'inherit' });
    execSync(`git config user.email "github-actions[bot]@users.noreply.github.com"`, { stdio: 'inherit' });
    execSync(`git add ${BACKUP_DIR}/*.json`, { stdio: 'inherit' });
    execSync(`git commit -m "🤖 Auto backup: ${now.toISOString()}" || echo "No changes"`, { stdio: 'inherit' });
    execSync(`git push origin main`, { stdio: 'inherit' });
    console.log('🚀 Pushed to GitHub.');
  } catch (gitError) {
    console.error('❌ Git push error:', gitError.message);
  }

  cleanupOldBackups();
}

function cleanupOldBackups() {
  console.log('🧹 Cleaning up...');
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ name: f, path: path.join(BACKUP_DIR, f) }))
    .map(f => {
      const dateStr = f.name.split('.')[0].replace(/_/g, 'T').replace(/-/g, ':');
      const date = new Date(dateStr);
      return { ...f, date };
    })
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
  console.log('✅ Cleanup done.');
}

runBackup().catch(console.error);
