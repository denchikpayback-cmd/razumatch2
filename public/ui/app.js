const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let discoveryState = { skippedCount: 0, sentLikesCount: 0 };
let swipeBusy = false;
let me = null, view = 'discover', people = [], matchList = [], activeChat = null, activeTicket = null, drafts = [], uploadBusy = false, loading = false, albumTab = 'all', requestVersion = 0, lastMessages = '';
const iconPaths = { discover: '<path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8Z"/>', messages: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0Z"/><path d="M7 9h9M7 13h6"/>', profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>', support: '<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12H2v6h4v-6Zm16 0h2v6h-4v-6ZM20 18c0 3-3 4-6 4"/>', clip: '<path d="m8 13 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7L13 2"/>', send: '<path d="m3 11 18-8-8 18-2-8-8-2Zm8 2L21 3"/>', back: '<path d="m14 5-7 7 7 7M7 12h14"/>', plus: '<path d="M12 5v14M5 12h14"/>', heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>', image: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/>', file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8M8 17h5"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>', more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>' };
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.plus}</svg>`; }
let discoverIntent = 'all', discoverGender = 'all', attachmentScope = 'chat', pendingFiles = [], attachmentProgress = 0, chatSearch = '';
const chatTextDrafts = {};
function profileIntentions(p) { return Array.isArray(p.intentions) && p.intentions.length ? p.intentions : p.goal === 'Дружба' ? ['friendship'] : ['Свидания', 'Отношения'].includes(p.goal) ? ['relationship'] : ['friendship', 'relationship']; }
function intentionBadges(p) { return `<div class="intention-badges">${profileIntentions(p).map(v => v === 'friendship' ? '<span class="intent-badge friendship">Дружба</span>' : '<span class="intent-badge relationship">Отношения</span>').join('')}</div>`; }
function discoveryQuery() { const params = new URLSearchParams(); if (discoverIntent !== 'all') params.set('intent', discoverIntent); if (discoverGender !== 'all') params.set('gender', discoverGender); return 'discover' + (params.size ? '?' + params.toString() : ''); }
function discoveryTabs() { return `<div class="discovery-top"><div><span class="eyebrow">ТВОЙ УНИВЕРСИТЕТ · ТВОИ ЛЮДИ</span><h1>Знакомиться проще.</h1></div><button class="icon-button" onclick="go('discover')" aria-label="Обновить анкеты">↻</button></div><div class="discovery-filter-label">Кого ищем</div><div class="intent-tabs discovery-genders" role="group" aria-label="Фильтр по полу">${[['all', 'Всех'], ['male', 'Парней'], ['female', 'Девушек']].map(([v,t]) => `<button type="button" aria-pressed="${discoverGender === v}" class="${discoverGender === v ? 'selected' : ''}" onclick="setDiscoverGender('${v}')">${t}</button>`).join('')}</div><div class="discovery-filter-label">Цель знакомства</div><div class="intent-tabs" role="group" aria-label="Цель знакомства">${[['all', 'Все'], ['friendship', 'Дружба'], ['relationship', 'Отношения']].map(([v, t]) => `<button type="button" aria-pressed="${discoverIntent === v}" class="${discoverIntent === v ? 'selected' : ''}" onclick="setDiscoverIntent('${v}')">${t}</button>`).join('')}</div>`; } 
async function setDiscoverGender(value) { discoverGender = value; await go('discover'); }
async function setDiscoverIntent(value) { discoverIntent = value; await go('discover'); }
function avatarMarkup(p) { const f = p.media?.find(x => x.mime?.startsWith('image/')); return f ? `<img class="avatar-image" src="${f.url}" alt="">` : `<span class="avatar-letter">${esc((p.name || '?')[0])}</span>`; }
const faculties = ['Пищевых технологий и биоинженерии', 'Биотехнологий и рыбного хозяйства', 'Цифровых технологий', 'Дизайна', 'Социально-гуманитарных технологий', 'Хореографии', 'Экономики и управления', 'Юридический'];
async function api(path, method = 'GET', data) { const res = await fetch('/api/' + path, { method, credentials: 'same-origin', headers: data instanceof FormData ? {} : data ? { 'Content-Type': 'application/json' } : {}, body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined }); let out; try {
    out = await res.json();
}
catch {
    throw new Error('Сервер недоступен. Попробуй позже.');
} if (!res.ok) {
    if (res.status === 401)
        showLogin();
    if (out.code === 'NOTICE_REQUIRED' && me) {
        me.privacy = { ...me.privacy, noticeAccepted: false };
        $('#app').innerHTML = privacyNotice();
    }
    throw Object.assign(new Error(out.error || 'Ошибка запроса'), { status: res.status, code: out.code });
} return out; }
function toast(t) { $('#toast').textContent = t; $('#toast').style.display = 'block'; clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => $('#toast').style.display = 'none', 4000); }
function modal(html) { $('#modal').innerHTML = `<div class="overlay"><section class="dialog" role="dialog" aria-modal="true">${html}</section></div>`; $('#modal button,#modal input')?.focus(); }
function closeModal() { if (uploadBusy)
    return toast('Дождись загрузки файлов'); releasePendingFiles(); $('#modal').innerHTML = ''; }
function toggleTheme() { const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; try {
    localStorage.setItem('razumatch-theme', next);
}
catch { } }
function heading(title) { return `<div class="heading"><h1>${title}</h1></div>`; }
function empty(text, extra = '') { return `<div class="empty"><h2>${text}</h2>${extra}</div>`; }
const residences = [['', 'Не указывать'], ['klinskaya', 'Клинская, 8Б'], ['orenburgskaya', 'Оренбургская, 20, корп. 3'], ['narodnogo', 'Народного Ополчения'], ['none', 'Ни в одном из них']];
function residenceOptions(value = '') { return residences.map(([id, label]) => `<option value="${id}" ${id === value ? 'selected' : ''}>${label}</option>`).join(''); }
function residenceLabel(id) { return residences.find(x => x[0] === id)?.[1] || ''; }
function options(list, value) { return list.map(x => `<option ${x === value ? 'selected' : ''}>${esc(x)}</option>`).join(''); }
function nav() { if (!me)
    return; $('#nav').innerHTML = [['discover', 'Люди'], ['messages', 'Чаты'], ['profile', 'Профиль'], ['support', 'Поддержка']].map(([v, t]) => `<button class="${view === v ? 'active' : ''}" aria-current="${view === v ? 'page' : 'false'}" onclick="go('${v}')">${icon(v)}<span>${t}</span></button>`).join(''); }
async function boot() { try {
    me = await api('me');
    const exit = $('#logout-button');
    if (exit)
        exit.hidden = false;
    await go('discover');
}
catch (e) {
    if (e.status === 401) {
        showLogin();
        return;
    }
    if (me)
        toast(e.message);
    else
        $('#app').innerHTML = empty('Не удалось подключиться', `<p>${esc(e.message)}</p><button class="primary" onclick="boot()">Повторить</button>`);
} }
function showLogin() { renderAuth('login'); }
async function go(v) { if (loading && activeChat)
    return toast('Дождись отправки сообщения'); if (uploadBusy)
    return toast('Дождись загрузки файлов'); await clearDrafts(); if (!me)
    return showLogin(); if (activeChat && $('#message'))
    chatTextDrafts[activeChat] = $('#message').value; view = v; activeChat = null; activeTicket = null; drafts = []; nav(); document.body.dataset.view = v; const id = ++requestVersion; if (v !== 'support' && !me.privacy?.noticeAccepted) {
    $('#app').innerHTML = privacyNotice();
    return;
} if (v === 'discover' && !me.completed) {
    $('#app').innerHTML = registrationNotice();
    return;
} $('#app').innerHTML = '<div class="empty">Загрузка…</div>'; try {
    if (v === 'discover') {
        const out = await api(discoveryQuery());
        if (id !== requestVersion)
            return;
        people = out.people;
        discoveryState = { skippedCount: out.skippedCount || 0, sentLikesCount: out.sentLikesCount || 0 };
        if (out.needsNotice) {
            $('#app').innerHTML = privacyNotice();
            return;
        }
        renderDiscover();
    }
    else if (v === 'profile')
        await renderProfile();
    else if (v === 'messages') {
        const out = await api('matches');
        if (id !== requestVersion)
            return;
        matchList = out.matches;
        renderMatches();
    }
    else
        await renderSupport();
}
catch (e) {
    if (!me) {
        showLogin();
        return;
    }
    if (id === requestVersion && !me?.privacy?.noticeAccepted && v !== 'support') {
        $('#app').innerHTML = privacyNotice();
        return;
    }
    if (id === requestVersion)
        $('#app').innerHTML = e.code === 'PROFILE_INCOMPLETE' ? empty('Дополни анкету', `<p>${esc(e.message)}</p><button class="primary" onclick="go('profile')">Перейти в профиль</button>`) : empty('Не получилось загрузить', `<p>${esc(e.message)}</p><button class="secondary" onclick="go('${v}')">Повторить</button>`);
} }
function privacyNotice() { return `<section class="registration-notice privacy-gate" role="region" aria-labelledby="privacy-gate-title"><span class="notice-icon" aria-hidden="true">○</span><h2 id="privacy-gate-title">Перед началом</h2><p>Анкеты теперь доступны в общей выдаче участникам от 16 лет, без разделения на до и после 18 лет.</p><p>Для знакомств мы обрабатываем данные аккаунта, анкету, симпатии и сообщения. Анкета и фото видны зарегистрированным участникам.</p><p><a href="/ui/privacy.html" target="_blank" rel="noopener">Как используются данные</a></p><form onsubmit="acceptServiceData(event)"><label class="checkline"><input type="checkbox" name="acceptNotice" required><span>Я ознакомился(ась) с уведомлением и согласен(на) на обработку данных для работы сервиса.</span></label><button class="primary" type="submit">Подтвердить и продолжить</button></form><p class="smallmuted">Без подтверждения знакомства, сообщения и загрузки недоступны. Использование данных для исследований ИИ — отдельный добровольный выбор в анкете.</p><div class="privacy-gate-links"><button class="report" onclick="go('support')">Поддержка</button><button class="report" onclick="logoutSite()">Выйти</button><button class="report" onclick="deleteAccount()">Удалить аккаунт</button></div></section>`; }
async function acceptServiceData(e) { e.preventDefault(); if (loading)
    return; loading = true; const button = e.target.querySelector('button[type=submit]'); if (button)
    button.disabled = true; try {
    const out = await api('privacy/accept', 'POST', { acceptNotice: !!e.target.elements.acceptNotice.checked, noticeVersion: me.privacy?.noticeVersion || '2026-10-27-v4' });
    me.privacy = out.privacy;
    await go(me.completed ? 'discover' : 'profile');
}
catch (err) {
    toast(err.message);
    if (button)
        button.disabled = false;
}
finally {
    loading = false;
} }
async function withdrawResearch() { try {
    await api('privacy', 'POST', { researchConsent: false });
    me.privacy.researchOptIn = false;
    toast('Согласие отозвано. Будущие выгрузки исключат твои данные.');
    await renderProfile();
}
catch (e) {
    toast(e.message);
} }
function registrationNotice() { return `<section class="registration-notice" role="status"><span class="notice-icon" aria-hidden="true">○</span><h2>Заполни анкету</h2><p>Укажи имя, возраст и пол, выбери цель знакомств и добавь хотя бы одно фото.</p><button class="primary" onclick="go('profile')">Заполнить анкету</button></section>`; }
function renderDiscover() { const p = people[0]; if (!p) {
    $('#app').innerHTML = discoveryTabs() + empty('Здесь скоро будут свои люди', `<div class="empty-art">${icon('discover')}</div><p>Новые анкеты появятся здесь автоматически.</p><div class="discovery-empty-actions"><button class="primary" onclick="go('discover')">Обновить</button>${discoveryState.skippedCount ? '<button class="secondary" onclick="resetSkipped()">Посмотреть пропущенные</button>' : ''}</div>${discoveryState.sentLikesCount ? `<p class="smallmuted">Симпатий отправлено: ${discoveryState.sentLikesCount}</p>` : ''}`);
    return;
} const photo = p.media?.find(f => f.mime.startsWith('image/')); $('#app').innerHTML = discoveryTabs() + `<section class="stage simple-stage"><article class="card swipe-card" aria-label="Карточка анкеты. Используй кнопки под ней или стрелки клавиатуры"><span class="swipe-stamp like-stamp" aria-hidden="true">НРАВИТСЯ</span><span class="swipe-stamp skip-stamp" aria-hidden="true">ПРОПУСК</span><button class="profile-photo" onclick="showPerson()" aria-label="Открыть анкету ${esc(p.name)}">${photo ? `<img src="${photo.url}" alt="${esc(p.name)}">` : `<div class="photo-placeholder">${esc(p.name[0])}</div>`}<span class="photo-caption">${esc(p.faculty || 'МГУТУ')} · ${esc(p.course)}</span></button><div class="cardbody"><div class="personhead"><h2>${esc(p.name)}<span class="person-age">, ${p.age}</span></h2><button class="icon-button" onclick="report('${p.id}')" aria-label="Пожаловаться">${icon('more')}</button></div>${intentionBadges(p)}${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ''}<div class="tags">${(p.interests || '').split(',').filter(Boolean).slice(0, 5).map(t => `<span>${esc(t.trim())}</span>`).join('')}</div><button class="text-button" onclick="showPerson()">Об анкете ↗</button></div></article><div class="laptop-swipe-actions" aria-label="Оценить анкету"><button type="button" class="laptop-swipe-button laptop-skip" onclick="decideSwipe(false)" aria-label="Пропустить анкету"><span class="laptop-action-icon">✕</span><span>Пропустить</span><kbd>←</kbd></button><button type="button" class="laptop-swipe-button laptop-like" onclick="decideSwipe(true)" aria-label="Нравится анкета"><span class="laptop-action-icon">♥</span><span>Нравится</span><kbd>→</kbd></button></div><p class="discovery-hint">Нажми кнопку под анкетой или используй клавиши ← и →.</p></section>`; const card = $('.swipe-card'); if (card) bindSwipeCard(card); }
function bindSwipeCard(card) {
    let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false, dragged = false, pointerId = null, suppressClick = false;
    card.addEventListener('pointerdown', e => {
        if (swipeBusy || loading || e.pointerType === 'mouse' || e.target.closest('.icon-button, a, input, textarea, select, video, button:not(.profile-photo)')) return;
        pointerId = e.pointerId; startX = e.clientX; startY = e.clientY; dx = 0; dy = 0; dragging = true; dragged = false;
        card.classList.add('is-dragging');
    });
    card.addEventListener('pointermove', e => {
        if (!dragging || e.pointerId !== pointerId) return;
        dx = e.clientX - startX; dy = e.clientY - startY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
            dragged = true; suppressClick = true;
            card.style.transform = 'translate3d(' + dx + 'px,' + (dy * 0.12) + 'px,0) rotate(' + (dx / 20) + 'deg)';
            card.classList.toggle('swipe-like-active', dx > 0);
            card.classList.toggle('swipe-skip-active', dx < 0);
            if (e.cancelable) e.preventDefault();
        }
    });
    card.addEventListener('pointerup', e => {
        if (!dragging || e.pointerId !== pointerId) return;
        dragging = false; card.classList.remove('is-dragging');
        if (card.hasPointerCapture(e.pointerId)) card.releasePointerCapture(e.pointerId);
        if (dragged && Math.abs(dx) >= 95 && Math.abs(dx) > Math.abs(dy)) {
            card.style.transform = ''; decideSwipe(dx > 0);
        } else {
            card.style.transform = ''; card.classList.remove('swipe-like-active', 'swipe-skip-active');
        }
        if (suppressClick) setTimeout(() => { suppressClick = false; }, 450);
    });
    const cancel = e => { if (!dragging || (pointerId !== null && e.pointerId !== pointerId)) return; dragging = false; card.classList.remove('is-dragging', 'swipe-like-active', 'swipe-skip-active'); card.style.transform = ''; if (card.hasPointerCapture(e.pointerId)) card.releasePointerCapture(e.pointerId); };
    card.addEventListener('pointercancel', cancel);
    card.addEventListener('click', e => { if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; } }, true);
}
async function decideSwipe(yes) {
    if (swipeBusy || loading || !people.length || view !== 'discover' || $('#modal').innerHTML) return;
    const card = $('.swipe-card'); if (!card) return;
    swipeBusy = true;
    card.classList.add('is-changing');
    try {
        await new Promise(resolve => setTimeout(resolve, 115));
        await like(yes);
    } finally {
        swipeBusy = false;
    }
}
document.addEventListener('keydown', e => {
    if (view !== 'discover' || swipeBusy || loading || $('#modal').innerHTML || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); decideSwipe(e.key === 'ArrowRight'); }
});

async function resetSkipped() { if (loading)
    return; loading = true; try {
    await api('discover/reset', 'POST', {});
    await go('discover');
    toast('Пропущенные анкеты снова доступны');
}
catch (e) {
    toast(e.message);
}
finally {
    loading = false;
} }
async function refreshEmptyDiscovery() { if (!me?.completed || !me.privacy?.noticeAccepted || view !== 'discover' || people.length || loading || uploadBusy || document.hidden || $('#modal').innerHTML)
    return; const version = requestVersion; try {
    const out = await api(discoveryQuery());
    if (version !== requestVersion || view !== 'discover' || people.length || $('#modal').innerHTML || !me)
        return;
    const counts = { skippedCount: out.skippedCount || 0, sentLikesCount: out.sentLikesCount || 0 };
    if (out.people.length || JSON.stringify(counts) !== JSON.stringify(discoveryState)) {
        people = out.people;
        discoveryState = counts;
        renderDiscover();
    }
}
catch { } }
function showPerson() { const p = people[0]; if (!p)
    return; modal(`<h2>${esc(p.name)}, ${p.age}</h2>${intentionBadges(p)}${['bio', 'residence', 'music', 'films', 'books', 'hobbies', 'weekend', 'communication', 'values', 'lookingFor'].filter(k => p[k]).map(k => `<p><b>${({ bio: 'О себе', residence: 'Где живу', music: 'Музыка', films: 'Фильмы', books: 'Книги', hobbies: 'Увлечения', weekend: 'Выходные', communication: 'Общение', values: 'Ценности', lookingFor: 'Ищу' })[k]}</b><br>${esc(k === 'residence' ? residenceLabel(p[k]) : p[k])}</p>`).join('')}<div class="person-gallery">${(p.media || []).map(mediaPreview).join('')}</div><button class="secondary" onclick="closeModal()">Закрыть</button>`); }
async function like(yes) { if (loading || !people.length)
    return; const p = people[0]; loading = true; try {
    const out = await api('like', 'POST', { target: p.id, like: yes });
    if (out.match)
        modal(`<h2>Симпатия взаимна</h2><p>${esc(p.name)} тоже поставил(а) лайк.</p><button class="primary" onclick="closeModal();go('messages')">Написать</button><button class="secondary" onclick="closeModal()">Дальше</button>`);
    if (yes) {
        discoveryState.sentLikesCount++;
        if (!out.match)
            toast('Симпатия отправлена. Ждём взаимного лайка.');
    }
    else
        discoveryState.skippedCount++;
    people.shift();
    renderDiscover();
}
catch (e) {
    toast(e.message);
    renderDiscover();
}
finally {
    loading = false;
} }
function mediaPreview(f) { const url = f.url || '/api/files/' + f.id; return f.mime?.startsWith('image/') ? `<img src="${url}" alt="${esc(f.name)}" loading="lazy">` : f.mime?.startsWith('video/') ? `<video src="${url}" controls playsinline preload="metadata"></video>` : `<a class="download-file" href="${url}" download>${esc(f.name || 'Вложение')}</a>`; }
async function renderProfile() { const p = me.profile || {}; $('#app').innerHTML = heading('Моя анкета') + `<button class="profile-upload-prompt" onclick="openAttachmentPicker('profile')">${icon('image')}<span><b>Добавить фото *</b><small>Для публикации анкеты нужно хотя бы одно фото. Видео необязательно.</small></span>${icon('plus')}</button><form class="form" onsubmit="saveProfile(event)"><div class="formgrid"><label>Имя *<input name="name" value="${esc(p.name)}" maxlength="40" required></label><label>Возраст *<input name="age" oninput="syncResearchAge(this.value)" value="${esc(p.age)}" type="number" min="16" max="99" required></label><label>Факультет<select name="faculty">${options(['', ...faculties], p.faculty)}</select></label><label>Курс<select name="course">${options(['1 курс', '2 курс', '3 курс', '4 курс', 'Магистратура', 'Аспирантура', 'Выпускник'], p.course)}</select></label><fieldset class="intention-choices wide"><legend>Хочу найти</legend>${[['friendship', 'Дружбу'], ['relationship', 'Отношения']].map(([v, t]) => `<label class="intent-choice ${v}"><input type="checkbox" name="intentions" value="${v}" ${profileIntentions(p).includes(v) ? 'checked' : ''}><span>${v === 'friendship' ? '✦' : '♡'} ${t}</span></label>`).join('')}<small>Можно выбрать оба варианта</small></fieldset><label>Пол *<select name="gender" required>${options(['', 'Женский', 'Мужской'], p.gender)}</select></label><label class="wide">О себе<textarea name="bio" maxlength="500" placeholder="Пара слов о тебе">${esc(p.bio)}</textarea></label><label class="wide">Интересы<input name="interests" value="${esc(p.interests)}" maxlength="180" placeholder="Кофе, кино, прогулки"></label></div><details class="extra-profile"><summary>Больше обо мне <span>необязательно</span></summary><div class="formgrid"><label class="wide">Где живёшь <span class="smallmuted">необязательно</span><select name="residence">${residenceOptions(p.residence)}</select></label>${[['music', 'Любимая музыка', 'Исполнители и жанры'], ['films', 'Любимые фильмы и сериалы', 'Названия через запятую'], ['books', 'Книги', 'Любимые книги'], ['hobbies', 'Увлечения', 'Чем любишь заниматься'], ['weekend', 'Идеальные выходные', 'Куда хочется пойти'], ['communication', 'Стиль общения', 'Переписка, звонки, встречи'], ['values', 'Что для тебя важно', 'Юмор, честность, забота'], ['lookingFor', 'С кем хочется познакомиться', 'Какие люди тебе интересны'], ['city', 'Город / район', 'Без точного адреса'], ['surname', 'Фамилия', 'Необязательно'], ['group', 'Группа', 'Необязательно']].map(([k, t, ph]) => `<label>${t}<input name="${k}" value="${esc(p[k])}" maxlength="180" placeholder="${ph}"></label>`).join('')}</div><p class="smallmuted">Эти ответы учитываются в подборе и видны в анкете.</p></details><section class="privacy-settings"><h3>Твои данные</h3><p>Анкета и фото видны другим зарегистрированным пользователям. Данные хранятся для работы знакомств, сообщений и поддержки. <a href="/ui/privacy.html" target="_blank" rel="noopener">Подробнее об использовании данных</a></p><label class="checkline"><input type="checkbox" name="acceptNotice" required ${me.privacy?.noticeAccepted ? 'checked' : ''}><span>Я ознакомился(ась) с уведомлением и согласен(на) на обработку данных для работы сервиса.</span></label>${Number(p.age || 18) >= 18 ? `<label class="checkline"><input type="checkbox" name="researchConsent" ${me.privacy?.researchOptIn ? 'checked' : ''}><span>Разрешаю использовать интересы, музыку, фильмы, книги, увлечения и цель знакомства без имени и контактов для анализа и разработки будущих ИИ-рекомендаций. Только с 18 лет; необязательно.</span></label>` : '<p>Участие в исследованиях доступно с 18 лет.</p>'}<small>Отказ не влияет на знакомства. Переписки, фото, видео, контакты, группа и общежитие в исследовательскую выгрузку не входят.</small>${me.privacy?.researchOptIn ? '<button type="button" class="report" onclick="withdrawResearch()">Отозвать согласие на исследования</button>' : ''}</section><button class="primary">Сохранить</button><button type="button" class="report" onclick="deleteAccount()">Удалить аккаунт</button></form><section class="album" id="album">Загрузка фото и видео…</section>`; await loadAlbum(); }
function syncResearchAge(age) { const input = document.querySelector('input[name=researchConsent]'); if (input) {
    input.disabled = Number(age) < 18;
    if (input.disabled)
        input.checked = false;
} }
async function saveProfile(e) { e.preventDefault(); if (loading)
    return; let p = Object.fromEntries(new FormData(e.target)); if (!['Мужской', 'Женский'].includes(p.gender)) return toast('Выбери свой пол'); loading = true; p.intentions = new FormData(e.target).getAll('intentions'); if (!p.intentions.length) {
    loading = false;
    return toast('Выбери дружбу, отношения или оба варианта');
} p.acceptNotice = !!e.target.elements.acceptNotice.checked; p.noticeVersion = me.privacy?.noticeVersion || '2026-10-27-v4'; p.researchConsent = !!e.target.elements.researchConsent?.checked; try {
    const out = await api('profile', 'POST', p);
    me.profile = out.profile;
    me.completed = true;
    me.privacy = out.privacy;
    toast('Анкета сохранена');
}
catch (e) {
    toast(e.message);
}
finally {
    loading = false;
} }
async function loadAlbum() { const root = $('#album'); if (!root)
    return; try {
    const { files } = await api('media');
    if (root !== $('#album'))
        return;
    const selected = files.filter(f => albumTab === 'all' || f.mime.startsWith(albumTab + '/'));
    root.innerHTML = `<div class="album-heading"><div><span class="eyebrow">ТВОИ МОМЕНТЫ</span><h2>Фото и видео <span>${files.length}</span></h2></div><button class="secondary" onclick="openAttachmentPicker('profile')">${icon('plus')} Добавить</button></div><div class="album-tabs">${[['all', 'Все'], ['image', 'Фото'], ['video', 'Видео']].map(([k, t]) => `<button class="${albumTab === k ? 'selected' : ''}" onclick="albumTab='${k}';loadAlbum()">${t}</button>`).join('')}</div><div class="media-grid"><button class="media-add-tile" onclick="openAttachmentPicker('profile')">${icon('plus')}<span>Добавить</span></button>${selected.map(f => `<article class="media-tile"><div class="media-thumb">${mediaPreview(f)}</div><button class="media-delete" onclick="deleteFile('${f.id}')" aria-label="Удалить ${esc(f.name)}">${icon('close')}</button></article>`).join('')}</div><button class="dropzone" id="media-drop" onclick="openAttachmentPicker('profile')">Выбрать или перетащить фото и видео<small>Фото до 10 МБ · видео до 50 МБ</small></button><p class="smallmuted">Первое фото — главное.</p>`;
    bindFileDrop($('#media-drop'), 'profile');
}
catch (e) {
    root.innerHTML = `<p>${esc(e.message)}</p><button class="secondary" onclick="loadAlbum()">Повторить</button>`;
} }
function addFiles(list, scope) { selectAttachments(list, scope); }
function deleteFile(id) { modal(`<h2>Удалить файл?</h2><button class="primary" onclick="performDeleteFile('${id}')">Удалить</button><button class="secondary" onclick="closeModal()">Отмена</button>`); }
async function performDeleteFile(id) { try {
    await api('files/' + id, 'DELETE');
    closeModal();
    loadAlbum();
}
catch (e) {
    toast(e.message);
} }
function renderMatches() { matchList.sort((a, b) => (b.last?.created || 0) - (a.last?.created || 0)); $('#app').innerHTML = heading('Сообщения') + `<div class="messenger-layout"><section class="conversation-list"><div class="conversation-title">Чаты <span>${matchList.length}</span></div><label class="chat-search">${icon('search')}<input id="chat-search" placeholder="Поиск по чатам" aria-label="Поиск по чатам" value="${esc(chatSearch)}" oninput="chatSearch=this.value;renderConversationList()"></label><div id="conversation-rows"></div></section><section class="chat-placeholder">${icon('messages')}<h2>Твои разговоры — здесь</h2><p>Выбери чат и скажи «привет».</p></section></div>`; renderConversationList(); }
async function openChat(id) { if (id === activeChat && $('#message'))
    return; if (loading)
    return toast('Дождись отправки сообщения'); if (uploadBusy)
    return toast('Дождись загрузки файлов'); if (activeChat && $('#message'))
    chatTextDrafts[activeChat] = $('#message').value; await clearDrafts(); activeChat = id; activeTicket = null; drafts = []; lastMessages = ''; const p = matchList.find(x => x.id === id); if (!p)
    return; view = 'messages'; nav(); $('#app').innerHTML = heading('Сообщения') + `<div class="messenger-layout in-conversation"><section class="conversation-list"><div class="conversation-title">Чаты <span>${matchList.length}</span></div><label class="chat-search">${icon('search')}<input id="chat-search" placeholder="Поиск по чатам" aria-label="Поиск по чатам" value="${esc(chatSearch)}" oninput="chatSearch=this.value;renderConversationList()"></label><div id="conversation-rows"></div></section><section class="chat direct-chat"><div class="chat-header"><button class="icon-button chat-back" onclick="go('messages')" aria-label="Все чаты">${icon('back')}</button><span class="chat-avatar">${avatarMarkup(p)}</span><div class="chat-person"><h2>${esc(p.name)}</h2>${intentionBadges(p)}</div><button class="icon-button" onclick="report('${id}')" aria-label="Пожаловаться или заблокировать">${icon('more')}</button></div><div id="bubbles" class="bubbles" role="log" aria-label="Переписка"></div><div id="attachment-drafts" class="attachment-drafts"></div><form class="composer" onsubmit="send(event)"><button type="button" class="attach-btn" onclick="attachmentMenu()" aria-label="Прикрепить фото, видео или файл">${icon('clip')}</button><textarea id="message" aria-label="Сообщение" maxlength="2000" rows="1" placeholder="Написать сообщение…" oninput="resizeComposer();syncSendButton()" onkeydown="composeKey(event)">${esc(chatTextDrafts[id] || '')}</textarea><button class="send-button" type="submit" aria-label="Отправить сообщение">${icon('send')}</button></form></section></div>`; renderConversationList(); resizeComposer(); syncSendButton(); bindFileDrop($('.direct-chat'), 'chat'); $('#message').onpaste = e => { const files = Array.from(e.clipboardData?.files || []); if (files.length) {
    e.preventDefault();
    selectAttachments(files, 'chat');
} }; await loadMessages(); }
async function loadMessages() { const id = activeChat; if (!id)
    return; try {
    const { messages } = await api('messages/' + id);
    if (id !== activeChat || !$('#bubbles'))
        return;
    const serialized = JSON.stringify(messages);
    if (serialized === lastMessages)
        return;
    const first = !lastMessages;
    lastMessages = serialized;
    const root = $('#bubbles'), nearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 100;
    let date = '';
    root.innerHTML = messages.length ? messages.map(m => { const day = new Date(m.created).toLocaleDateString('ru', { day: 'numeric', month: 'long' }); const separator = day !== date ? `<div class="chat-date"><span>${day}</span></div>` : ''; date = day; return separator + `<div class="bubble ${m.mine ? 'mine' : ''}">${m.attachments.length ? `<div class="message-media">${m.attachments.map(f => mediaPreview(typeof f === 'object' ? f : { id: f, url: '/api/files/' + f })).join('')}</div>` : ''}${m.body ? `<div class="message-text">${esc(m.body)}</div>` : ''}<small class="message-time">${new Date(m.created).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}${m.mine ? '<span aria-label="Отправлено"> ✓</span>' : ''}</small></div>`; }).join('') : `<div class="chat-start">${icon('messages')}<b>Уже есть что-то общее</b><p>Начни с простого «привет».</p></div>`;
    if (first || nearBottom)
        root.scrollTop = root.scrollHeight;
}
catch (e) {
    if (id === activeChat && $('#bubbles') && !lastMessages) {
        $('#bubbles').innerHTML = '<div class="chat-start"><b>Не удалось загрузить переписку</b><p>' + esc(e.message) + '</p><button type="button" class="secondary" onclick="loadMessages()">Повторить</button></div>';
    }
    toast(e.message);
} }
async function clearDrafts() { const ids = drafts.map(f => f.id); drafts = []; await Promise.allSettled(ids.map(id => api('files/' + id, 'DELETE'))); }
function renderDrafts() { const root = $('#attachment-drafts'); if (!root)
    return; root.innerHTML = drafts.map(f => `<div class="draft-file">${f.mime?.startsWith('image/') ? `<img src="${f.url}" alt="${esc(f.name)}">` : f.mime?.startsWith('video/') ? '<span class="file-kind">Видео</span>' : icon('file')}<span>${esc(f.name)}</span><button type="button" onclick="removeDraft('${f.id}')" aria-label="Убрать вложение">${icon('close')}</button></div>`).join(''); syncSendButton(); }
async function removeDraft(id) { try {
    await api('files/' + id, 'DELETE');
    drafts = drafts.filter(f => f.id !== id);
    renderDrafts();
}
catch (e) {
    toast(e.message);
} }
async function send(e) { e.preventDefault(); if (loading || uploadBusy)
    return; const input = $('#message'), id = activeChat, text = input.value.trim(); if (!text && !drafts.length)
    return; loading = true; syncSendButton(); try {
    await api('messages/' + id, 'POST', { text, attachments: drafts.map(f => f.id) });
    chatTextDrafts[id] = '';
    if (id !== activeChat)
        return;
    input.value = '';
    drafts = [];
    renderDrafts();
    resizeComposer();
    await loadMessages();
    const root = $('#bubbles');
    if (root)
        root.scrollTop = root.scrollHeight;
    const p = matchList.find(x => x.id === id);
    if (p)
        p.last = { body: text || 'Вложение', created: Date.now() };
    renderConversationList();
}
catch (e) {
    toast(e.message);
}
finally {
    loading = false;
    syncSendButton();
} }
function report(id) { modal(`<h2>Пожаловаться</h2><textarea id="reason" maxlength="500" placeholder="Что случилось?"></textarea><button class="primary" onclick="blockUser('${id}',true)">Отправить и скрыть</button><button class="secondary" onclick="blockUser('${id}',false)">Заблокировать</button><button class="report" onclick="closeModal()">Отмена</button>`); }
async function blockUser(id, report) { try {
    await api('block', 'POST', { target: id, reason: report ? $('#reason').value || 'Жалоба пользователя' : '' });
    closeModal();
    await go(view);
}
catch (e) {
    toast(e.message);
} }
const statusLabel = s => ({ open: 'Новое', answered: 'Есть ответ', closed: 'Закрыто' }[s] || s);
async function renderSupport() { const { tickets } = await api('tickets'); if (view !== 'support')
    return; $('#app').innerHTML = heading(me.isAdmin ? 'Поддержка · кабинет владельца' : 'Поддержка') + `<div class="support-intro"><p>Нашёл ошибку или есть идея? Напиши нам.</p><button class="primary" onclick="newTicket()">＋ Написать</button>${me.isAdmin ? '<button class="secondary" onclick="adminUsers()">Пользователи</button><button class="secondary" onclick="adminStats()">Статистика и жалобы</button><button class="secondary" onclick="exportResearch()">Данные для рекомендаций</button><button class="secondary" onclick="launchSettings()">Контакты проекта</button>' : ''}</div>${tickets.length ? tickets.map(t => `<button class="matchrow" onclick="openTicket('${t.id}')"><span><b>${esc(t.subject)}</b><small>${esc(t.email || 'Обращение в поддержку')} · ${new Date(t.updated).toLocaleDateString('ru')}</small></span><span class="ticket-status">${statusLabel(t.status)}</span></button>`).join('') : '<p class="smallmuted">Обращений пока нет</p>'}${!me.adminConfigured ? '<button class="report" onclick="claimAdmin()">Я владелец проекта</button>' : ''}`; }
function newTicket() { modal(`<h2>Написать в поддержку</h2><form onsubmit="createTicket(event)"><input name="subject" maxlength="100" placeholder="Тема" required><textarea name="text" maxlength="3000" placeholder="Что случилось? Как повторить ошибку?" required></textarea><button class="primary">Отправить</button><button type="button" class="secondary" onclick="closeModal()">Отмена</button></form>`); }
async function createTicket(e) { e.preventDefault(); if (loading)
    return; loading = true; try {
    const data = Object.fromEntries(new FormData(e.target));
    data.text += '\n\nСтраница: ' + view + '\nБраузер: ' + navigator.userAgent.slice(0, 250);
    const out = await api('tickets', 'POST', data);
    closeModal();
    await openTicket(out.id);
}
catch (e) {
    toast(e.message);
}
finally {
    loading = false;
} }
async function openTicket(id) { activeTicket = id; const { ticket } = await api('tickets/' + id); if (activeTicket !== id)
    return; $('#app').innerHTML = heading(esc(ticket.subject)) + `<section class="chat"><button class="back" onclick="go('support')">← Все обращения</button><p class="smallmuted">${statusLabel(ticket.status)}</p><div id="ticket-bubbles" class="bubbles"></div><form class="composer" onsubmit="replyTicket(event)"><input id="ticket-message" maxlength="3000" placeholder="Сообщение в поддержку…" required><button class="primary">Отправить</button></form>${me.isAdmin ? `<button class="report" onclick="closeTicket('${id}')">Закрыть обращение</button>` : ''}</section>`; await loadTicket(); }
async function loadTicket() { const id = activeTicket; if (!id)
    return; try {
    const out = await api('tickets/' + id);
    if (id !== activeTicket || !$('#ticket-bubbles'))
        return;
    const root = $('#ticket-bubbles'), html = out.messages.map(m => `<div class="bubble ${m.sender === me.id ? 'mine' : ''}"><small class="message-time">${m.sender === out.ticket.owner ? 'Пользователь' : 'Поддержка'}</small>${esc(m.body)}</div>`).join('');
    if (root.innerHTML !== html) {
        root.innerHTML = html;
        root.scrollTop = root.scrollHeight;
    }
}
catch (e) {
    toast(e.message);
} }
async function replyTicket(e) { e.preventDefault(); if (loading)
    return; loading = true; try {
    await api('tickets/' + activeTicket, 'POST', { text: $('#ticket-message').value });
    $('#ticket-message').value = '';
    await loadTicket();
}
catch (e) {
    toast(e.message);
}
finally {
    loading = false;
} }
async function closeTicket(id) { try {
    await api('tickets/' + id, 'DELETE');
    await go('support');
}
catch (e) {
    toast(e.message);
} }
function claimAdmin() { modal(`<h2>Кабинет владельца</h2><form onsubmit="claim(event)"><input type="password" name="token" placeholder="Код владельца" required autocomplete="off"><button class="primary">Подключить</button><button class="secondary" type="button" onclick="closeModal()">Отмена</button></form>`); }
async function claim(e) { e.preventDefault(); try {
    await api('admin/claim', 'POST', { token: e.target.elements.token.value });
    me = await api('me');
    closeModal();
    await go('support');
    toast('Кабинет владельца подключён');
}
catch (e) {
    toast(e.message);
} }
let adminUsersPage = 1, adminUsersQuery = '';
const adminDate = value => value ? new Date(value).toLocaleString('ru') : '—';
const adminField = (key, value) => `<div class="admin-data-item"><span>${esc(key)}</span><strong>${esc(value === undefined || value === null || value === '' ? '—' : Array.isArray(value) ? value.join(', ') : String(value))}</strong></div>`;
function adminNavigation(active) {
    return `<nav class="admin-nav" aria-label="Разделы администратора"><button class="${active === 'users' ? 'selected' : ''}" onclick="adminUsers(1)">👥 Пользователи</button><button class="${active === 'stats' ? 'selected' : ''}" onclick="adminStats()">📊 Статистика</button><button onclick="go('support')">✉️ Поддержка</button></nav>`;
}
async function adminUsers(page = 1) { view = 'adminusers'; adminUsersPage = page; try {
    const out = await api('admin/users?page=' + page + '&q=' + encodeURIComponent(adminUsersQuery));
    const table = out.users.map(u => `<button class="admin-user-row" onclick="adminUserDetail('${esc(u.id)}')"><span class="admin-user-avatar">${esc((u.profile.name || u.email || '?').slice(0, 1).toUpperCase())}</span><span class="admin-user-main"><b>${esc([u.profile.name, u.profile.surname].filter(Boolean).join(' ') || 'Без имени')}</b><small>${esc(u.email)}</small><small>${esc(u.profile.faculty || 'Факультет не указан')} · ${esc(u.profile.group || 'Без группы')}</small></span><span class="admin-user-meta"><span class="admin-chip ${u.completed ? 'ok' : ''}">${u.completed ? 'Анкета готова' : 'Не заполнена'}</span><small>${new Date(u.created).toLocaleDateString('ru')}</small></span><span aria-hidden="true">›</span></button>`).join('');
    $('#app').innerHTML = heading('Панель администратора') + `<section class="admin-people admin-console">${adminNavigation('users')}<div class="admin-section-head"><div><h2>Пользователи</h2><p class="smallmuted">Всего аккаунтов: <b>${out.total}</b>. Администратор сайта — только один.</p></div><span class="admin-chip ok">Только владелец</span></div><form onsubmit="adminUserSearch(event)" class="admin-search"><input name="q" value="${esc(adminUsersQuery)}" maxlength="100" placeholder="Поиск: имя, email, ID или группа" aria-label="Поиск пользователей"><button class="primary">Найти</button>${adminUsersQuery ? '<button type="button" class="secondary" onclick="adminResetSearch()">Сброс</button>' : ''}</form><div class="admin-user-list">${table || '<div class="admin-empty">Ничего не найдено. Попробуй изменить запрос.</div>'}</div><div class="admin-pagination"><button class="secondary" ${page === 1 ? 'disabled' : ''} onclick="adminUsers(${page - 1})">← Назад</button><span>Страница ${page} / ${Math.max(1, Math.ceil(out.total / out.limit))}</span><button class="secondary" ${page * out.limit >= out.total ? 'disabled' : ''} onclick="adminUsers(${page + 1})">Далее →</button></div></section>`;
} catch (e) { toast(e.message); } }
function adminResetSearch() { adminUsersQuery = ""; adminUsers(1); }
function adminUserSearch(e) { e.preventDefault(); adminUsersQuery = e.target.elements.q.value.trim(); adminUsers(1); }
async function adminUserDetail(id) { try {
    const { user: u } = await api('admin/users/' + encodeURIComponent(id));
    if (!u || !u.id) throw new Error('Сервер не вернул карточку пользователя. Проверь версию API.');
    const p = u.profile || {}; 
    const fields = [['Имя', p.name], ['Фамилия', p.surname], ['Возраст', p.age], ['Факультет', p.faculty], ['Курс', p.course], ['Группа', p.group], ['Город', p.city], ['Общежитие', p.residence], ['Пол', p.gender], ['Цель', p.goal], ['О себе', p.bio], ['Интересы', p.interests], ['Музыка', p.music], ['Фильмы', p.films], ['Книги', p.books], ['Хобби', p.hobbies], ['Ценности', p.values], ['Общение', p.communication], ['Выходные', p.weekend]];
    const stats = {uploads:'Файлы',likesSent:'Лайки отправлены',likesReceived:'Лайки получены',reportsReceived:'Жалобы на участника',reportsSent:'Жалобы участника',tickets:'Обращения'};
    view = 'adminuser';
    $('#app').innerHTML = heading('Карточка пользователя') + `<section class="admin-people admin-console">${adminNavigation('users')}<button class="secondary" onclick="adminUsers(adminUsersPage)">← К списку</button><div class="admin-profile-top"><div class="admin-user-avatar large">${esc((p.name || u.email || '?').slice(0,1).toUpperCase())}</div><div><h2>${esc([p.name,p.surname].filter(Boolean).join(' ') || 'Без имени')}</h2><p>${esc(u.email)}</p><span class="admin-chip ${u.completed ? 'ok' : ''}">${u.completed ? 'Анкета заполнена' : 'Не заполнена'}</span></div></div><div class="admin-actions"><button class="primary" onclick="adminUserChats('${esc(u.id)}')">Диалоги</button><button class="secondary" onclick="adminRevealHash('${esc(u.id)}')">Проверить защиту пароля</button></div><div id="admin-password" class="admin-password-box" hidden></div><h3>Учётная запись</h3><div class="admin-detail-grid">${adminField('Email',u.email)}${adminField('ID',u.id)}${adminField('Регистрация',adminDate(u.created))}</div><h3>Анкета</h3><div class="admin-detail-grid">${fields.map(([k,v])=>adminField(k,v)).join('')}</div><h3>Согласия и приватность</h3><div class="admin-detail-grid">${adminField('Версия уведомления',u.privacy.noticeVersion)}${adminField('Принято',adminDate(u.privacy.acceptedAt))}${adminField('Согласие на исследования',u.privacy.researchOptIn?'Да':'Нет')}</div><h3>Активность</h3><div class="admin-detail-grid">${Object.entries(u.stats).map(([k,v])=>adminField(stats[k]||k,v)).join('')}</div><p class="smallmuted">Пароли в открытом виде и действующие сессии не отображаются. Просмотр диалогов фиксируется в журнале.</p></section>`;
} catch (e) { toast(e.message); } }
async function adminRevealHash(id) { try {
    const data = await api('admin/users/' + encodeURIComponent(id) + '/password-hash');
    const box = $('#admin-password'); if (!box) return;
    box.hidden = false;
    box.innerHTML = `<h3>Безопасность пароля</h3><div class="admin-detail-grid">${adminField('Пароль',data.hasPassword ? 'Установлен' : 'Не установлен')}${adminField('Алгоритм',data.algorithm || 'Неизвестен')}${adminField('Длина хэша',data.hashLength ?? '—')}${adminField('Создан',adminDate(data.created))}</div><p class="smallmuted">Полный хэш, соль и токены восстановления не отправляются браузеру.</p><button class="secondary" onclick="this.closest('.admin-password-box').hidden=true">Скрыть</button>`;
} catch (e) { toast(e.message); } }
async function adminUserChats(id) { try {
    const out = await api('admin/chats/' + encodeURIComponent(id));
    view = 'adminchats';
    $('#app').innerHTML = heading('Диалоги участника') + `<section class="admin-people"><p class="smallmuted">Только чтение. Доступ фиксируется в журнале. Диалоги доступны, когда оба участника подтвердили актуальное уведомление.</p>${out.chats.map(c => `<button class="matchrow" onclick="adminReadChat('${esc(id)}','${esc(c.id)}')"><span><b>${esc(c.name)}</b><small>${esc(c.email)} · ${c.total} сообщений</small></span><span class="ticket-status">${new Date(c.lastAt).toLocaleDateString('ru')}</span></button>`).join('') || '<p class="smallmuted">Нет доступных диалогов</p>'}<button class="secondary" onclick="adminUserDetail('${esc(id)}')">← К участнику</button></section>`;
}
catch (e) {
    toast(e.message);
} }
async function adminReadChat(id, partner, before = 0) { try {
    const out = await api('admin/chats/' + encodeURIComponent(id) + '/' + encodeURIComponent(partner) + (before ? '?before=' + before : ''));
    view = 'adminchat';
    const list = out.messages.map(m => `<div class="admin-chat-message"><small>${esc(m.sender === id ? 'Выбранный участник' : 'Собеседник')} · ${new Date(m.created).toLocaleString('ru')}</small><p>${esc(m.body || '[Вложение]')}</p></div>`).join('');
    $('#app').innerHTML = heading('Просмотр переписки') + `<section class="admin-people"><p class="smallmuted">Режим только для чтения · просмотр зарегистрирован в журнале</p>${list || '<p>Нет сообщений</p>'}${out.messages.length === 100 ? `<button class="secondary" onclick="adminReadChat('${esc(id)}','${esc(partner)}',${out.messages[0].created})">Более ранние сообщения</button>` : ''}<button class="secondary" onclick="adminUserChats('${esc(id)}')">← К диалогам</button></section>`;
}
catch (e) {
    toast(e.message);
} }
async function adminStats() { try {
    const out = await api('admin/overview');
    modal(`<h2>Проект</h2><p>Аккаунтов: ${out.users}<br>Анкет: ${out.profiles}<br>Сообщений: ${out.messages}<br>Новых обращений: ${out.openTickets}</p><h3>Жалобы</h3>${out.reports.length ? out.reports.map(r => `<p>${esc(r.reason)}<br><small>${esc(r.target)}</small></p>`).join('') : '<p>Пока нет</p>'}<button class="secondary" onclick="closeModal()">Закрыть</button>`);
}
catch (e) {
    toast(e.message);
} }
async function launchSettings() { try {
    const config = await api('project');
    modal(`<h2>Контакты проекта</h2><p>Эти сведения увидят пользователи в уведомлении об использовании данных.</p><form onsubmit="saveProjectContacts(event)"><label>Ответственный / оператор<input name="operatorName" value="${esc(config.operatorName)}" maxlength="200" placeholder="ФИО или название организации" required></label><label>Контактный email<input name="contact" type="email" value="${esc(config.contact)}" maxlength="200" required></label><button class="primary">Сохранить</button><button type="button" class="secondary" onclick="closeModal()">Отмена</button></form>`);
}
catch (e) {
    toast(e.message);
} }
async function saveProjectContacts(e) { e.preventDefault(); try {
    await api('admin/project', 'POST', Object.fromEntries(new FormData(e.target)));
    closeModal();
    toast('Контакты опубликованы в уведомлении');
}
catch (e) {
    toast(e.message);
} }
function exportResearch() { modal(`<h2>Исследовательская выгрузка</h2><p>Только пользователи 18+, которые отдельно согласились. Файл содержит псевдонимы и выбранные интересы, без переписок и контактов. Он конфиденциален.</p><p>Выгрузка регистрируется в журнале. Не передавай файл третьим лицам без отдельного основания и уведомления пользователей.</p><button class="primary" onclick="downloadResearch()">Скачать JSON</button><button class="secondary" onclick="closeModal()">Отмена</button>`); }
async function downloadResearch() { try {
    const data = await api('admin/research-export', 'POST', {});
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url;
    a.download = 'razumatch-research-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    closeModal();
    toast('Выгружено записей: ' + data.records.length);
}
catch (e) {
    toast(e.message);
} }
function deleteAccount() { modal(`<h2>Удалить аккаунт?</h2><p>Анкета, медиа и переписки будут удалены.</p><button class="primary" onclick="performDeleteAccount()">Удалить</button><button class="secondary" onclick="closeModal()">Отмена</button>`); }
async function performDeleteAccount() { try {
    await api('account', 'DELETE');
    await logoutSite();
}
catch (e) {
    toast(e.message);
} }
function info() { modal(`<h2>разуMATCH</h2><p>Независимый студенческий проект. Анкеты и сообщения хранятся на сервере. Учёба в МГУТУ пока не проверяется.</p><p>Подбор учитывает общие интересы и цели. ИИ-модель пока не подключена.</p><p>Об ошибках пиши в «Поддержку». Не публикуй документы и точный адрес. <a href="/ui/privacy.html" target="_blank" rel="noopener">Как используются данные</a></p><button class="secondary" onclick="closeModal()">Закрыть</button>`); }
async function refreshConversations() { if (!me || view !== 'messages' || !me.privacy?.noticeAccepted || document.hidden)
    return; const version = requestVersion; try {
    const { matches } = await api('matches');
    if (version !== requestVersion || view !== 'messages')
        return;
    if (JSON.stringify(matches) === JSON.stringify(matchList))
        return;
    matchList = matches;
    matchList.sort((a, b) => (b.last?.created || 0) - (a.last?.created || 0));
    renderConversationList();
    const count = $('.conversation-title span');
    if (count)
        count.textContent = matchList.length;
}
catch { } }
function renderConversationList() { const root = $('#conversation-rows'); if (!root)
    return; const query = chatSearch.trim().toLocaleLowerCase('ru'); const rows = matchList.filter(p => !query || (p.name + ' ' + (p.last?.body || '')).toLocaleLowerCase('ru').includes(query)); root.innerHTML = rows.length ? rows.map(p => `<button class="conversation-row ${activeChat === p.id ? 'selected' : ''}" onclick="openChat('${p.id}')"><span class="chat-avatar">${avatarMarkup(p)}</span><span class="conversation-copy"><b>${esc(p.name)}</b><small>${esc(p.last?.body || 'Вы понравились друг другу')}</small></span><span class="conversation-time">${p.last?.created ? new Date(p.last.created).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) : '♡'}</span></button>`).join('') : `<div class="conversation-empty">${query ? 'Ничего не найдено' : 'Чаты появятся после взаимного лайка'}${!query ? '<button class="text-button" onclick="go(\'discover\')">Найти своих →</button>' : ''}</div>`; }
function resizeComposer() { const input = $('#message'); if (!input)
    return; input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight || 24, 132) + 'px'; if (activeChat)
    chatTextDrafts[activeChat] = input.value; }
function syncSendButton() { const button = $('.send-button'); if (button)
    button.disabled = loading || uploadBusy || (!$('#message')?.value.trim() && !drafts.length); }
function composeKey(e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !window.matchMedia?.('(pointer: coarse)').matches) {
    e.preventDefault();
    send(e);
} }
function bindFileDrop(zone, scope) { if (!zone)
    return; zone.ondragover = e => { e.preventDefault(); zone.classList.add('dragging'); }; zone.ondragleave = () => zone.classList.remove('dragging'); zone.ondrop = e => { e.preventDefault(); zone.classList.remove('dragging'); selectAttachments(e.dataTransfer.files, scope); }; }
function attachmentMenu() { if (uploadBusy)
    return; modal(`<div class="sheet-title"><h2>Прикрепить</h2><button class="icon-button" onclick="closeModal()" aria-label="Закрыть">${icon('close')}</button></div><div class="attachment-options"><button onclick="openAttachmentPicker('chat','media')"><span class="attachment-option-icon">${icon('image')}</span><span><b>Фото или видео</b><small>Из галереи устройства</small></span></button><button onclick="openAttachmentPicker('chat','file')"><span class="attachment-option-icon file">${icon('file')}</span><span><b>Файл</b><small>Фото, видео или PDF</small></span></button></div>`); }
function openAttachmentPicker(scope, kind = 'media') { if (uploadBusy)
    return toast('Дождись загрузки файлов'); attachmentScope = scope; const input = $('#attachment-picker'); input.accept = kind === 'file' ? 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf' : 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime'; input.click(); }
function releasePendingFiles() { for (const p of pendingFiles)
    if (p.preview)
        URL.revokeObjectURL(p.preview); pendingFiles = []; }
function selectAttachments(list, scope) { if (uploadBusy)
    return toast('Дождись загрузки файлов'); const files = Array.from(list || []); if (!files.length)
    return; if (pendingFiles.length && attachmentScope !== scope)
    releasePendingFiles(); attachmentScope = scope; const existing = scope === 'chat' ? drafts.length : 0; if (files.length + pendingFiles.length + existing > 10)
    return toast('Можно прикрепить до 10 файлов за раз'); const types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', ...(scope === 'chat' ? ['application/pdf'] : [])]; const accepted = []; let error = ''; for (let file of files) {
    if (!file.type) {
        const ext = file.name.split('.').pop().toLowerCase(), mime = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', pdf: 'application/pdf' })[ext];
        if (mime)
            file = new File([file], file.name, { type: mime });
    }
    if (!types.includes(file.type)) {
        error = 'Поддерживаются JPG, PNG, WebP, GIF, MP4, WebM, MOV' + (scope === 'chat' ? ' и PDF' : '');
        continue;
    }
    if (!file.size || file.size > (file.type.startsWith('video/') ? 50 : 10) * 1024 * 1024) {
        error = file.type.startsWith('video/') ? 'Видео — до 50 МБ' : 'Фото и документы — до 10 МБ';
        continue;
    }
    accepted.push({ file, preview: file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : '', error: '' });
} pendingFiles.push(...accepted); if (error)
    toast(error); if (pendingFiles.length)
    renderAttachmentSheet(); }
function renderAttachmentSheet() { const scope = attachmentScope; modal(`<div class="sheet-title"><div><span class="eyebrow">${scope === 'chat' ? 'К СООБЩЕНИЮ' : 'В ТВОЙ ПРОФИЛЬ'}</span><h2>Фото, видео и моменты</h2></div><button class="icon-button" onclick="closeModal()" aria-label="Закрыть" ${uploadBusy ? 'disabled' : ''}>${icon('close')}</button></div><div class="attachment-preview-grid">${pendingFiles.map((p, i) => `<div class="attachment-preview">${p.file.type.startsWith('image/') ? `<img src="${p.preview}" alt="${esc(p.file.name)}">` : p.file.type.startsWith('video/') ? `<video src="${p.preview}" muted playsinline preload="metadata"></video><span class="video-label">Видео</span>` : `<div class="pdf-preview">${icon('file')}<span>PDF</span></div>`}<button onclick="removePendingFile(${i})" aria-label="Убрать ${esc(p.file.name)}" ${uploadBusy ? 'disabled' : ''}>${icon('close')}</button><small>${esc(p.file.name)}</small>${p.error ? `<span class="upload-error">${esc(p.error)}</span>` : ''}</div>`).join('')}<button class="preview-add" onclick="openAttachmentPicker('${scope}')" ${uploadBusy ? 'disabled' : ''}>${icon('plus')}<span>Ещё</span></button></div><div class="upload-progress-wrap" ${uploadBusy ? '' : 'hidden'}><progress id="upload-progress" max="100" value="${attachmentProgress}"></progress><p id="upload-progress-label" role="status">Загрузка…</p></div><p class="smallmuted">${scope === 'chat' ? 'После прикрепления можно добавить сообщение.' : 'Фото и видео появятся в твоей анкете.'}</p><button class="primary attachment-confirm" onclick="uploadSelection()" ${uploadBusy ? 'disabled' : ''}>${uploadBusy ? 'Загружаем…' : scope === 'chat' ? 'Прикрепить' : 'Опубликовать'}${uploadBusy ? '' : ' · ' + pendingFiles.length}</button>`); }
function removePendingFile(index) { if (uploadBusy)
    return; const [p] = pendingFiles.splice(index, 1); if (p?.preview)
    URL.revokeObjectURL(p.preview); if (pendingFiles.length)
    renderAttachmentSheet();
else
    closeModal(); }
function uploadFile(file, scope, onProgress) { return new Promise((resolve, reject) => { const request = new XMLHttpRequest(); request.open('POST', '/api/upload'); request.withCredentials = true; request.upload.onprogress = e => { if (e.lengthComputable)
    onProgress(e.loaded / e.total); }; request.onerror = () => reject(new Error('Соединение прервалось. Попробуй ещё раз.')); request.ontimeout = () => reject(new Error('Загрузка заняла слишком много времени. Попробуй ещё раз.')); request.timeout = 180000; request.onload = () => { let out; try {
    out = JSON.parse(request.responseText);
}
catch {
    return reject(new Error('Сервер не ответил. Попробуй ещё раз.'));
} if (request.status < 200 || request.status >= 300)
    return reject(new Error(out.error || 'Не удалось загрузить файл')); resolve(out.file); }; const form = new FormData(); form.append('file', file); form.append('scope', scope); request.send(form); }); }
async function uploadSelection() { if (uploadBusy || !pendingFiles.length)
    return; const scope = attachmentScope, selected = [...pendingFiles]; uploadBusy = true; attachmentProgress = 0; renderAttachmentSheet(); syncSendButton(); let uploaded = 0; for (let i = 0; i < selected.length; i++) {
    const p = selected[i];
    try {
        p.error = '';
        const file = await uploadFile(p.file, scope, fraction => { attachmentProgress = Math.round((i + fraction) / selected.length * 100); const progress = $('#upload-progress'), label = $('#upload-progress-label'); if (progress)
            progress.value = attachmentProgress; if (label)
            label.textContent = `Загрузка ${i + 1} из ${selected.length} · ${attachmentProgress}%`; });
        if (scope === 'chat')
            drafts.push(file);
        if (p.preview)
            URL.revokeObjectURL(p.preview);
        pendingFiles = pendingFiles.filter(x => x !== p);
        uploaded++;
    }
    catch (e) {
        p.error = e.message;
    }
} uploadBusy = false; if (scope === 'profile')
    await loadAlbum();
else
    renderDrafts(); if (pendingFiles.length) {
    renderAttachmentSheet();
    toast('Не всё загрузилось. Можно повторить.');
}
else {
    closeModal();
    toast(scope === 'chat' ? 'Вложения готовы к отправке' : 'Добавлено в профиль');
    if (scope === 'chat')
        $('#message')?.focus();
} syncSendButton(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape')
    closeModal(); });
setInterval(() => { if (document.hidden)
    return; if (activeChat)
    loadMessages(); if (view === 'messages')
    refreshConversations(); if (activeTicket)
    loadTicket(); }, 4000);
setInterval(() => { if (me?.isAdmin && view === 'support' && !activeTicket && !document.hidden && !$('#modal').innerHTML)
    renderSupport().catch(() => { }); }, 15000);
setInterval(refreshEmptyDiscovery, 8000);
boot();
