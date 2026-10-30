let authMode = 'login', authBusy = false, verificationEmail = '';
function renderAuth(mode = authMode) { authMode = mode; me = null; activeChat = null; activeTicket = null; $('#nav').innerHTML = ''; const logout = $('#logout-button'); if (logout)
    logout.hidden = true; const register = mode === 'register', recover = mode === 'recover'; if (mode === 'verify') {
    $('#app').innerHTML = `<section class="auth-card"><h1>Подтверди почту</h1><p>Мы отправили письмо со ссылкой на <b>${esc(verificationEmail)}</b>. Перейди по ссылке, а затем войди в аккаунт. Код запоминать не нужно.</p><p id="auth-error" class="auth-error" role="alert"></p><button class="primary" onclick="resendVerification()">Отправить письмо ещё раз</button><button class="report" onclick="renderAuth('login')">Вернуться ко входу</button></section>`;
    return;
} $('#app').innerHTML = `<section class="auth-card"><h1>${register ? 'Создать аккаунт' : recover ? 'Восстановить доступ' : mode === 'verify' ? 'Подтверди почту' : 'Свои люди рядом'}</h1><p class="auth-subtitle">${recover ? 'Введи email, и мы отправим ссылку для смены пароля. Она действует 15 минут.' : 'Знакомства в МГУТУ — без лишнего.'}</p>${!recover ? `<div class="auth-tabs"><button class="${!register ? 'selected' : ''}" onclick="renderAuth('login')">Вход</button><button class="${register ? 'selected' : ''}" onclick="renderAuth('register')">Регистрация</button></div>` : ''}<form onsubmit="submitAuth(event)"><label>Email<input name="email" type="email" autocomplete="username" maxlength="254" required></label>${!recover ? `<label>Пароль<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="12" maxlength="128" required placeholder="Не менее 12 символов"></label>` : ''}${register ? '<label>Повтори пароль<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>' : ''}${register ? `<div class="auth-consent"><p>Для работы сервиса мы сохраняем данные аккаунта, анкету, симпатии и переписки. <a href="/ui/privacy.html" target="_blank" rel="noopener">Как используются данные</a></p><label class="checkline"><input type="checkbox" name="acceptNotice" required><span>Я ознакомился(ась) с уведомлением и согласен(на) на обработку данных для работы сервиса.</span></label><small>Участие в исследованиях для ИИ — отдельный добровольный выбор в анкете.</small></div><details class="auth-migration"><summary>У меня уже была анкета</summary><label class="checkline"><input type="checkbox" name="migrate"><span>Перенести прежнюю анкету и переписки. Только для ранее созданного аккаунта.</span></label></details>` : ''}<p id="auth-error" class="auth-error" role="alert"></p><button class="primary" type="submit">${register ? 'Зарегистрироваться' : recover ? 'Отправить ссылку' : 'Войти'}</button></form>${register ? '<p class="smallmuted">После регистрации подтверди почту по ссылке из письма. Никаких кодов.</p>' : recover ? '<button class="report" onclick="renderAuth(\'login\')">Вернуться ко входу</button>' : '<button class="report" onclick="renderAuth(\'recover\')">Не помню пароль</button>'}</section>`; }
async function submitAuth(e) { e.preventDefault(); if (authBusy)
    return; const form = e.target, data = Object.fromEntries(new FormData(form)); if (data.confirmPassword !== undefined && data.password !== data.confirmPassword) {
    $('#auth-error').textContent = 'Пароли не совпадают';
    return;
} data.acceptNotice = !!form.elements.acceptNotice?.checked; data.noticeVersion = '2026-10-27-v4'; const action = authMode === 'register' ? (form.elements.migrate?.checked ? 'link' : 'register') : authMode === 'recover' ? 'request' : 'login'; authBusy = true; const button = form.querySelector('button[type=submit]'); button.disabled = true; $('#auth-error').textContent = ''; try {
    const response = await fetch((authMode === 'recover' ? '/api/email/' : '/api/auth/') + action, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const out = await response.json();
    if (!response.ok) {
        if (out.verificationRequired) {
            verificationEmail = String(data.email || '');
            renderAuth('verify');
            const warning = $('#auth-error');
            if (warning) warning.textContent = out.error || '';
            return;
        }
        if (out.needsLegacyLogin) {
            $('#auth-error').innerHTML = 'Для переноса один раз подтверди прежний аккаунт: <a href="/signin-with-chatgpt?return_to=%2Fui%2Findex.html" target="_top">Перенести старую анкету</a>';
            return;
        }
        throw new Error(out.error || 'Не удалось войти');
    }
    if (out.verificationRequired) {
        verificationEmail = String(data.email || '');
        renderAuth('verify');
        return;
    }
    if (authMode === 'recover') {
        $('#app').innerHTML = '<section class="auth-card"><h1>Проверь почту</h1><p>Если адрес зарегистрирован, письмо со ссылкой придёт на email. Проверь также папку «Спам».</p><button class="primary" onclick="renderAuth(\'login\')">Вернуться ко входу</button></section>';
        return;
    }
    me = await api('me');
    const exit = $('#logout-button');
    if (exit)
        exit.hidden = false;
    await go(me.completed ? 'discover' : 'profile');

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
async function resendVerification() {
    if (authBusy || !verificationEmail) return;
    authBusy = true;
    const error = $('#auth-error');
    if (error) error.textContent = '';
    try {
        const response = await fetch('/api/email/resend-verification', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: verificationEmail })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Не удалось отправить письмо');
        toast('Если аккаунт ожидает подтверждения, письмо отправлено.');
    } catch (err) {
        if (error) error.textContent = err.message;
        else toast(err.message);
    } finally { authBusy = false; }
}
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
