// Binary files live in IndexedDB; profile and chat metadata stay in localStorage.
const drafts = {}, chatText = {}, mediaURLs = new Map();
let albumTab = 'all', uploadBusy = false, dbPromise;
function mediaDB() { if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => { const r = indexedDB.open('razumatch-media', 1); r.onupgradeneeded = () => { const s = r.result.createObjectStore('files', { keyPath: 'id' }); s.createIndex('scope', 'scope'); }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); return dbPromise; }
async function dbOp(mode, run) { const db = await mediaDB(); return new Promise((resolve, reject) => { const tx = db.transaction('files', mode); let req; try {
    req = run(tx.objectStore('files'));
}
catch (e) {
    reject(e);
    return;
} tx.oncomplete = () => resolve(req?.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('storage aborted')); }); }
function fileKind(file) { return file.type.startsWith('image/') ? 'photo' : file.type.startsWith('video/') ? 'video' : 'file'; }
function validateMedia(file, scope) { const kind = fileKind(file); if (scope === 'profile' && !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'].includes(file.type))
    return 'Для профиля выбери JPG, PNG, WebP, GIF, MP4, WebM или MOV'; const limit = kind === 'video' ? 50 : kind === 'photo' ? 10 : 20; if (file.size > limit * 1024 * 1024)
    return `«${file.name}»: максимум ${limit} МБ`; if (!file.size)
    return `«${file.name}»: файл пуст`; return ''; }
function mediaURL(file) { if (!mediaURLs.has(file.id))
    mediaURLs.set(file.id, URL.createObjectURL(file.blob)); return mediaURLs.get(file.id); }
function releaseMedia(id) { if (mediaURLs.has(id)) {
    URL.revokeObjectURL(mediaURLs.get(id));
    mediaURLs.delete(id);
} }
function prettySize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.ceil(n / 1024) + ' КБ'; }
function mediaPreview(file, controls = true) { const url = mediaURL(file), name = esc(file.name); if (file.kind === 'photo')
    return `<img src="${url}" alt="${name}" loading="lazy">`; if (file.kind === 'video')
    return `<video src="${url}" ${controls ? 'controls' : ''} playsinline preload="metadata" aria-label="${name}"></video>`; return `<a class="download-file" href="${url}" download="${name}"><span>↧</span><b>${name}</b><small>${prettySize(file.size)} · Скачать</small></a>`; }
async function addFiles(list, scope, chat) { if (uploadBusy)
    return toast('Предыдущие файлы ещё добавляются'); const files = Array.from(list || []); if (!files.length)
    return; if (files.length > 10)
    return toast('Можно добавить до 10 файлов за один раз'); if (scope === 'chat' && (drafts[chat] || []).length + files.length > 10)
    return toast('В одном сообщении — до 10 вложений'); uploadBusy = true; const target = scope === 'profile' ? $('#album-status') : $('#attachment-drafts'); if (target)
    target.textContent = 'Добавляем файлы…'; let added = 0, errors = []; try {
    for (const file of files) {
        const error = validateMedia(file, scope);
        if (error) {
            errors.push(error);
            continue;
        }
        const record = { id: crypto.randomUUID(), scope, name: file.name, size: file.size, type: file.type, kind: fileKind(file), created: Date.now(), blob: file };
        await dbOp('readwrite', s => s.put(record));
        if (scope === 'chat')
            (drafts[chat] ||= []).push(record.id);
        added++;
    }
}
catch (e) {
    errors.push('Не удалось сохранить файл. Возможно, на устройстве недостаточно места.');
}
finally {
    uploadBusy = false;
    if (scope === 'profile')
        await loadAlbum();
    else if (view === 'messages' && chatId === chat)
        await renderDrafts(chat);
    toast(errors.length ? `${added ? 'Добавлено: ' + added + '. ' : ''}${errors[0]}` : `Добавлено файлов: ${added}`);
} }
async function loadAlbum() { const root = $('#album'); if (!root)
    return; try {
    const all = (await dbOp('readonly', s => s.index('scope').getAll('profile'))).sort((a, b) => b.created - a.created);
    if ($('#album') !== root)
        return;
    const files = all.filter(f => albumTab === 'all' || f.kind === albumTab);
    root.innerHTML = `<div class="album-heading"><div><h2>Фото и видео <span>${all.length}</span></h2></div><label class="primary file-trigger">＋ Добавить<input type="file" multiple hidden accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onchange="addFiles(this.files,'profile');this.value=''"></label></div><div class="album-tabs">${[['all', 'Все'], ['photo', 'Фотографии'], ['video', 'Видео']].map(([v, t]) => `<button type="button" class="${albumTab === v ? 'selected' : ''}" onclick="albumTab='${v}';loadAlbum()">${t}</button>`).join('')}</div><div class="dropzone" id="media-drop"><span>＋</span><b>Перетащи фото и видео сюда</b><small>Или нажми «Добавить» · до 10 файлов за раз<br>Фото до 10 МБ · видео до 50 МБ</small></div><div id="album-status" role="status"></div>${files.length ? `<div class="media-grid">${files.map(f => `<article class="media-tile"><button class="media-open" type="button" onclick="openMedia('${f.id}')" aria-label="Открыть ${esc(f.name)}">${f.kind === 'photo' ? mediaPreview(f) : `<span class="video-cover">▷<small>Видео · ${prettySize(f.size)}</small></span>`}</button><div class="media-caption"><span title="${esc(f.name)}">${esc(f.name)}</span><button type="button" aria-label="Удалить ${esc(f.name)}" onclick="confirmRemoveMedia('${f.id}')">×</button></div></article>`).join('')}</div>` : `<div class="album-empty">${all.length ? 'В этом разделе пока пусто' : 'Добавь первые фото или видео'}</div>`}<p class="smallmuted">Видно только тебе · хранится в этом браузере.</p>`;
    const zone = $('#media-drop');
    zone.ondragover = e => { e.preventDefault(); zone.classList.add('dragging'); };
    zone.ondragleave = () => zone.classList.remove('dragging');
    zone.ondrop = e => { e.preventDefault(); zone.classList.remove('dragging'); addFiles(e.dataTransfer.files, 'profile'); };
}
catch {
    root.innerHTML = '<div class="empty"><h3>Медиа недоступны</h3><p>Браузер не разрешает сохранить файлы. Проверь настройки хранилища.</p><button class="secondary" onclick="loadAlbum()">Повторить</button></div>';
} }
async function openMedia(id) { try {
    const f = await dbOp('readonly', s => s.get(id));
    if (!f)
        return toast('Файл не найден');
    modal(`<div class="media-view">${mediaPreview(f)}</div><p>${esc(f.name)} · ${prettySize(f.size)}</p><button class="secondary" onclick="closeModal()">Закрыть</button>`);
    $('.dialog').classList.add('media-dialog');
}
catch {
    toast('Не удалось открыть файл');
} }
function confirmRemoveMedia(id) { modal(`<h2>Удалить файл?</h2><p>Он исчезнет из твоих фото и видео.</p><button class="primary" onclick="removeMedia('${id}')">Удалить</button><button class="secondary" onclick="closeModal()">Отмена</button>`); }
async function removeMedia(id) { try {
    await dbOp('readwrite', s => s.delete(id));
    releaseMedia(id);
    closeModal();
    await loadAlbum();
    toast('Файл удалён');
}
catch {
    toast('Не удалось удалить файл');
} }
async function renderDrafts(id) { const root = $('#attachment-drafts'); if (!root)
    return; try {
    const files = (await Promise.all((drafts[id] || []).map(key => dbOp('readonly', s => s.get(key))))).filter(Boolean);
    if ($('#attachment-drafts') !== root)
        return;
    root.innerHTML = files.map(f => `<div class="draft-file">${f.kind === 'photo' ? mediaPreview(f) : `<span class="file-icon">${f.kind === 'video' ? '▷' : '↧'}</span>`}<span>${esc(f.name)}<small>${prettySize(f.size)}</small></span><button type="button" aria-label="Убрать ${esc(f.name)}" onclick="removeDraft(${id},'${f.id}')">×</button></div>`).join('');
}
catch {
    root.textContent = 'Не удалось прочитать вложения';
} }
async function removeDraft(chat, id) { try {
    await dbOp('readwrite', s => s.delete(id));
    drafts[chat] = (drafts[chat] || []).filter(x => x !== id);
    releaseMedia(id);
    renderDrafts(chat);
}
catch {
    toast('Не удалось убрать вложение');
} }
async function loadMessageMedia() { for (const root of document.querySelectorAll('[data-attachments]')) {
    try {
        const files = (await Promise.all(root.dataset.attachments.split(',').map(id => dbOp('readonly', s => s.get(id))))).filter(Boolean);
        if (root.isConnected)
            root.innerHTML = files.map(f => `<div class="message-file">${mediaPreview(f)}</div>`).join('') || '<small>Вложение недоступно на этом устройстве</small>';
    }
    catch {
        root.textContent = 'Не удалось прочитать вложение';
    }
} }
async function eraseAll() { try {
    await dbOp('readwrite', s => s.clear());
    localStorage.removeItem('razumatch-v1');
    location.reload();
}
catch {
    toast('Не удалось удалить данные. Попробуй ещё раз.');
} }
window.addEventListener('beforeunload', () => mediaURLs.forEach(u => URL.revokeObjectURL(u)));
