const fs = require('fs'), vm = require('vm'), ts = require('typescript'), assert = require('node:assert/strict'), { DatabaseSync } = require('node:sqlite');
const sql = new DatabaseSync(':memory:');
for (const f of fs.readdirSync('drizzle').filter(x => x.endsWith('.sql')).sort())
    sql.exec(fs.readFileSync('drizzle/' + f, 'utf8'));
function prepare(text, args = []) { return { bind(...a) { return prepare(text, a); }, async first() { return sql.prepare(text).get(...args) || null; }, async run() { const r = sql.prepare(text).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; } }; }
const db = { prepare, async batch(stmts) { sql.exec('BEGIN'); try {
        for (const s of stmts)
            await s.run();
        sql.exec('COMMIT');
    }
    catch (e) {
        sql.exec('ROLLBACK');
        throw e;
    } } };
let legacy = null, ownerRecoveryGrant;
const handler = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/site-auth.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: handler, require: p => p.includes('chatgpt-auth') ? { getChatGPTUser: async () => legacy } : require(p), Buffer, Response, URL, crypto, console });
const version = '2026-10-26-v3', goodPassword = 'a long test password 234!';
async function auth(action, data, cookie, origin = 'https://razumatch.test') { let r = new Request('https://razumatch.test/api/auth/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(data) }); let res = await handler.handleSiteAuth(r, db, action, version, ownerRecoveryGrant); return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0], fullCookie: res.headers.get('set-cookie') }; }
const input = (email = 'test@example.org') => ({ email, password: goodPassword, acceptNotice: true, noticeVersion: version });
const who = cookie => handler.getSiteUser(new Request('https://razumatch.test/api/me', { headers: cookie ? { Cookie: cookie } : {} }), db);
(async () => {
    assert.equal((await auth('register', input(), null, 'https://evil.test')).status, 403);
    assert.equal((await auth('register', input(), null, null)).status, 403);
    assert.equal((await auth('register', { ...input(), password: 'short' })).status, 400);
    assert.equal((await auth('register', { ...input(), acceptNotice: false })).status, 400);
    const reg = await auth('register', input('Test@Example.org'));
    assert.equal(reg.status, 200);
    assert(reg.data.recoveryCode);
    assert.match(reg.fullCookie, /HttpOnly/);
    assert.match(reg.fullCookie, /Secure/);
    assert.match(reg.fullCookie, /SameSite=Lax/);
    assert.match(reg.fullCookie, /Path=\//);
    const user = await who(reg.cookie);
    assert.equal(user.email, 'test@example.org');
    const stored = sql.prepare('SELECT * FROM credentials').get();
    assert.notEqual(stored.password_hash, goodPassword);
    assert.notEqual(stored.recovery_hash, reg.data.recoveryCode);
    assert.equal(sql.prepare('SELECT research_opt_in FROM privacy_preferences').get().research_opt_in, 0);
    assert.equal(await who(null), null);
    assert.equal(await who('__Host-razumatch-session=forged'), null);
    assert.equal((await auth('login', { ...input(), password: 'the wrong password 999' })).status, 401);
    const logged = await auth('login', input());
    assert.equal(logged.status, 200);
    assert.equal((await who(logged.cookie)).userId, user.userId);
    assert.equal((await auth('register', input())).status, 409);
    assert.equal((await auth('recover', { ...input(), recoveryCode: 'wrong' })).status, 401);
    const recovered = await auth('recover', { ...input(), recoveryCode: reg.data.recoveryCode, password: 'a different strong password!' });
    assert.equal(recovered.status, 200);
    assert.notEqual(recovered.data.recoveryCode, reg.data.recoveryCode);
    assert.equal(await who(logged.cookie), null);
    assert.equal(await who(reg.cookie), null);
    sql.exec('DELETE FROM auth_rate_limits');
    assert.equal((await auth('recover', { ...input(), recoveryCode: reg.data.recoveryCode })).status, 401);
    assert.equal((await auth('logout', {}, recovered.cookie)).status, 200);
    assert.equal(await who(recovered.cookie), null);
    const again = await auth('login', { ...input(), password: 'a different strong password!' });
    assert.equal(again.status, 200);
    sql.exec('UPDATE sessions SET expires=0');
    assert.equal(await who(again.cookie), null);
    legacy = { userId: 'legacy-owner', email: 'owner@example.org' };
    sql.prepare('INSERT INTO users(id,email,profile,created) VALUES(?,?,?,?)').run(legacy.userId, legacy.email, JSON.stringify({ name: 'Старая анкета' }), Date.now());
    sql.prepare("INSERT INTO settings(key,value) VALUES('admin_user',?)").run(legacy.userId);
    const linked = await auth('link', input('new@example.org'));
    assert.equal(linked.status, 200);
    assert.equal((await who(linked.cookie)).userId, legacy.userId);
    assert.equal(sql.prepare('SELECT profile FROM users WHERE id=?').get(legacy.userId).profile, '{"name":"Старая анкета"}');
    assert.equal(sql.prepare("SELECT value FROM settings WHERE key='admin_user'").get().value, legacy.userId);
    legacy = null;
    assert.equal((await auth('link', input('not-linked@example.org'))).status, 403);
    // Owner-issued recovery remains bound to one existing account and is consumed by CAS.
    sql.exec('DELETE FROM auth_rate_limits');
    const before = sql.prepare('SELECT * FROM credentials WHERE user_id=?').get(legacy?.userId || 'legacy-owner');
    const hash = s => require('node:crypto').createHash('sha256').update(s).digest('hex');
    const grant = { email: before.email, userId: before.user_id, expectedRecoveryHash: before.recovery_hash, tokenHash: hash('owner-test-grant'), issuedAt: Date.now() - 1000, expiresAt: Date.now() + 60000 };
    const ownerInput = { ...input(before.email), recoveryCode: 'owner-test-grant', password: 'owner replacement password!' };
    ownerRecoveryGrant = JSON.stringify({ ...grant, expiresAt: Date.now() - 1 });
    assert.equal((await auth('recover', ownerInput)).status, 401);
    ownerRecoveryGrant = JSON.stringify({ ...grant, expiresAt: grant.issuedAt + 25 * 60 * 60 * 1000 });
    assert.equal((await auth('recover', ownerInput)).status, 401);
    ownerRecoveryGrant = JSON.stringify({ ...grant, userId: 'other-account' });
    assert.equal((await auth('recover', ownerInput)).status, 401);
    ownerRecoveryGrant = JSON.stringify({ ...grant, email: 'other@example.org' });
    assert.equal((await auth('recover', ownerInput)).status, 401);
    ownerRecoveryGrant = '{bad JSON';
    assert.equal((await auth('recover', ownerInput)).status, 401);
    ownerRecoveryGrant = JSON.stringify(grant);
    assert.equal((await auth('recover', { ...ownerInput, email: 'test@example.org' })).status, 401);
    assert.equal((await auth('recover', { ...ownerInput, recoveryCode: 'wrong-grant' })).status, 401);
    assert.equal((await auth('recover', ownerInput, null, 'https://evil.test')).status, 403);
    const reset = await auth('recover', ownerInput);
    assert.equal(reset.status, 200);
    assert(reset.data.recoveryCode);
    assert.equal(await who(linked.cookie), null);
    assert.equal((await who(reset.cookie)).userId, before.user_id);
    assert.equal(sql.prepare('SELECT profile FROM users WHERE id=?').get(before.user_id).profile, '{"name":"Старая анкета"}');
    assert.equal(sql.prepare("SELECT value FROM settings WHERE key='admin_user'").get().value, before.user_id);
    assert.equal((await auth('recover', ownerInput)).status, 401);
    sql.exec('DELETE FROM auth_rate_limits');
    assert.equal((await auth('login', input(before.email))).status, 401);
    assert.equal((await auth('login', { ...input(before.email), password: ownerInput.password })).status, 200);
    // The new personal recovery code works without any owner grant.
    ownerRecoveryGrant = undefined;
    assert.equal((await auth('recover', { ...ownerInput, recoveryCode: reset.data.recoveryCode })).status, 200);
    sql.exec('DELETE FROM auth_rate_limits');
    for (let i = 0; i < 11; i++) {
        const r = await auth('login', input('unknown@example.org'));
        if (i === 10)
            assert.equal(r.status, 429);
    }
    console.log('PASS: local registration/login, consent, password hashing, cookie flags, forged/expired sessions, logout, recovery rotation, session revocation, legacy migration, admin preservation, rate limiting and CSRF');
})().catch(e => { console.error(e); process.exitCode = 1; });
