import { randomBytes, createHash } from 'node:crypto';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
export const emailTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const newEmailToken = () => randomBytes(32).toString('base64url');

export async function ensureEmailVerification() {
  await pool.query(`CREATE TABLE IF NOT EXISTS email_verifications (
    user_id TEXT PRIMARY KEY,
    token_hash TEXT,
    expires_at BIGINT NOT NULL DEFAULT 0,
    last_sent_at BIGINT NOT NULL DEFAULT 0,
    verified_at BIGINT,
    send_count INTEGER NOT NULL DEFAULT 0,
    window_start BIGINT NOT NULL DEFAULT 0
  )`);
}
export async function sendVerificationEmail(email: string, token: string, requestOrigin: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error('RESEND_API_KEY и EMAIL_FROM должны быть заданы');
  const base = process.env.APP_BASE_URL || requestOrigin;
  const link = new URL('/ui/verify-email.html', base);
  link.searchParams.set('token', token);
  const href = link.toString().replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [email], subject: 'Подтверди почту — RazuMATCH',
      html: `<div style="max-width:520px;margin:auto;font:16px Arial,sans-serif"><h2>Подтверждение почты RazuMATCH</h2><p>Нажми кнопку, чтобы подтвердить адрес и активировать аккаунт. Ссылка действует 30 минут.</p><p><a href="${href}" style="display:inline-block;padding:14px 20px;background:#4a7456;color:white;border-radius:8px;text-decoration:none">Подтвердить почту</a></p><p>Если не регистрировался, проигнорируй письмо.</p></div>`
    }),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) {
    console.error('Resend verification failure:', response.status, (await response.text()).slice(0, 400));
    throw new Error('Resend не принял письмо. Проверь API-ключ и адрес отправителя.');
  }
}
export { pool as emailPool };
