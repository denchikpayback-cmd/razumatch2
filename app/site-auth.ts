import { timingSafeEqual, randomBytes, createHash, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { ensureEmailVerification, newEmailToken, emailTokenHash, sendVerificationEmail } from './email-verification';
import { getChatGPTUser } from './chatgpt-auth';

const COOKIE = process.env.NODE_ENV === 'production' ? '__Host-razumatch-session' : 'razumatch-session', TTL = 30 * 24 * 60 * 60 * 1000;

const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const scrypt = promisify(scryptCallback);
const hashPassword = async (value: string, salt: string) => (await scrypt(value, salt, 64) as Buffer).toString('hex');
async function passwordColumn(db: any) {
    const rows = await db.prepare("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='credentials' AND column_name IN ('password','password_hash')").all();
    const columns = (rows.results || []).map((r: any) => r.column_name);
    if (columns.includes('password')) return 'password';
    if (columns.includes('password_hash')) return 'password_hash';
    throw new Error('Нет столбца password/password_hash в credentials');
}

const cookie = (token: string, age = TTL / 1000) => `${process.env.NODE_ENV === 'production' ? COOKIE : 'razumatch-session'}=${token}; Path=/; HttpOnly; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}SameSite=Lax; Max-Age=${age}`;

const reply = (data: unknown, status = 200, setCookie?: string) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...(setCookie ? { 'Set-Cookie': setCookie } : {}) } });

function tokenFrom(r: Request) { return r.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || ''; }

const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// An owner-issued grant is scoped to one account and its current recovery hash.
// Rotating that hash consumes the grant, even while its secret remains configured.
function ownerRecoveryAllowed(raw: unknown, existing: any, email: string, code: string, now: number) {
    if (typeof raw !== 'string' || !existing)
        return false;
    try {
        const g = JSON.parse(raw);
        return g.email === email && g.userId === existing.user_id &&
            typeof g.expectedRecoveryHash === 'string' && equal(g.expectedRecoveryHash, existing.recovery_hash) &&
            typeof g.tokenHash === 'string' && /^[a-f0-9]{64}$/.test(g.tokenHash) && equal(digest(code), g.tokenHash) &&
            Number.isSafeInteger(g.issuedAt) && Number.isSafeInteger(g.expiresAt) &&
            g.issuedAt <= now && g.expiresAt > now && g.expiresAt > g.issuedAt && g.expiresAt - g.issuedAt <= 24 * 60 * 60 * 1000;
    }
    catch {
        return false;
    }
}

export async function getSiteUser(r: Request, db: any) {
    const token = tokenFrom(r);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
        return null;
    await ensureEmailVerification();
    const row = await db.prepare('SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND NOT EXISTS (SELECT 1 FROM email_verifications v WHERE v.user_id=u.id AND v.verified_at IS NULL)').bind(digest(token), Date.now()).first();
    return row ? { userId: row.id, email: row.email } : null;
}

export async function handleSiteAuth(r: Request, db: any, action: string, noticeVersion: string, ownerRecoveryGrant?: unknown) {
    if (r.method !== 'POST')
        return reply({ error: 'Метод не поддерживается' }, 405);
    const origin = r.headers.get('origin');
    const requestUrl = new URL(r.url);

    let allowedOrigin = origin === requestUrl.origin;

    if (origin && !allowedOrigin && process.env.NODE_ENV !== 'production') {
        try {
            const source = new URL(origin);
            const localHosts = ['localhost', '127.0.0.1'];

            allowedOrigin =
                localHosts.includes(source.hostname) &&
                localHosts.includes(requestUrl.hostname) &&
                source.port === requestUrl.port &&
                source.protocol === requestUrl.protocol;
        } catch {
            allowedOrigin = false;
        }
    }

    if (!allowedOrigin)
        return reply({ error: 'Недопустимый источник запроса' }, 403);

    const q = (sql: string, ...args: any[]) => db.prepare(sql).bind(...args);
    const currentToken = tokenFrom(r);
    if (action === 'logout') {
        if (currentToken)
            await q('DELETE FROM sessions WHERE token_hash=?', digest(currentToken)).run();
        return reply({ ok: true }, 200, cookie('', 0));
    }
    if (!['register', 'login', 'recover', 'link'].includes(action))
        return reply({ error: 'Не найдено' }, 404);
    if (Number(r.headers.get('content-length')) > 10000)
        return reply({ error: 'Слишком большой запрос' }, 413);
    const text = await r.text();
    if (text.length > 10000)
        return reply({ error: 'Слишком большой запрос' }, 413);
    let b: any;
    try {
        b = JSON.parse(text);
    }
    catch {
        return reply({ error: 'Некорректный запрос' }, 400);
    }
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))
        return reply({ error: 'Укажи email' }, 400);
    if (password.length < 12 || password.length > 128 || Buffer.byteLength(password) > 256)
        return reply({ error: 'Пароль должен содержать от 12 до 128 символов' }, 400);
    // Persisted limits apply to both the email and the trusted edge IP. No raw IP is stored.
    const ip = r.headers.get('cf-connecting-ip') || 'unknown';
    const now = Date.now();
    for (const [key, limit] of [[digest('email:' + email), 10], [digest('ip:' + ip), 40]] as const) {

        await q(
            `INSERT INTO auth_rate_limits (key, attempts, reset_at)
             VALUES (?, 1, ?)
             ON CONFLICT (key) DO UPDATE SET
                 attempts = CASE
                     WHEN auth_rate_limits.reset_at < ?
                     THEN 1
                     ELSE auth_rate_limits.attempts + 1
                 END,
                 reset_at = CASE
                     WHEN auth_rate_limits.reset_at < ?
                     THEN excluded.reset_at
                     ELSE auth_rate_limits.reset_at
                 END`,
            key,
            now + 15 * 60 * 1000,
            now,
            now
        ).run();
        const row = await q('SELECT attempts FROM auth_rate_limits WHERE key=?', key).first();
        if (row.attempts > limit)
            return reply({ error: 'Слишком много попыток. Попробуй через 15 минут.' }, 429);
    }
    await db.batch([q('DELETE FROM sessions WHERE expires<?', now), q('DELETE FROM auth_rate_limits WHERE reset_at<?', now - 24 * 60 * 60 * 1000)]);
    await ensureEmailVerification();
    const column = await passwordColumn(db);
    const existing = await q('SELECT * FROM credentials WHERE email=?', email).first();
    let userId: string;
    if (action === 'register' || action === 'link') {
        if (b.acceptNotice !== true || b.noticeVersion !== noticeVersion)
            return reply({ error: 'Подтверди обработку данных для работы сайта' }, 400);
        if (existing)
            return reply({ error: 'Не удалось зарегистрироваться. Если аккаунт уже есть, войди или используй код восстановления.' }, 409);
        const legacy = action === 'link' ? await getChatGPTUser() : null;
        if (action === 'link' && !legacy)
            return reply({ error: 'Для переноса прежней анкеты сначала подтверди старый вход', needsLegacyLogin: true }, 403);
        if (legacy && await q('SELECT 1 FROM credentials WHERE user_id=?', legacy.userId).first())
            return reply({ error: 'Прежний аккаунт уже перенесён. Используй вход по email.' }, 409);
        userId = legacy?.userId || crypto.randomUUID();
        const verificationToken = newEmailToken();
        const salt = secret();
        const passwordHash = await hashPassword(password, salt);
        try {
            await db.batch([
                q('INSERT INTO users(id,email,created) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email', userId, email, now),
                q(`INSERT INTO credentials(user_id,email,${column},salt,recovery_hash,created) VALUES(?,?,?,?,?,?)`, userId, email, passwordHash, salt, digest(secret()), now),
                q('INSERT INTO privacy_preferences(user_id,notice_version,accepted_at,research_opt_in,updated_at,export_id) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET notice_version=excluded.notice_version,accepted_at=excluded.accepted_at,research_opt_in=0,updated_at=excluded.updated_at,export_id=excluded.export_id', userId, noticeVersion, now, 0, now, crypto.randomUUID()),
                q('INSERT INTO privacy_events(id,user_id,version,research_opt_in,created) VALUES(?,?,?,?,?)', crypto.randomUUID(), userId, noticeVersion, 0, now),
                q('INSERT INTO email_verifications(user_id,token_hash,expires_at,last_sent_at,verified_at,send_count,window_start) VALUES(?,?,?,?,NULL,1,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,last_sent_at=excluded.last_sent_at,verified_at=NULL,send_count=1,window_start=excluded.window_start', userId, emailTokenHash(verificationToken), now + 30 * 60 * 1000, now, now)
            ]);
        }
        catch (error) {
            console.error('Registration failed:', error);
            return reply({ error: 'Не удалось создать аккаунт. Проверь терминал.' }, 500);
        }
        try {
            await sendVerificationEmail(email, verificationToken, requestUrl.origin);
        } catch (error) {
            console.error('Verification email not sent:', error);
            return reply({ error: 'Аккаунт создан, но письмо не отправлено. Проверь настройки Resend и запроси письмо повторно.', verificationRequired: true }, 502);
        }
        return reply({ ok: true, verificationRequired: true, message: 'Подтверди почту по ссылке из письма, чтобы войти.' });
    }
    else if (action === 'login') {
        const stored = existing?.[column];
        const passwordValid = existing && typeof stored === 'string' && (existing.salt ? equal(await hashPassword(password, existing.salt), stored) : equal(stored, password));
        if (!passwordValid) return reply({ error: 'Неверный email или пароль' }, 401);
        const pending = await q('SELECT 1 FROM email_verifications WHERE user_id=? AND verified_at IS NULL', existing.user_id).first();
        if (pending) return reply({ error: 'Сначала подтверди email. Проверь почту или запроси новое письмо.', verificationRequired: true }, 403);
        userId = existing.user_id;
        if (!existing.salt) { const nextSalt = secret(); await q(`UPDATE credentials SET ${column}=?,salt=? WHERE user_id=? AND ${column}=?`, await hashPassword(password,nextSalt),nextSalt,userId,stored).run(); }
    }
    else {
        const code = typeof b.recoveryCode === 'string' ? b.recoveryCode.trim() : '';
        if (!existing || (!equal(digest(code), existing.recovery_hash) && !ownerRecoveryAllowed(ownerRecoveryGrant, existing, email, code, now)))
            return reply({ error: 'Неверный email или код восстановления' }, 401);
        userId = existing.user_id;
        const replacementRecoveryCode = secret();
        // Compare-and-swap consumes the recovery code once, including concurrent requests.
        const nextSalt = secret();
        const changed = await q(`UPDATE credentials SET ${column}=?,salt=?,recovery_hash=? WHERE user_id=? AND recovery_hash=?`, await hashPassword(password, nextSalt), nextSalt, digest(replacementRecoveryCode), userId, existing.recovery_hash).run();
        if (changed.meta?.changes === 0 || changed.changes === 0)
            return reply({ error: 'Код уже использован' }, 409);
        await q('DELETE FROM sessions WHERE user_id=?', userId).run();
    }
    const token = secret();
    await q('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)', digest(token), userId, now + TTL).run();
    return reply({ ok: true }, 200, cookie(token));
}
