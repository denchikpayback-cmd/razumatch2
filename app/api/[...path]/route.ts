import { database, mediaBucket } from '../../postgres-adapter';
export const runtime = 'nodejs';
import { getSiteUser, handleSiteAuth } from '../../site-auth';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const uid = () => crypto.randomUUID();
const NOTICE_VERSION = '2026-10-27-v4';
const cut = (v: unknown, n = 500) => typeof v === 'string' ? v.trim().slice(0, n) : '';
function profile(p: any) { const age = Number(p.age); if (!Number.isInteger(age) || age < 16 || age > 99)
    throw new Error('Укажи возраст от 16 до 99 лет'); const name = cut(p.name, 40); if (!name)
    throw new Error('Укажи имя'); const course = cut(p.course, 30); if (!['1 курс', '2 курс', '3 курс', '4 курс', 'Магистратура', 'Аспирантура', 'Выпускник'].includes(course))
    throw new Error('Выбери курс'); let out: any = { name, age, course }; for (const k of ['surname', 'group', 'faculty', 'bio', 'interests', 'goal', 'gender', 'music', 'films', 'books', 'hobbies', 'weekend', 'communication', 'values', 'lookingFor', 'city'])
    out[k] = cut(p[k], k === 'bio' ? 500 : 180); const residence = cut(p.residence, 30); if (!['', 'klinskaya', 'orenburgskaya', 'narodnogo', 'none'].includes(residence))
    throw new Error('Выбери место проживания из списка'); out.residence = residence; const soughtGender = cut(p.soughtGender, 10) || 'any'; if (!['any', 'male', 'female'].includes(soughtGender))
    throw new Error('Выбери, кого ищешь'); out.soughtGender = soughtGender; if (p.intentions !== undefined && (!Array.isArray(p.intentions) || !p.intentions.length || p.intentions.some((x: any) => !['friendship', 'relationship'].includes(x))))
    throw new Error('Выбери дружбу, отношения или оба варианта'); out.intentions = intentions(p); out.goal = out.intentions.length === 2 ? 'Дружба и отношения' : out.intentions[0] === 'friendship' ? 'Дружба' : 'Отношения'; return out; }
function intentions(p: any): string[] { if (Array.isArray(p.intentions) && p.intentions.length)
    return [...new Set(p.intentions.filter((v: any) => ['friendship', 'relationship'].includes(v)))] as string[]; return p.goal === 'Дружба' ? ['friendship'] : ['Отношения', 'Свидания'].includes(p.goal) ? ['relationship'] : ['friendship', 'relationship']; }
function rank(a: any, b: any) { let score = 0, reasons: string[] = []; for (const [key, label, weight] of [['interests', 'Общие интересы', 4], ['music', 'Музыкальные вкусы', 3], ['films', 'Любимые фильмы', 3], ['books', 'Книги', 2], ['hobbies', 'Увлечения', 3], ['values', 'Ценности', 3], ['weekend', 'Отдых', 2]] as const) {
    const tokens = (x: string) => (x || '').toLowerCase().split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
    if (tokens(a[key]).some(x => tokens(b[key]).includes(x))) {
        score += weight;
        reasons.push(label);
    }
} if (a.goal && a.goal === b.goal) {
    score += 3;
    reasons.push('Одинаковая цель знакомства');
} if (a.faculty && a.faculty === b.faculty) {
    score++;
    reasons.push('Один факультет');
} return { score, reasons: reasons.slice(0, 3) }; }
export async function GET(r: Request) { return handle(r); }
export async function POST(r: Request) { return handle(r); }
export async function DELETE(r: Request) { return handle(r); }
async function handle(r: Request) {
    try {
        const db = database, bucket = mediaBucket;
        if (!db || !bucket)
            return json({ error: 'Серверное хранилище пока не подключено' }, 503);
        const path = new URL(r.url).pathname.slice(5).split('/').filter(Boolean), method = r.method;
        if (path[0] === 'project' && method === 'GET') {
            const row = await db.prepare("SELECT value FROM settings WHERE key='project_public'").first();
            return json(row ? JSON.parse(row.value) : { operatorName: '', contact: '' });
        }
        if (path[0] === 'auth')
            return await handleSiteAuth(r, db, path[1], NOTICE_VERSION, process.env.ACCOUNT_RECOVERY_GRANT);
        const user = await getSiteUser(r, db);
        if (!user)
            return json({ error: 'Войди в аккаунт разуMATCH' }, 401);
        const me = user.userId;
        if (method !== 'GET') {
            const origin = r.headers.get('origin');
            if (origin && origin !== new URL(r.url).origin)
                return json({ error: 'Недопустимый источник запроса' }, 403);
        }
        const q = (sql: string, ...args: any[]) => db.prepare(sql).bind(...args);
        const one = async (sql: string, ...args: any[]) => q(sql, ...args).first();
        const all = async (sql: string, ...args: any[]) => ((await q(sql, ...args).all()).results || []);
        await q('INSERT OR IGNORE INTO users(id,email,created) VALUES(?,?,?)', me, user.email, Date.now()).run();
        const mine = await one('SELECT * FROM users WHERE id=?', me), myProfile = JSON.parse(mine.profile), adminSetting = await one("SELECT value FROM settings WHERE key='admin_user'");
        const privacy = await one('SELECT * FROM privacy_preferences WHERE user_id=?', me);
        const noticeAccepted = privacy?.notice_version === NOTICE_VERSION;
        const admin = adminSetting?.value === me;
        const requireAdmin = () => { if (!admin)
            throw Object.assign(new Error('Доступ только администратору'), { status: 403 }); };
        const getBody = async () => { if (Number(r.headers.get('content-length')) > 30000)
            throw new Error('Слишком большой запрос'); const text = await r.text(); if (text.length > 30000)
            throw new Error('Слишком большой запрос'); return JSON.parse(text); };
        async function allowed(a: string, b: string) { if (a === b || !noticeAccepted)
            return false; if (!await one('SELECT 1 FROM privacy_preferences WHERE user_id=? AND notice_version=?', b, NOTICE_VERSION))
            return false; const other = await one('SELECT profile,completed FROM users WHERE id=?', b); if (!other?.completed || !mine.completed)
            return false; return !(await one('SELECT 1 FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)', a, b, b, a)); }
        async function matched(other: string) { if (!await allowed(me, other))
            return false; return !!(await one("SELECT 1 FROM likes a JOIN likes b ON a.sender=b.recipient AND a.recipient=b.sender WHERE a.sender=? AND a.recipient=? AND a.kind='like' AND b.kind='like'", me, other)); }
        async function publicUser(row: any) { let p = JSON.parse(row.profile); delete p.showDemo; delete p.researchConsent; delete p.acceptNotice; delete p.soughtGender; const photos = await all("SELECT id,mime,name FROM uploads WHERE owner=? AND scope='profile' ORDER BY created ASC", row.id); return { ...p, intentions: intentions(p), id: row.id, media: photos.map((f: any) => ({ ...f, url: '/api/files/' + f.id })), ...rank(myProfile, p) }; }
        if (path[0] === 'me' && method === 'GET')
            return json({ id: me, profile: myProfile, completed: !!mine.completed, isAdmin: admin, adminConfigured: !!adminSetting, recommendations: 'criteria', privacy: { noticeVersion: NOTICE_VERSION, noticeAccepted, researchOptIn: !!privacy?.research_opt_in, acceptedAt: privacy?.accepted_at || null } });
        if (path[0] === 'privacy' && path[1] === 'accept' && method === 'POST') {
            const body = await getBody();
            if (body.acceptNotice !== true || body.noticeVersion !== NOTICE_VERSION)
                return json({ error: 'Подтверди ознакомление с использованием данных для работы сервиса' }, 400);
            if (!noticeAccepted) {
                const now = Date.now();
                await db.batch([q('INSERT INTO privacy_preferences(user_id,notice_version,accepted_at,research_opt_in,updated_at,export_id) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET notice_version=excluded.notice_version,accepted_at=excluded.accepted_at,research_opt_in=0,updated_at=excluded.updated_at,export_id=excluded.export_id', me, NOTICE_VERSION, now, 0, now, uid()), q('INSERT INTO privacy_events(id,user_id,version,research_opt_in,created) VALUES(?,?,?,?,?)', uid(), me, NOTICE_VERSION, 0, now)]);
            }
            return json({ ok: true, privacy: { noticeVersion: NOTICE_VERSION, noticeAccepted: true, researchOptIn: noticeAccepted ? !!privacy?.research_opt_in : false } });
        }
        if (!noticeAccepted && ['discover', 'matches', 'like', 'messages', 'media', 'upload', 'files'].includes(path[0]))
            return json({ error: 'Сначала подтверди обработку данных для работы сервиса', code: 'NOTICE_REQUIRED' }, 403);
        if (path[0] === 'profile' && method === 'POST') {
            const body = await getBody();
            if (body.acceptNotice !== true || body.noticeVersion !== NOTICE_VERSION)
                return json({ error: 'Ознакомься с уведомлением об использовании данных и подтверди согласие' }, 400);
            let p = profile(body);
            const optIn = body.researchConsent === true && p.age >= 18 ? 1 : 0, now = Date.now();
            const exportId = privacy && privacy.research_opt_in === optIn ? privacy.export_id : uid();
            await db.batch([q('UPDATE users SET profile=?,completed=1 WHERE id=?', JSON.stringify(p), me), q('INSERT INTO privacy_preferences(user_id,notice_version,accepted_at,research_opt_in,updated_at,export_id) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET notice_version=excluded.notice_version,accepted_at=excluded.accepted_at,research_opt_in=excluded.research_opt_in,updated_at=excluded.updated_at,export_id=excluded.export_id', me, NOTICE_VERSION, noticeAccepted ? privacy.accepted_at : now, optIn, now, exportId), q('INSERT INTO privacy_events(id,user_id,version,research_opt_in,created) VALUES(?,?,?,?,?)', uid(), me, NOTICE_VERSION, optIn, now)]);
            return json({ ok: true, profile: p, privacy: { noticeVersion: NOTICE_VERSION, noticeAccepted: true, researchOptIn: !!optIn } });
        }
        if (path[0] === 'privacy' && method === 'POST') {
            if (!noticeAccepted)
                return json({ error: 'Сначала ознакомься с уведомлением' }, 400);
            const b = await getBody();
            if (b.researchConsent !== false)
                return json({ error: 'Для включения используй настройки анкеты' }, 400);
            await db.batch([q('UPDATE privacy_preferences SET research_opt_in=0,updated_at=?,export_id=? WHERE user_id=?', Date.now(), uid(), me), q('INSERT INTO privacy_events(id,user_id,version,research_opt_in,created) VALUES(?,?,?,?,?)', uid(), me, NOTICE_VERSION, 0, Date.now())]);
            return json({ ok: true });
        }
        if (path[0] === 'admin' && path[1] === 'project' && method === 'POST') {
            requireAdmin();
            const b = await getBody(), operatorName = cut(b.operatorName, 200), contact = cut(b.contact, 200);
            if (!operatorName || !contact)
                throw new Error('Укажи ответственного за проект и контакт');
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact))
                throw new Error('Укажи контактный email');
            await q("INSERT INTO settings(key,value) VALUES('project_public',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify({ operatorName, contact })).run();
            return json({ ok: true });
        }
        if (path[0] === 'admin' && path[1] === 'research-export' && method === 'POST') {
            requireAdmin();
            const rows = await all('SELECT u.profile,pp.export_id FROM users u JOIN privacy_preferences pp ON pp.user_id=u.id WHERE pp.research_opt_in=1 AND pp.notice_version=? AND u.completed=1', NOTICE_VERSION);
            const records = [];
            for (const row of rows) {
                const p = JSON.parse(row.profile);
                if (p.age < 18)
                    continue;
                const fields: any = {};
                for (const key of ['interests', 'music', 'films', 'books', 'hobbies', 'goal'])
                    fields[key] = cut(p[key], 180);
                records.push({ participant: row.export_id, ...fields });
            }
            await q('INSERT INTO export_audit(id,admin,count,created) VALUES(?,?,?,?)', uid(), me, records.length, Date.now()).run();
            return json({ schemaVersion: 1, noticeVersion: NOTICE_VERSION, generatedAt: new Date().toISOString(), classification: 'pseudonymized-confidential', excluded: ['names', 'contacts', 'age', 'location', 'residence', 'group', 'messages', 'support', 'media', 'relationships'], records });
        }
        if (path[0] === 'discover' && path[1] === 'reset' && method === 'POST') {
            await q("DELETE FROM likes WHERE sender=? AND kind='pass'", me).run();
            return json({ ok: true });
        }
        if (path[0] === 'discover' && method === 'GET') {
            if (!mine.completed)
                return json({ people: [], skippedCount: 0, sentLikesCount: 0 });
            const intent = new URL(r.url).searchParams.get('intent') || 'all';
            if (!['all', 'friendship', 'relationship'].includes(intent))
                return json({ error: 'Неизвестный раздел' }, 400);
            const rows = await all(`SELECT u.id,u.profile FROM users u
   WHERE u.completed=1 AND u.id<>?
   AND EXISTS(SELECT 1 FROM privacy_preferences pp WHERE pp.user_id=u.id AND pp.notice_version=?)
   AND NOT EXISTS(SELECT 1 FROM likes WHERE sender=? AND recipient=u.id)
   AND NOT EXISTS(SELECT 1 FROM blocks WHERE (owner=? AND target=u.id) OR (target=? AND owner=u.id))
   AND (?='all' OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE((u.profile::jsonb)->'intentions', CASE u.profile::jsonb->>'goal' WHEN 'Дружба' THEN '["friendship"]'::jsonb WHEN 'Отношения' THEN '["relationship"]'::jsonb WHEN 'Свидания' THEN '["relationship"]'::jsonb ELSE '["friendship","relationship"]'::jsonb END)) AS intent_value(value) WHERE intent_value.value=?))
   ORDER BY EXISTS(SELECT 1 FROM likes incoming WHERE incoming.sender=u.id AND incoming.recipient=? AND incoming.kind='like') DESC,u.created DESC,u.id
   LIMIT 200`, me, NOTICE_VERSION, me, me, me, intent, intent, me);
            let people = [];
            for (const row of rows)
                people.push(await publicUser(row));
            // Keep incoming likes first; use compatibility only inside each priority group.
            const incoming = await all("SELECT sender FROM likes WHERE recipient=? AND kind='like'", me);
            const likedYou = new Set(incoming.map((x: any) => x.sender));
            people.sort((a, b) => Number(likedYou.has(b.id)) - Number(likedYou.has(a.id)) || b.score - a.score);
            const counts = await one("SELECT SUM(CASE WHEN kind='pass' THEN 1 ELSE 0 END) AS skipped,SUM(CASE WHEN kind='like' THEN 1 ELSE 0 END) AS sent FROM likes WHERE sender=?", me);
            return json({ people, skippedCount: counts?.skipped || 0, sentLikesCount: counts?.sent || 0 });
        }
        if (path[0] === 'like' && method === 'POST') {
            let b = await getBody(), target = cut(b.target, 100), kind = b.like ? 'like' : 'pass';
            if (!await allowed(me, target))
                return json({ error: 'Анкета недоступна' }, 403);
            await q('INSERT INTO likes(sender,recipient,kind,created) VALUES(?,?,?,?) ON CONFLICT(sender,recipient) DO UPDATE SET kind=excluded.kind', me, target, kind, Date.now()).run();
            return json({ match: kind === 'like' && await matched(target) });
        }
        if (path[0] === 'matches' && method === 'GET') {
            const rows = await all("SELECT u.id,u.profile FROM users u JOIN likes a ON a.recipient=u.id AND a.sender=? JOIN likes b ON b.sender=u.id AND b.recipient=? WHERE a.kind='like' AND b.kind='like'", me, me);
            let matches = [];
            for (const row of rows) {
                if (await matched(row.id)) {
                    let u = await publicUser(row);
                    const last = await one('SELECT body,created FROM messages WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?) ORDER BY created DESC LIMIT 1', me, row.id, row.id, me);
                    matches.push({ ...u, last });
                }
            }
            return json({ matches });
        }
        if (path[0] === 'messages') {
            const other = path[1];
            if (!other || !await matched(other))
                return json({ error: 'Чат доступен после взаимной симпатии' }, 403);
            if (method === 'GET') {
                const rows = await all('SELECT * FROM (SELECT * FROM messages WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?) ORDER BY created DESC LIMIT 200) ORDER BY created ASC', me, other, other, me);
                const result = [];
                for (const x of rows) {
                    const attachments = [];
                    for (const id of JSON.parse(x.attachments)) {
                        const file = await one('SELECT id,name,mime,size FROM uploads WHERE id=?', id);
                        if (file)
                            attachments.push({ ...file, url: '/api/files/' + id });
                    }
                    result.push({ ...x, attachments, mine: x.sender === me });
                }
                return json({ messages: result });
            }
            if (method === 'POST') {
                const b = await getBody(), body = cut(b.text, 2000), ids = Array.isArray(b.attachments) ? b.attachments.slice(0, 10).map((x: any) => cut(x, 100)) : [];
                if (!body && !ids.length)
                    throw new Error('Пустое сообщение');
                for (const id of ids)
                    if (!await one("SELECT id FROM uploads WHERE id=? AND owner=? AND scope='chat'", id, me))
                        return json({ error: 'Недопустимое вложение' }, 403);
                if (await one('SELECT 1 FROM messages WHERE sender=? AND created>? LIMIT 1', me, Date.now() - 800))
                    return json({ error: 'Слишком быстро. Попробуй через секунду.' }, 429);
                await q('INSERT INTO messages(id,sender,recipient,body,attachments,created) VALUES(?,?,?,?,?,?)', uid(), me, other, body, JSON.stringify(ids), Date.now()).run();
                return json({ ok: true });
            }
        }
        if (path[0] === 'media' && method === 'GET')
            return json({ files: (await all("SELECT id,name,mime,size,created FROM uploads WHERE owner=? AND scope='profile' ORDER BY created DESC", me)).map((x: any) => ({ ...x, url: '/api/files/' + x.id })) });
        if (path[0] === 'upload' && method === 'POST') {
            const size = Number(r.headers.get('content-length') || 0);
            if (size > 52 * 1024 * 1024)
                return json({ error: 'Файл слишком большой' }, 413);
            const form = await r.formData(), file = form.get('file'), scope = form.get('scope') === 'chat' ? 'chat' : 'profile';
            if (!(file instanceof File) || !file.size)
                throw new Error('Выбери файл');
            const types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'];
            if (!types.includes(file.type) && !(scope === 'chat' && file.type === 'application/pdf'))
                throw new Error('Этот формат не поддерживается');
            const max = file.type.startsWith('video/') ? 50 : 10;
            if (file.size > max * 1024 * 1024)
                return json({ error: 'Максимум ' + max + ' МБ' }, 413);
            const total = await one('SELECT COALESCE(SUM(size),0) AS n,COUNT(*) AS c FROM uploads WHERE owner=?', me);
            if (Number(total.n) + file.size > 300 * 1024 * 1024 || Number(total.c) >= 100)
                return json({ error: 'Лимит аккаунта: 100 файлов или 300 МБ. Удали лишнее.' }, 413);
            const id = uid(), name = cut(file.name, 150);
            await bucket.put(id, file.stream(), { httpMetadata: { contentType: file.type } });
            try {
                await q('INSERT INTO uploads(id,owner,name,mime,size,scope,created) VALUES(?,?,?,?,?,?,?)', id, me, name, file.type, file.size, scope, Date.now()).run();
            }
            catch (e) {
                await bucket.delete(id);
                throw e;
            }
            return json({ file: { id, name, mime: file.type, size: file.size, url: '/api/files/' + id } });
        }
        if (path[0] === 'files' && path[1]) {
            const file = await one('SELECT * FROM uploads WHERE id=?', path[1]);
            if (!file)
                return json({ error: 'Файл не найден' }, 404);
            let access = file.owner === me;
            if (!access && file.scope === 'profile')
                access = await allowed(me, file.owner);
            if (!access && file.scope === 'chat' && await matched(file.owner)) {
                const rows = await all('SELECT attachments FROM messages WHERE sender=? AND recipient=?', file.owner, me);
                access = rows.some((x: any) => JSON.parse(x.attachments).includes(file.id));
            }
            if (!access)
                return json({ error: 'Нет доступа' }, 403);
            if (method === 'DELETE') {
                if (file.owner !== me)
                    return json({ error: 'Нет доступа' }, 403);
                await bucket.delete(file.id);
                await q('DELETE FROM uploads WHERE id=?', file.id).run();
                return json({ ok: true });
            }
            const object = await bucket.get(file.id, { range: r.headers });
            if (!object)
                return json({ error: 'Файл удалён' }, 404);
            const headers = new Headers({ 'Content-Type': file.mime, 'Cache-Control': 'private, max-age=120', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `${file.mime === 'application/pdf' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.name)}` });
            headers.set('Accept-Ranges', 'bytes');
            if (object.range) {
                const start = object.range.offset || 0, length = object.range.length;
                headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${object.size}`);
                headers.set('Content-Length', String(length));
                return new Response(object.body, { status: 206, headers });
            }
            headers.set('Content-Length', String(object.size));
            return new Response(object.body, { headers });
        }
        if (path[0] === 'block' && method === 'POST') {
            const b = await getBody(), target = cut(b.target, 100);
            if (!target || target === me)
                throw new Error('Некорректный пользователь');
            await q('INSERT OR IGNORE INTO blocks(owner,target) VALUES(?,?)', me, target).run();
            if (b.reason)
                await q('INSERT INTO reports(id,owner,target,reason,created) VALUES(?,?,?,?,?)', uid(), me, target, cut(b.reason, 500), Date.now()).run();
            return json({ ok: true });
        }
        if (path[0] === 'tickets') {
            if (path[1]) {
                const ticket = await one('SELECT * FROM tickets WHERE id=?', path[1]);
                if (!ticket || (!admin && ticket.owner !== me))
                    return json({ error: 'Нет доступа' }, 403);
                if (method === 'GET')
                    return json({ ticket, messages: await all('SELECT id,body,created,sender FROM ticket_messages WHERE ticket=? ORDER BY created ASC', ticket.id) });
                if (method === 'POST') {
                    const b = await getBody(), body = cut(b.text, 3000);
                    if (!body)
                        throw new Error('Напиши сообщение');
                    await db.batch([q('INSERT INTO ticket_messages(id,ticket,sender,body,created) VALUES(?,?,?,?,?)', uid(), ticket.id, me, body, Date.now()), q('UPDATE tickets SET updated=?,status=? WHERE id=?', Date.now(), admin ? 'answered' : 'open', ticket.id)]);
                    return json({ ok: true });
                }
                if (method === 'DELETE') {
                    requireAdmin();
                    await q("UPDATE tickets SET status='closed',updated=? WHERE id=?", Date.now(), ticket.id).run();
                    return json({ ok: true });
                }
            }
            if (method === 'GET')
                return json({ tickets: admin ? await all('SELECT t.*,u.email FROM tickets t JOIN users u ON t.owner=u.id ORDER BY updated DESC LIMIT 100') : await all('SELECT * FROM tickets WHERE owner=? ORDER BY updated DESC LIMIT 100', me) });
            if (method === 'POST') {
                const b = await getBody(), body = cut(b.text, 3000), subject = cut(b.subject, 100) || 'Ошибка на сайте';
                if (!body)
                    throw new Error('Опиши проблему');
                if (await one('SELECT 1 FROM tickets WHERE owner=? AND created>?', me, Date.now() - 30000))
                    return json({ error: 'Обращение уже отправлено. Подожди 30 секунд.' }, 429);
                const id = uid();
                await db.batch([q('INSERT INTO tickets(id,owner,subject,created,updated) VALUES(?,?,?,?,?)', id, me, subject, Date.now(), Date.now()), q('INSERT INTO ticket_messages(id,ticket,sender,body,created) VALUES(?,?,?,?,?)', uid(), id, me, body, Date.now())]);
                return json({ id });
            }
        }
        if (path[0] === 'admin' && path[1] === 'claim' && method === 'POST') {
            if (adminSetting)
                return json({ error: 'Администратор уже настроен' }, 409);
            const b = await getBody(), expected = process.env.ADMIN_SETUP_TOKEN;
            if (!expected || b.token !== expected)
                return json({ error: 'Неверный код владельца' }, 403);
            await q("INSERT OR IGNORE INTO settings(key,value) VALUES('admin_user',?)", me).run();
            const actual = await one("SELECT value FROM settings WHERE key='admin_user'");
            return json({ ok: actual.value === me });
        }
        if (path[0] === 'admin' && path[1] === 'users' && path.length === 2 && method === 'GET') {
            requireAdmin();
            const url = new URL(r.url), search = cut(url.searchParams.get('q'), 100), page = Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1)), limit = 20;
            const where = search ? "WHERE u.email LIKE ? OR u.id LIKE ? OR u.profile LIKE ?" : '';
            const args = search ? Array(3).fill('%' + search.replace(/[\\%_]/g, '\\$&') + '%') : [];
            const total = (await one(`SELECT COUNT(*) AS n FROM users u ${where}`, ...args)).n;
            const rows = await all(`SELECT u.id,u.email,u.profile,u.completed,u.created,pp.notice_version,pp.accepted_at,pp.research_opt_in,
    (SELECT COUNT(*) FROM uploads f WHERE f.owner=u.id AND f.scope='profile') AS photos,
    (SELECT COUNT(*) FROM likes l WHERE l.sender=u.id AND l.kind='like') AS likes_sent,
    (SELECT COUNT(*) FROM reports rep WHERE rep.target=u.id) AS reports_received
    FROM users u LEFT JOIN privacy_preferences pp ON pp.user_id=u.id ${where} ORDER BY u.created DESC LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
            return json({ page, limit, total, users: rows.map((u: any) => { let p: any = {}; try {
                    p = JSON.parse(u.profile || '{}');
                }
                catch { } ; return { id: u.id, email: u.email, profile: p, completed: !!u.completed, created: u.created, privacy: { noticeVersion: u.notice_version || null, acceptedAt: u.accepted_at || null, researchOptIn: !!u.research_opt_in }, stats: { photos: u.photos, likesSent: u.likes_sent, reportsReceived: u.reports_received } }; }) });
        }
        if (path[0] === 'admin' && path[1] === 'users' && path[2] && path.length === 3 && method === 'GET') {
            requireAdmin();
            const target = path[2];
            if (target.length > 150)
                return json({ error: 'Некорректный ID' }, 400);
            const u = await one('SELECT id,email,profile,completed,created FROM users WHERE id=?', target);
            if (!u)
                return json({ error: 'Пользователь не найден' }, 404);
            const pp = await one('SELECT notice_version,accepted_at,research_opt_in,updated_at FROM privacy_preferences WHERE user_id=?', target);
            const counts = await one(`SELECT (SELECT COUNT(*) FROM uploads WHERE owner=?) AS uploads,
    (SELECT COUNT(*) FROM likes WHERE sender=? AND kind='like') AS likesSent,
    (SELECT COUNT(*) FROM likes WHERE recipient=? AND kind='like') AS likesReceived,
    (SELECT COUNT(*) FROM reports WHERE target=?) AS reportsReceived,
    (SELECT COUNT(*) FROM reports WHERE owner=?) AS reportsSent,
    (SELECT COUNT(*) FROM tickets WHERE owner=?) AS tickets`, target, target, target, target, target, target);
            const media = await all("SELECT id,name,mime,size,created FROM uploads WHERE owner=? AND scope='profile' ORDER BY created DESC LIMIT 100", target);
            let p: any = {};
            try {
                p = JSON.parse(u.profile || '{}');
            }
            catch { }
            return json({ user: { id: u.id, email: u.email, profile: p, completed: !!u.completed, created: u.created, privacy: { noticeVersion: pp?.notice_version || null, acceptedAt: pp?.accepted_at || null, researchOptIn: !!pp?.research_opt_in, updatedAt: pp?.updated_at || null }, stats: counts, media: media.map((f: any) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, created: f.created })) } });
        }
        // Password verification metadata is deliberately fetched separately and owner-only.
        // Never return session cookies, salts, password reset tokens or recovery hashes.
        if (path[0] === 'admin' && path[1] === 'users' && path[2] && path[3] === 'password-hash' && method === 'GET') {
            requireAdmin();
            const target = path[2];
            if (target.length > 150) return json({ error: 'Некорректный ID' }, 400);
            const credential = await one('SELECT length(password_hash) AS hashLength, created FROM credentials WHERE user_id=?', target);
            if (!credential) return json({ error: 'У этого аккаунта нет локального пароля' }, 404);
            return json({ hasPassword: credential.hashLength > 0, hashLength: credential.hashLength, algorithm: 'scrypt', created: credential.created });
        }
        // Owner-only, read-only chat audit. Both participants must have accepted the updated notice.
        if (path[0] === 'admin' && path[1] === 'chats' && method === 'GET') {
            requireAdmin();
            const target = cut(path[2], 150), partner = cut(path[3], 150);
            if (!target || !await one('SELECT 1 FROM users WHERE id=?', target))
                return json({ error: 'Пользователь не найден' }, 404);
            if (!partner) {
                const rows = await all(`SELECT u.id,u.email,u.profile,COUNT(*) AS total,MAX(m.created) AS lastAt
   FROM messages m JOIN users u ON u.id=CASE WHEN m.sender=? THEN m.recipient ELSE m.sender END
   JOIN privacy_preferences p1 ON p1.user_id=? AND p1.notice_version=?
   JOIN privacy_preferences p2 ON p2.user_id=u.id AND p2.notice_version=?
   WHERE (m.sender=? OR m.recipient=?) GROUP BY u.id,u.email,u.profile ORDER BY lastAt DESC LIMIT 100`, target, target, NOTICE_VERSION, NOTICE_VERSION, target, target);
                return json({ chats: rows.map((x: any) => { let p: any = {}; try {
                        p = JSON.parse(x.profile);
                    }
                    catch { } return { id: x.id, email: x.email, name: p.name || 'Без имени', total: x.total, lastAt: x.lastAt }; }) });
            }
            if (partner === target)
                return json({ error: 'Некорректный диалог' }, 400);
            const accepted = await one(`SELECT COUNT(*) AS n FROM privacy_preferences WHERE user_id IN (?,?) AND notice_version=?`, target, partner, NOTICE_VERSION);
            if (accepted?.n !== 2)
                return json({ error: 'Оба участника должны подтвердить обновлённое уведомление' }, 403);
            const dialog = await one('SELECT 1 FROM messages WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?) LIMIT 1', target, partner, partner, target);
            if (!dialog)
                return json({ error: 'Диалог не найден' }, 404);
            const url = new URL(r.url);
            const before = Math.max(0, Number(url.searchParams.get('before')) || Date.now() + 1);
            const rows = await all('SELECT id,sender,recipient,body,attachments,created FROM messages WHERE ((sender=? AND recipient=?) OR (sender=? AND recipient=?)) AND created<? ORDER BY created DESC LIMIT 100', target, partner, partner, target, before);
            // Record access BEFORE returning message contents. Never return credential or session secrets.
            await q('INSERT INTO admin_chat_audit(id,admin,participant_a,participant_b,viewed_at,message_count) VALUES(?,?,?,?,?,?)', uid(), me, target, partner, Date.now(), rows.length).run();
            return json({ messages: rows.reverse() });
        }
        if (path[0] === 'admin' && path[1] === 'overview' && method === 'GET') {
            requireAdmin();
            return json({ users: (await one('SELECT COUNT(*) AS n FROM users')).n, profiles: (await one('SELECT COUNT(*) AS n FROM users WHERE completed=1')).n, messages: (await one('SELECT COUNT(*) AS n FROM messages')).n, reports: await all('SELECT id,owner,target,reason,created FROM reports ORDER BY created DESC LIMIT 100'), openTickets: (await one("SELECT COUNT(*) AS n FROM tickets WHERE status='open'")).n });
        }
        if (path[0] === 'account' && method === 'DELETE') {
            const files = await all('SELECT id FROM uploads WHERE owner=?', me);
            for (const f of files)
                await bucket.delete(f.id);
            const ts = await all('SELECT id FROM tickets WHERE owner=?', me);
            await db.batch([...ts.map((t: any) => q('DELETE FROM ticket_messages WHERE ticket=?', t.id)), q('DELETE FROM tickets WHERE owner=?', me), q('DELETE FROM messages WHERE sender=? OR recipient=?', me, me), q('DELETE FROM likes WHERE sender=? OR recipient=?', me, me), q('DELETE FROM blocks WHERE owner=? OR target=?', me, me), q('DELETE FROM uploads WHERE owner=?', me), q('DELETE FROM privacy_preferences WHERE user_id=?', me), q('DELETE FROM privacy_events WHERE user_id=?', me), q('DELETE FROM sessions WHERE user_id=?', me), q('DELETE FROM credentials WHERE user_id=?', me), q('DELETE FROM users WHERE id=?', me)]);
            return json({ ok: true });
        }
        return json({ error: 'Не найдено' }, 404);
    }
    catch (e: any) {
        console.error('API failure', e?.message);
        return json({ error: e.status ? e.message : e instanceof SyntaxError ? 'Некорректный запрос' : e.message?.startsWith('D1_') ? 'Ошибка базы данных. Попробуй позже.' : e.message || 'Ошибка сервера' }, e.status || 400);
    }
}
