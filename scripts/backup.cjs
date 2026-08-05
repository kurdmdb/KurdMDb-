// --------------------------------------------------------------
// 3. فەرمانی سەرەکی باکئەپ (گۆڕدراو بۆ service_role)
// --------------------------------------------------------------
async function runBackup() {
  try {
    console.log('🚀 Backup process started...');

    // 1. وەرگرتنی لیستی هەموو خشتەکان لە داتابەیس
    const { data: tables, error: tableError } = await supabase.rpc('get_public_tables');

    if (tableError) {
      console.error('❌ Error fetching tables:', tableError.message);
      process.exit(1);
    }

    if (!tables || tables.length === 0) {
      console.error('❌ No tables found!');
      process.exit(1);
    }

    console.log(`📋 Found ${tables.length} tables:`, tables.map(t => t.table_name).join(', '));

    // 2. وەرگرتنی داتا بۆ هەر خشتەیەک
    const allData = {};
    let totalRecords = 0;

    for (const row of tables) {
      const tableName = row.table_name;
      console.log(`📥 Fetching table: ${tableName}`);

      const { data, error } = await supabase
        .from(tableName)
        .select('*');

      if (!error && data) {
        allData[tableName] = data;
        totalRecords += data.length;
        console.log(`✅ ${tableName}: ${data.length} records`);
      } else {
        console.warn(`⚠️ Could not fetch ${tableName}: ${error?.message || 'Unknown error'}`);
        allData[tableName] = [];
      }
    }

    console.log(`📊 Total records: ${totalRecords}`);

    // 3. دروستکردنی فایلی Backup
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
      total_records: totalRecords,
      tables_count: tables.length,
      tables_list: tables.map(t => t.table_name),
      data: allData,
    };

    fs.writeFileSync(filePath, JSON.stringify(backupPayload, null, 2));
    console.log(`✅ JSON backup saved: ${filePath}`);

    // 4. ناردن بۆ تیلیگرام (ئەگەر هەیە)
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      try {
        const form = new FormData();
        form.append('chat_id', process.env.TELEGRAM_CHAT_ID);
        form.append('document', fs.createReadStream(filePath));
        form.append('caption', 
          `📦 Backup completed at ${now.toISOString()}\n` +
          `📊 Total records: ${totalRecords}\n` +
          `📋 Tables: ${tables.length}`
        );

        await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendDocument`,
          form,
          { headers: form.getHeaders() }
        );
        console.log('📤 File sent to Telegram successfully.');
      } catch (tgError) {
        console.error('❌ Failed to send to Telegram:', tgError.message);
      }
    }

    // 5. پاڵنانی بۆ GitHub
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

    // 6. پاککردنەوەی باکئەپە کۆنەکان
    cleanupOldBackups();

    console.log('✅ Backup process completed successfully!');
    console.log(`📁 Backup saved to: ${filePath}`);
    console.log(`📊 Total records backed up: ${totalRecords}`);

  } catch (error) {
    console.error('💥 Unhandled error in runBackup:', error.message);
    process.exit(1);
  }
}
