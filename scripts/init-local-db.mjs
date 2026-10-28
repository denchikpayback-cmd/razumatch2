import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const d1Dir = join(root, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
if (!existsSync(d1Dir)) {
  console.error('База D1 пока не создана. Запусти pnpm dev, открой http://127.0.0.1:5173/ и затем снова выполни pnpm db:local:init во ВТОРОМ терминале.');
  process.exit(1);
}
const files = readdirSync(d1Dir).filter(name => name.endsWith('.sqlite') && name !== 'metadata.sqlite');
if (files.length !== 1) {
  console.error(`Найдено ${files.length} файлов D1. Ничего не изменено: требуется ровно один файл локальной D1.`, files);
  process.exit(1);
}
const dbPath = join(d1Dir, files[0]);
const backupDir = join(root, '.wrangler', 'backups');
mkdirSync(backupDir, { recursive: true });
const backupPath = join(backupDir, `${basename(dbPath)}.${new Date().toISOString().replaceAll(':', '-')}.bak`);
const db = new DatabaseSync(dbPath);
try {
  const existing = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x => x.name));
  const hasUsers = existing.has('users');
  const hasSessions = existing.has('sessions');
  if (hasUsers !== hasSessions) {
    console.error('Обнаружена частично созданная база. Автоматическое исправление остановлено, чтобы не повредить данные.');
    process.exitCode = 1;
  } else {
    // Back up from the same SQLite connection for a consistent snapshot.
    db.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}';`);
    const files = readdirSync(join(root, 'drizzle')).filter(x => /^\d{4}.*\.sql$/.test(x)).sort();
    if (!hasUsers) {
      console.log('Создаём таблицы в локальной базе Vinext…');
      db.exec('BEGIN IMMEDIATE;');
      try {
        for (const name of files) {
          const sql = readFileSync(join(root, 'drizzle', name), 'utf8').replaceAll('--> statement-breakpoint', '\n');
          db.exec(sql);
          console.log('  ✓', name);
        }
        db.exec('COMMIT;');
      } catch(e) {db.exec('ROLLBACK;'); throw e;}
    } else if (!existing.has('admin_chat_audit')) {
      const name = files.find(f => f.startsWith('0005_'));
      if (name) {
        db.exec(readFileSync(join(root, 'drizzle', name), 'utf8'));
        console.log('  ✓', name);
      }
    }
    const result = db.prepare('SELECT COUNT(*) AS total FROM users').get();
    console.log(`Готово! Пользователей: ${result.total}. Резервная копия: ${backupPath}`);
    console.log('Теперь перезагрузи страницу http://127.0.0.1:5173/ (Ctrl+Shift+R).');
  }
} catch(e) {
  console.error('Ошибка инициализации:', e.message);
  process.exitCode = 1;
} finally { db.close(); }
