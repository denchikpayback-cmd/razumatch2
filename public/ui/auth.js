let authMode = 'login', authBusy = false;
function renderAuth(mode = authMode) { authMode = mode; me = null; activeChat = null; activeTicket = null; $('#nav').innerHTML = ''; const logout = $('#logout-button'); if (logout)
    logout.hidden = true; const register = mode === 'register', recover = mode === 'recover'; $('#app').innerHTML = `<section class="auth-card"><h1>${register ? 'Создать аккаунт' : recover ? 'Восстановить доступ' : 'Свои люди рядом'}</h1><p class="auth-subtitle">${recover ? 'Введи личный код восстановления или одноразовый код, выданный владельцем проекта.' : 'Знакомства в МГУТУ — без лишнего.'}</p>${!recover ? `<div class="auth-tabs"><button class="${!register ? 'selected' : ''}" onclick="renderAuth('login')">Вход</button><button class="${register ? 'selected' : ''}" onclick="renderAuth('register')">Регистрация</button></div>` : ''}<form onsubmit="submitAuth(event)"><label>Email<input name="email" type="email" autocomplete="username" maxlength="254" required></label>${recover ? '<label>Код восстановления<input name="recoveryCode" type="password" autocomplete="off" required maxlength="100"></label>' : ''}<label>${recover ? 'Новый пароль' : 'Пароль'}<input name="password" type="password" autocomplete="${register || recover ? 'new-password' : 'current-password'}" minlength="12" maxlength="128" required placeholder="Не менее 12 символов"></label>${register || recover ? '<label>Повтори пароль<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>' : ''}${register ? `<div class="auth-consent"><p>Для работы сервиса мы сохраняем данные аккаунта, анкету, симпатии и переписки. <a href="/ui/privacy.html" target="_blank" rel="noopener">Как используются данные</a></p><label class="checkline"><input type="checkbox" name="acceptNotice" required><span>Я ознакомился(ась) с уведомлением и согласен(на) на обработку данных для работы сервиса.</span></label><small>Участие в исследованиях для ИИ — отдельный добровольный выбор в анкете.</small></div><details class="auth-migration"><summary>У меня уже была анкета</summary><label class="checkline"><input type="checkbox" name="migrate"><span>Перенести прежнюю анкету и переписки. Только для ранее созданного аккаунта.</span></label></details>` : ''}<p id="auth-error" class="auth-error" role="alert"></p><button class="primary" type="submit">${register ? 'Зарегистрироваться' : recover ? 'Восстановить доступ' : 'Войти'}</button></form>${register ? '<p class="smallmuted">При регистрации ты получишь личный код восстановления. Сохрани его: письма на email пока не отправляются.</p>' : recover ? '<button class="report" onclick="renderAuth(\'login\')">Вернуться ко входу</button>' : '<button class="report" onclick="renderAuth(\'recover\')">Не помню пароль</button>'}</section>`; }
async function submitAuth(e) { e.preventDefault(); if (authBusy)
    return; const form = e.target, data = Object.fromEntries(new FormData(form)); if (data.confirmPassword !== undefined && data.password !== data.confirmPassword) {
    $('#auth-error').textContent = 'Пароли не совпадают';
    return;
} data.acceptNotice = !!form.elements.acceptNotice?.checked; data.noticeVersion = '2026-10-27-v4'; const action = authMode === 'register' ? (form.elements.migrate?.checked ? 'link' : 'register') : authMode === 'recover' ? 'recover' : 'login'; authBusy = true; const button = form.querySelector('button[type=submit]'); button.disabled = true; $('#auth-error').textContent = ''; try {
    const response = await fetch('/api/auth/' + action, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const out = await response.json();
    if (!response.ok) {
        if (out.needsLegacyLogin) {
            $('#auth-error').innerHTML = 'Для переноса один раз подтверди прежний аккаунт: <a href="/signin-with-chatgpt?return_to=%2Fui%2Findex.html" target="_top">Перенести старую анкету</a>';
            return;
        }
        throw new Error(out.error || 'Не удалось войти');
    }
    me = await api('me');
    const exit = $('#logout-button');
    if (exit)
        exit.hidden = false;
    await go(me.completed ? 'discover' : 'profile');
    if (out.recoveryCode)
        showRecoveryCode(out.recoveryCode);
}
catch (err) {
    const error = $('#auth-error');
    if (error)
        error.textContent = err.message;
    else
        toast(err.message);
}
finally {
    authBusy = false;
    if (button.isConnected)
        button.disabled = false;
} }
function showRecoveryCode(code) { modal(`<h2>Сохрани код восстановления</h2><p>Он позволит задать новый пароль. Никому не отправляй его. При восстановлении будет выдан новый код.</p><input readonly aria-label="Личный код восстановления" value="${esc(code)}" onclick="this.select()" autocomplete="off"><p class="smallmuted">Письма на email пока не отправляются. Без пароля и этого кода восстановить доступ автоматически не получится.</p><button class="primary" onclick="closeModal()">Я сохранил(а) код</button>`); }
async function logoutSite() { try {
    const r = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    if (!r.ok)
        throw new Error('Не удалось выйти');
    me = null;
    activeChat = null;
    activeTicket = null;
    drafts = [];
    closeModal();
    renderAuth('login');
}
catch (e) {
    toast(e.message);
} }
