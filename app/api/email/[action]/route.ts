import { NextRequest, NextResponse } from 'next/server';
import pg from 'pg';
import { randomBytes, createHash, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { getSiteUser } from '../../../site-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const scrypt = promisify(scryptCallback);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const generic = { ok: true, message: 'Если этот адрес зарегистрирован, письмо со ссылкой придёт на почту.' };

async function init() {
  await pool.query(`CREATE TABLE IF NOT EXISTS email_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS email_reset_tokens_user_id ON email_reset_tokens(user_id)');
}
async function sendMail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error('RESEND_API_KEY или EMAIL_FROM отсутствует в .env.local');
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
    signal: AbortSignal.timeout(12000)
  });
  if (!result.ok) {
    const err = await result.text();
    console.error('Resend email error', result.status, err.slice(0, 500));
    throw new Error('Не удалось отправить письмо. Проверь домен и ключ Resend.');
  }
}
function originAllowed(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const url = new URL(request.url);
  if (origin === url.origin) return true;
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const other = new URL(origin);
    return ['localhost', '127.0.0.1'].includes(url.hostname)
      && ['localhost', '127.0.0.1'].includes(other.hostname)
      && url.port === other.port && url.protocol === other.protocol;
  } catch { return false; }
}
async function passwordColumn() {
  const r = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name='credentials' AND column_name IN ('password','password_hash')"
  );
  const cols = r.rows.map(x => x.column_name);
  if (cols.includes('password')) return 'password';
  if (cols.includes('password_hash')) return 'password_hash';
  throw new Error('Не найден столбец пароля в credentials');
}
const scrub = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  if (!originAllowed(request)) return json({ error: 'Недопустимый источник запроса' }, 403);
  let body: any;
  try {
    const raw = await request.text();
    if (raw.length > 5000) return json({ error: 'Слишком большой запрос' }, 413);
    body = JSON.parse(raw);
  } catch { return json({ error: 'Некорректный запрос' }, 400); }

  const { action } = await params;
  try {
    if (action === 'welcome') {
      const siteUser = await getSiteUser(request, {
        prepare: (sql: string) => ({ bind: (...params: unknown[]) => ({ first: async () => {
          const args: unknown[] = [];
          const query = sql.replace(/\?/g, () => '$' + (args.push(params[args.length]), args.length));
          const result = await pool.query(query, params);
          return result.rows[0] || null;
        } }) })
      });
      if (!siteUser) return json({ error: 'Нужна авторизация' }, 401);
      await sendMail(siteUser.email, 'Добро пожаловать в RazuMATCH', '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto"><h2>Добро пожаловать в RazuMATCH!</h2><p>Твой аккаунт создан. Если забудешь пароль, воспользуйся ссылкой «Забыли пароль?» на странице входа.</p></div>');
      return json({ ok: true });
    }

    if (action === 'request') {
      const email = scrub(body?.email);
      if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Введи корректный email' }, 400);
      await init();
      const existing = await pool.query('SELECT user_id FROM credentials WHERE lower(email)=$1', [email]);
      if (existing.rows[0]) {
        const now = Date.now();
        const recent = await pool.query('SELECT count(*)::int AS n FROM email_reset_tokens WHERE user_id=$1 AND created_at>$2', [existing.rows[0].user_id, now - 15 * 60_000]);
        if (recent.rows[0].n < 3) {
          const token = randomBytes(32).toString('base64url');
          const tokenHash = hash(token);
          await pool.query('DELETE FROM email_reset_tokens WHERE expires_at<$1', [now]);
          await pool.query('INSERT INTO email_reset_tokens(token_hash,user_id,expires_at,created_at) VALUES($1,$2,$3,$4)', [tokenHash, existing.rows[0].user_id, now + 15 * 60_000, now]);
          const link = new URL('/ui/reset-password.html', request.url);
          link.searchParams.set('token', token);
          const safe = link.toString().replaceAll('&', '&amp;').replaceAll('"','&quot;');
          try {
            await sendMail(email, 'Восстановление пароля RazuMATCH', `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto"><h2>Восстановление пароля</h2><p>Нажми на кнопку, чтобы задать новый пароль. Ссылка действует 15 минут.</p><p><a href="${safe}" style="display:inline-block;padding:12px 20px;background:#42684c;color:white;border-radius:8px;text-decoration:none">Сбросить пароль</a></p><p>Если ты не запрашивал восстановление, просто игнорируй это письмо.</p></div>`);
          } catch (err) {
            await pool.query('DELETE FROM email_reset_tokens WHERE token_hash=$1', [tokenHash]);
            console.error('Password reset delivery failed', err);
            return json({ error: 'Письмо пока не отправилось. Проверь настройки Resend в терминале.' }, 502);
          }
        }
      }
      return json(generic);
    }

    if (action === 'confirm') {
      const token = typeof body?.token === 'string' ? body.token : '';
      const password = typeof body?.password === 'string' ? body.password : '';
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json({ error: 'Ссылка недействительна' }, 400);
      if (password.length < 12 || password.length > 128 || Buffer.byteLength(password) > 256)
        return json({ error: 'Пароль должен содержать 12–128 символов' }, 400);
      await init();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query('SELECT user_id FROM email_reset_tokens WHERE token_hash=$1 AND expires_at>$2 FOR UPDATE', [hash(token), Date.now()]);
        if (!found.rows[0]) {
          await client.query('ROLLBACK');
          return json({ error: 'Ссылка истекла или уже использована. Запроси новую.' }, 400);
        }
        const column = await passwordColumn();
        const salt = randomBytes(32).toString('base64url');
        const passwordHash = (await scrypt(password, salt, 64) as Buffer).toString('hex');
        await client.query(`UPDATE credentials SET ${column}=$1, salt=$2, recovery_hash=$3 WHERE user_id=$4`, [passwordHash, salt, hash(randomBytes(32).toString('base64url')), found.rows[0].user_id]);
        await client.query('DELETE FROM sessions WHERE user_id=$1', [found.rows[0].user_id]);
        await client.query('DELETE FROM email_reset_tokens WHERE user_id=$1', [found.rows[0].user_id]);
        await client.query('COMMIT');
        return json({ ok: true });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally { client.release(); }
    }
    return json({ error: 'Не найдено' }, 404);
  } catch (error) {
    console.error('Email auth error', error);
    return json({ error: 'Ошибка почтового сервиса. Проверь терминал Next.js.' }, 500);
  }
}
