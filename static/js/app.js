'use strict';

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    I18N.init();
    initParticles();
    initNavigation();
    initTypingSounds();
    loadSessions();
    loadSettings();
    initSessionHandlers();
    initSpam();
    initCustomizer();
});

const socket = io();

// ── Sound ─────────────────────────────────────────────────────────────────────
function playSound(file, volume) {
    const audio = new Audio('/assets/audio/' + file);
    audio.volume = volume !== undefined ? volume : 0.6;
    audio.play().catch(() => {});
}

// ── Typing sounds (как в Sitemanager) ────────────────────────────────────────
function initTypingSounds() {
    document.addEventListener('keydown', (e) => {
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
        if (e.key === 'Backspace') {
            playSound('stdout.wav', 0.5);
        } else if (e.key.length === 1) {
            playSound('stdin.wav', 0.4);
        }
    });
}

// ── Boot effect при смене секции (как в Sitemanager) ─────────────────────────
function playBootEffect(section) {
    const target = section || document.querySelector('.section.active');
    if (!target) return;

    // Берём только видимые элементы верхнего уровня, исключаем скрытые блоки
    const elements = Array.from(
        target.querySelectorAll('.form-group, .stat-card, .btn, .result-box, .settings-group, .session-card')
    ).filter(el => {
        // Пропускаем если сам элемент или его родитель скрыт
        let node = el;
        while (node && node !== target) {
            if (node.style.display === 'none') return false;
            node = node.parentElement;
        }
        return true;
    });

    if (elements.length === 0) return;

    playSound('keyboard.wav', 0.5);

    elements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transition = 'none';
        setTimeout(() => {
            let flickers = 0;
            const flickerInterval = setInterval(() => {
                el.style.opacity = flickers % 2 === 0 ? '0.4' : '0';
                flickers++;
                if (flickers >= 6) {
                    clearInterval(flickerInterval);
                    el.style.opacity = '1';
                    el.style.transition = '';
                }
            }, 35);
        }, index * 60);
    });
}

// ── Particles ─────────────────────────────────────────────────────────────────
function initParticles() {
    const particles = document.getElementById('particles');
    if (!particles) return;
    for (let i = 0; i < 50; i++) {
        const p = document.createElement('div');
        p.style.position = 'absolute';
        p.style.width = Math.random() * 3 + 'px';
        p.style.height = p.style.width;
        p.style.background = `rgba(42,171,238,${Math.random() * 0.4})`;
        p.style.borderRadius = '50%';
        p.style.left = Math.random() * 100 + '%';
        p.style.top = Math.random() * 100 + '%';
        p.style.animation = `floatP ${Math.random() * 10 + 5}s linear infinite`;
        particles.appendChild(p);
    }
    const s = document.createElement('style');
    s.textContent = `@keyframes floatP { 0%,100%{transform:translate(0,0)} 25%{transform:translate(10px,-10px)} 50%{transform:translate(-10px,10px)} 75%{transform:translate(10px,10px)} }`;
    document.head.appendChild(s);
}

// ── Navigation ────────────────────────────────────────────────────────────────
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            item.classList.add('active');
            const newSection = document.getElementById(item.dataset.section + '-section');
            if (newSection) {
                newSection.classList.add('active');
                playBootEffect(newSection);
            }
            if (item.dataset.section === 'spam') refreshSpamSessions();
            if (item.dataset.section === 'customize') refreshCustomizerSessions();
        });
    });
}

// ── Notifications (как в Sitemanager) ────────────────────────────────────────
function showNotification(message, type) {
    type = type || 'info';
    if (type === 'error')        playSound('error.wav', 0.6);
    else if (type === 'success') playSound('info.wav', 0.5);
    else                         playSound('alarm.wav', 0.4);

    const n = document.createElement('div');
    n.style.cssText = `
        position:fixed;top:2rem;right:2rem;
        padding:1rem 1.5rem;
        background:${type === 'success' ? 'var(--primary)' : type === 'error' ? 'var(--danger)' : 'var(--warning)'};
        color:#000;font-family:FiraCode,monospace;font-size:0.82rem;
        letter-spacing:0.05em;z-index:10000;
        animation:slideInRight 0.3s ease;
    `;
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => {
        n.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => n.remove(), 300);
    }, 3000);
}

const ns = document.createElement('style');
ns.textContent = `
    @keyframes slideInRight  { from{transform:translateX(400px);opacity:0} to{transform:translateX(0);opacity:1} }
    @keyframes slideOutRight { from{transform:translateX(0);opacity:1} to{transform:translateX(400px);opacity:0} }
`;
document.head.appendChild(ns);

// ── Sessions ──────────────────────────────────────────────────────────────────
let pendingSessionId = null;
let _bulkDone = 0, _bulkTotal = 0;

function switchToList() {
    document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.section-tab[data-stab="list"]').classList.add('active');
    document.getElementById('stab-list').style.display = '';
    document.getElementById('stab-add').style.display  = 'none';
}

function initSessionHandlers() {
    const submitBtn      = document.getElementById('sess-submit-btn');
    const verifyBtn      = document.getElementById('verify-submit-btn');
    const twofaBtn       = document.getElementById('twofa-submit-btn');
    const testModeToggle = document.getElementById('sess-test-mode');
    const modeBadge      = document.getElementById('server-mode-badge');
    const modeBadgeText  = document.getElementById('mode-badge-text');
    const modeLabelProd  = document.getElementById('mode-label-prod');
    const modeLabelTest  = document.getElementById('mode-label-test');

    // Section tabs (Список / Добавить)
    document.querySelectorAll('.section-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.stab;
            document.getElementById('stab-list').style.display = target === 'list' ? '' : 'none';
            document.getElementById('stab-add').style.display  = target === 'add'  ? '' : 'none';
            playSound('panels.wav', 0.4);
        });
    });

    // Production/Test toggle
    if (testModeToggle) {
        testModeToggle.addEventListener('change', () => {
            const isTest = testModeToggle.checked;
            modeBadge.className = 'mode-badge ' + (isTest ? 'mode-test' : 'mode-prod');
            modeBadgeText.textContent = isTest ? 'TEST SERVER' : 'PRODUCTION SERVER';
            if (modeLabelProd) modeLabelProd.style.color = isTest ? 'var(--text-secondary)' : 'var(--prod-color)';
            if (modeLabelTest) modeLabelTest.style.color = isTest ? 'var(--test-color)' : 'var(--text-secondary)';
        });
    }

    const cleanupBtn = document.getElementById('cleanup-btn');    if (cleanupBtn) {
        cleanupBtn.addEventListener('click', async () => {
            cleanupBtn.disabled = true;
            cleanupBtn.innerHTML = '<span class="spinner"></span> Очищаю...';
            try {
                const res = await fetch('/api/sessions/cleanup', { method: 'POST' });
                const data = await res.json();
                showNotification(data.message, data.errors?.length ? 'info' : 'success');
            } catch (e) {
                showNotification('Ошибка: ' + e.message, 'error');
            } finally {
                cleanupBtn.disabled = false;
                cleanupBtn.innerHTML = '<svg class="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> Очистить файлы';
            }
        });
    }

    // Tabs switching (import type)
    document.querySelectorAll('.import-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.import-tab').forEach(t => {
                t.style.borderBottomColor = 'transparent';
                t.style.color = 'var(--text-secondary)';
                t.classList.remove('active');
            });
            tab.style.borderBottomColor = 'var(--primary)';
            tab.style.color = 'var(--primary)';
            tab.classList.add('active');
            document.getElementById('tab-phone').style.display = tab.dataset.tab === 'phone' ? '' : 'none';
            document.getElementById('tab-file').style.display  = tab.dataset.tab === 'file'  ? '' : 'none';
            document.getElementById('tab-bulk').style.display  = tab.dataset.tab === 'bulk'  ? '' : 'none';
        });
    });

    // Drop zone
    const dropZone  = document.getElementById('drop-zone');
    const fileInput = document.getElementById('import-file');
    const dropLabel = document.getElementById('drop-label');
    let importFile  = null;

    if (dropZone) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; });
        dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--border)'; });
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--border)';
            const file = e.dataTransfer.files[0];
            if (file && file.name.endsWith('.session')) {
                importFile = file;
                dropLabel.textContent = '✓ ' + file.name;
                dropZone.style.borderColor = 'var(--primary)';
            } else {
                showNotification('Нужен файл .session', 'error');
            }
        });
        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (file) { importFile = file; dropLabel.textContent = '✓ ' + file.name; dropZone.style.borderColor = 'var(--primary)'; }
        });
    }

    // Import submit
    const importSubmitBtn = document.getElementById('import-submit-btn');
    if (importSubmitBtn) {
        importSubmitBtn.addEventListener('click', async () => {
            if (!importFile) { showNotification('Выберите .session файл', 'error'); return; }
            const api_id    = document.getElementById('import-api-id').value.trim();
            const api_hash  = document.getElementById('import-api-hash').value.trim();
            const test_mode = document.getElementById('import-test-mode').checked;

            importSubmitBtn.disabled = true;
            importSubmitBtn.innerHTML = '<span class="spinner"></span> Проверка...';

            const fd = new FormData();
            fd.append('file', importFile);
            fd.append('api_id', api_id);
            fd.append('api_hash', api_hash);
            fd.append('test_mode', test_mode);

            try {
                await fetch('/api/sessions/import', { method: 'POST', body: fd });
            } catch (e) {
                showNotification('Ошибка: ' + e.message, 'error');
            } finally {
                importSubmitBtn.disabled = false;
                importSubmitBtn.textContent = 'Импортировать';
            }
        });
    }

    // ── Bulk import ───────────────────────────────────────────────────────
    const bulkDrop    = document.getElementById('bulk-drop-zone');
    const bulkInput   = document.getElementById('bulk-file-input');
    const bulkLabel   = document.getElementById('bulk-drop-label');
    const bulkList    = document.getElementById('bulk-file-list');
    const bulkSubmit  = document.getElementById('bulk-submit-btn');
    const bulkCancel  = document.getElementById('bulk-cancel-btn');
    let bulkFiles     = [];

    function renderBulkList() {
        if (!bulkList) return;
        bulkList.innerHTML = '';
        bulkFiles.forEach((f, i) => {
            const tag = document.createElement('span');
            tag.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:3px;padding:0.2rem 0.5rem;font-size:0.78rem;display:flex;align-items:center;gap:0.3rem;color:var(--text-primary)';
            tag.innerHTML = `<svg style="width:12px;height:12px;flex-shrink:0" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg> ${f.name} <span style="cursor:pointer;color:var(--danger)" data-i="${i}"><svg style="width:10px;height:10px" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></span>`;
            tag.querySelector('span').addEventListener('click', () => {
                bulkFiles.splice(i, 1);
                renderBulkList();
                updateBulkLabel();
            });
            bulkList.appendChild(tag);
        });
    }

    function updateBulkLabel() {
        if (!bulkLabel) return;
        bulkLabel.textContent = bulkFiles.length
            ? `✓ Выбрано файлов: ${bulkFiles.length}`
            : 'Перетащите несколько .session файлов или нажмите для выбора';
        if (bulkDrop) bulkDrop.style.borderColor = bulkFiles.length ? 'var(--primary)' : 'var(--border)';
    }

    function addBulkFiles(fileList) {
        for (const f of fileList) {
            if (f.name.endsWith('.session') && !bulkFiles.find(x => x.name === f.name)) {
                bulkFiles.push(f);
            }
        }
        renderBulkList();
        updateBulkLabel();
    }

    if (bulkDrop) {
        bulkDrop.addEventListener('click', () => bulkInput.click());
        bulkDrop.addEventListener('dragover', e => { e.preventDefault(); bulkDrop.style.borderColor = 'var(--primary)'; });
        bulkDrop.addEventListener('dragleave', () => updateBulkLabel());
        bulkDrop.addEventListener('drop', e => { e.preventDefault(); addBulkFiles(e.dataTransfer.files); });
        bulkInput.addEventListener('change', () => { addBulkFiles(bulkInput.files); bulkInput.value = ''; });
    }

    if (bulkCancel) bulkCancel.addEventListener('click', () => { switchToList(); });

    if (bulkSubmit) {
        bulkSubmit.addEventListener('click', async () => {
            if (!bulkFiles.length) { showNotification('Добавьте .session файлы', 'error'); return; }
            const api_id    = document.getElementById('bulk-api-id').value.trim();
            const api_hash  = document.getElementById('bulk-api-hash').value.trim();
            const test_mode = document.getElementById('bulk-test-mode').checked;

            const fd = new FormData();
            bulkFiles.forEach(f => fd.append('files', f));
            fd.append('api_id', api_id);
            fd.append('api_hash', api_hash);
            fd.append('test_mode', test_mode);

            const logBox = document.getElementById('bulk-log');
            const progBox = document.getElementById('bulk-progress-box');
            logBox.innerHTML = '';
            logBox.style.display = 'block';
            progBox.style.display = 'block';
            document.getElementById('bulk-progress-fill').style.width = '0%';
            document.getElementById('bulk-progress-text').textContent = '0 / ' + bulkFiles.length;
            bulkSubmit.disabled = true;
            bulkSubmit.innerHTML = '<span class="spinner"></span> Импорт...';

            try {
                const res = await fetch('/api/sessions/import_bulk', { method: 'POST', body: fd });
                const data = await res.json();
                if (!data.success) {
                    showNotification(data.message, 'error');
                    bulkSubmit.disabled = false;
                    bulkSubmit.textContent = 'Импортировать все';
                } else {
                    _bulkDone = 0;
                    _bulkTotal = data.count;
                }
            } catch (e) {
                showNotification('Ошибка: ' + e.message, 'error');
                bulkSubmit.disabled = false;
                bulkSubmit.textContent = 'Импортировать все';
            }
        });
    }

    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            const phone    = document.getElementById('sess-phone').value.trim();
            const api_id   = document.getElementById('sess-api-id').value.trim();
            const api_hash = document.getElementById('sess-api-hash').value.trim();
            const test_mode = testModeToggle ? testModeToggle.checked : false;

            if (!phone || !api_id || !api_hash) {
                showNotification('Заполните все поля', 'error');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner"></span> Подключение...';

            try {
                await fetch('/api/sessions/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, api_id, api_hash, test_mode }),
                });
            } catch (e) {
                showNotification('Ошибка запроса: ' + e.message, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = I18N.t('sessions.connect_btn');
            }
        });
    }

    if (twofaBtn) {
        twofaBtn.addEventListener('click', async () => {
            const password = document.getElementById('twofa-password').value.trim();
            if (!password || !pendingSessionId) return;

            twofaBtn.disabled = true;
            twofaBtn.innerHTML = '<span class="spinner"></span>';

            try {
                await fetch('/api/sessions/verify2fa', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: pendingSessionId, password }),
                });
            } catch (e) {
                showNotification('Ошибка: ' + e.message, 'error');
            } finally {
                twofaBtn.disabled = false;
                twofaBtn.textContent = 'Подтвердить';
            }
        });
    }

    if (verifyBtn) {
        verifyBtn.addEventListener('click', async () => {
            const code = document.getElementById('verify-code').value.trim();
            if (!code || !pendingSessionId) return;

            verifyBtn.disabled = true;
            verifyBtn.innerHTML = '<span class="spinner"></span>';

            try {
                await fetch('/api/sessions/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: pendingSessionId, code }),
                });
            } catch (e) {
                showNotification('Ошибка: ' + e.message, 'error');
            } finally {
                verifyBtn.disabled = false;
                verifyBtn.textContent = I18N.t('verify.btn');
            }
        });
    }
}

// Socket events
socket.on('session_result', (data) => {
    const verifyForm = document.getElementById('verify-form');
    const twofaForm  = document.getElementById('twofa-form');

    if (data.status === 'code_sent') {
        pendingSessionId = data.session_id;
        verifyForm.style.display = 'block';
        document.getElementById('verify-hint').textContent =
            'Код отправлен на ' + (data.test_mode ? '[TEST] ' : '') + data.message;
        showNotification(data.message, 'info');
    } else if (data.status === 'authorized') {
        verifyForm.style.display = 'none';
        twofaForm.style.display = 'none';
        pendingSessionId = null;
        showNotification(data.message, 'success');
        switchToList();
        loadSessions();
    } else if (data.status === '2fa_required') {
        verifyForm.style.display = 'none';
        twofaForm.style.display = 'block';
        pendingSessionId = data.session_id;
        document.getElementById('twofa-password').value = '';
        showNotification('Требуется пароль 2FA', 'info');
    } else {
        showNotification(data.message || 'Ошибка', 'error');
    }
});

socket.on('session_status', (data) => {
    showNotification('[' + data.session_id + '] ' + data.message, data.success ? 'success' : 'error');
});

socket.on('bulk_import_result', (data) => {
    _bulkDone++;
    const logBox = document.getElementById('bulk-log');
    const fillEl = document.getElementById('bulk-progress-fill');
    const textEl = document.getElementById('bulk-progress-text');
    const type   = data.success ? 'success' : 'error';
    const time   = new Date().toTimeString().slice(0, 8);
    const div    = document.createElement('div');
    div.className = `log-item log-${type}`;
    div.innerHTML = `<span class="log-time">${time}</span><span>${data.filename}: ${data.message}</span>`;
    if (logBox) { logBox.appendChild(div); logBox.scrollTop = logBox.scrollHeight; }
    if (_bulkTotal > 0) {
        const pct = Math.round((_bulkDone / _bulkTotal) * 100);
        if (fillEl) fillEl.style.width = pct + '%';
        if (textEl) textEl.textContent = _bulkDone + ' / ' + _bulkTotal;
    }
    if (data.success) playSound('info.wav', 0.3);
});

socket.on('bulk_import_done', (data) => {
    _bulkDone = 0; _bulkTotal = 0;
    const btn = document.getElementById('bulk-submit-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Импортировать все'; }
    showNotification(`Импорт завершён: ${data.ok}/${data.total} успешно`, data.ok === data.total ? 'success' : 'info');
    loadSessions();
});

// Load sessions list
async function loadSessions() {
    try {
        const res = await fetch('/api/sessions');
        const sessions = await res.json();
        renderSessions(sessions);
    } catch (e) {
        console.error('Failed to load sessions', e);
    }
}

function renderSessions(sessions) {
    const list  = document.getElementById('sessions-list');
    const empty = document.getElementById('sessions-empty');

    list.querySelectorAll('.session-card').forEach(c => c.remove());

    if (!sessions || sessions.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';

    sessions.forEach(s => {
        const card = document.createElement('div');
        card.className = 'session-card ' + (s.test_mode ? 'test-session' : 'prod-session');
        card.innerHTML = `
            <div class="session-info">
                <div class="session-name">
                    ${s.first_name || s.phone}
                    ${s.username ? '<span style="color:var(--text-secondary);font-size:0.8rem"> @' + s.username + '</span>' : ''}
                </div>
                <div class="session-meta">
                    <span>ID: <span>${s.user_id || '—'}</span></span>
                    <span>Phone: <span>${s.phone}</span></span>
                    <span>API ID: <span>${s.api_id}</span></span>
                </div>
            </div>
            <div class="session-actions">
                <span class="badge ${s.test_mode ? 'badge-test' : 'badge-active'}">${s.test_mode ? 'TEST' : 'PROD'}</span>
                <button class="btn" onclick="checkSession('${s.session_id}')">${I18N.t('sessions.check_btn')}</button>
                <button class="btn btn-danger" onclick="deleteSession('${s.session_id}')">${I18N.t('sessions.delete_btn')}</button>
            </div>
        `;
        list.appendChild(card);
    });
}

window.checkSession = async function(id) {
    await fetch('/api/sessions/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: id }),
    });
};

window.deleteSession = async function(id) {
    if (!confirm(I18N.t('sessions.confirm_delete'))) return;
    const res = await fetch('/api/sessions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: id }),
    });
    const data = await res.json();
    showNotification(data.message, data.success ? 'success' : 'error');
    if (data.success) loadSessions();
};

// ── Spam ──────────────────────────────────────────────────────────────────────
let currentTaskId = null;
let activeTaskIds = [];   // для режима "все сессии"

function initSpam() {
    const modeSelect    = document.getElementById('spam-mode');
    const msgGroup      = document.getElementById('spam-message-group');
    const startBtn      = document.getElementById('spam-start-btn');
    const stopBtn       = document.getElementById('spam-stop-btn');
    const allToggle     = document.getElementById('spam-all-sessions');
    const sessionGroup  = document.getElementById('spam-session-group');

    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            msgGroup.style.display = modeSelect.value === 'start' ? 'none' : 'block';
        });
    }

    if (allToggle) {
        allToggle.addEventListener('change', () => {
            sessionGroup.style.display = allToggle.checked ? 'none' : '';
        });
    }

    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            const allSessions = allToggle && allToggle.checked;
            const session_id  = document.getElementById('spam-session').value;
            const target      = document.getElementById('spam-target').value.trim();
            const mode        = document.getElementById('spam-mode').value;
            const message     = document.getElementById('spam-message').value.trim();
            const count       = parseInt(document.getElementById('spam-count').value);
            const delay       = parseFloat(document.getElementById('spam-delay').value);

            if (!allSessions && !session_id) { showNotification('Выберите сессию', 'error'); return; }
            if (!target)                      { showNotification('Укажите цель', 'error'); return; }
            if (mode === 'message' && !message) { showNotification('Введите текст', 'error'); return; }

            const logBox = document.getElementById('spam-log');
            logBox.innerHTML = '';
            document.getElementById('spam-progress-box').style.display = 'block';
            document.getElementById('spam-progress-fill').style.width = '0%';
            document.getElementById('spam-progress-text').textContent = '0 / ' + count;
            startBtn.style.display = 'none';
            stopBtn.style.display = '';
            activeTaskIds = [];

            if (allSessions) {
                // Запускаем для каждой сессии параллельно
                const sessions = await fetch('/api/sessions').then(r => r.json()).catch(() => []);
                if (!sessions || sessions.length === 0) {
                    showNotification('Нет активных сессий', 'error');
                    startBtn.style.display = '';
                    stopBtn.style.display = 'none';
                    return;
                }
                for (const s of sessions) {
                    try {
                        const res = await fetch('/api/spam/start', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ session_id: s.session_id, target, mode, message, count, delay }),
                        });
                        const data = await res.json();
                        if (data.success) {
                            activeTaskIds.push(data.task_id);
                            const time = new Date().toTimeString().slice(0, 8);
                            const div = document.createElement('div');
                            div.className = 'log-item log-info';
                            div.innerHTML = `<span class="log-time">${time}</span><span>Запущено для ${s.first_name || s.phone} [${data.task_id}]</span>`;
                            logBox.appendChild(div);
                        } else {
                            const div = document.createElement('div');
                            div.className = 'log-item log-error';
                            div.innerHTML = `<span>${s.first_name || s.phone}: ${data.message}</span>`;
                            logBox.appendChild(div);
                        }
                    } catch (e) { /* skip */ }
                }
                currentTaskId = activeTaskIds[0] || null;
                if (activeTaskIds.length === 0) {
                    startBtn.style.display = '';
                    stopBtn.style.display = 'none';
                }
            } else {
                try {
                    const res = await fetch('/api/spam/start', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ session_id, target, mode, message, count, delay }),
                    });
                    const data = await res.json();
                    if (!data.success) {
                        showNotification(data.message, 'error');
                        startBtn.style.display = '';
                        stopBtn.style.display = 'none';
                        return;
                    }
                    currentTaskId = data.task_id;
                    activeTaskIds = [data.task_id];
                } catch (e) {
                    showNotification('Ошибка: ' + e.message, 'error');
                    startBtn.style.display = '';
                    stopBtn.style.display = 'none';
                }
            }
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', async () => {
            const ids = activeTaskIds.length ? activeTaskIds : (currentTaskId ? [currentTaskId] : []);
            for (const task_id of ids) {
                await fetch('/api/spam/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ task_id }),
                }).catch(() => {});
            }
        });
    }
}

socket.on('spam_progress', (data) => {
    const startBtn  = document.getElementById('spam-start-btn');
    const stopBtn   = document.getElementById('spam-stop-btn');
    const fillEl    = document.getElementById('spam-progress-fill');
    const textEl    = document.getElementById('spam-progress-text');
    const logBox    = document.getElementById('spam-log');
    const count     = parseInt(document.getElementById('spam-count').value) || 1;

    if (data.status === 'progress') {
        const pct = Math.round((data.sent / count) * 100);
        if (fillEl) fillEl.style.width = pct + '%';
        if (textEl) textEl.textContent = data.sent + ' / ' + count;
    }

    if (['done', 'stopped', 'error', 'flood_wait'].includes(data.status)) {
        const type = data.status === 'done' ? 'success' : data.status === 'flood_wait' ? 'info' : 'error';
        const time = new Date().toTimeString().slice(0, 8);
        const div = document.createElement('div');
        div.className = `log-item log-${type === 'info' ? 'info' : type === 'success' ? 'success' : 'error'}`;
        div.innerHTML = `<span class="log-time">${time}</span><span>[${data.task_id || ''}] ${data.message}</span>`;
        if (logBox) { logBox.appendChild(div); logBox.scrollTop = logBox.scrollHeight; }

        if (data.status !== 'flood_wait') {
            // Убираем из активных задач
            activeTaskIds = activeTaskIds.filter(id => id !== data.task_id);
            if (data.task_id === currentTaskId) currentTaskId = null;

            // Показываем кнопку старт только когда все задачи завершены
            if (activeTaskIds.length === 0) {
                if (startBtn) startBtn.style.display = '';
                if (stopBtn)  stopBtn.style.display = 'none';
                if (fillEl) fillEl.style.width = '100%';
                showNotification(data.message, type);
            }
        }
    }
});

// Заполняем select сессий при открытии раздела
function refreshSpamSessions() {
    fetch('/api/sessions').then(r => r.json()).then(sessions => {
        const sel = document.getElementById('spam-session');
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = '<option value="">— выберите сессию —</option>';
        (sessions || []).forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.session_id;
            opt.textContent = (s.first_name || s.phone) + (s.username ? ' @' + s.username : '') + (s.test_mode ? ' [TEST]' : '');
            sel.appendChild(opt);
        });
        if (cur) sel.value = cur;
    }).catch(() => {});
}

// ── Customizer ────────────────────────────────────────────────────────────────
function initCustomizer() {
    const allToggle   = document.getElementById('cust-all-sessions');
    const sessGroup   = document.getElementById('cust-session-group');
    const genNameChk  = document.getElementById('cust-gen-name');
    const nameFields  = document.getElementById('cust-name-fields');
    const genUnChk    = document.getElementById('cust-gen-username');
    const unField     = document.getElementById('cust-username-field');
    const clearUnChk  = document.getElementById('cust-clear-username');
    const applyBtn    = document.getElementById('cust-apply-btn');
    const photoDrop   = document.getElementById('cust-photo-drop');
    const photoInput  = document.getElementById('cust-photo-input');
    const photoLabel  = document.getElementById('cust-photo-label');
    const photoPreview= document.getElementById('cust-photo-preview');
    const photoImg    = document.getElementById('cust-photo-img');
    const photoClear  = document.getElementById('cust-photo-clear');
    let custPhoto     = null;

    // All sessions toggle
    if (allToggle) allToggle.addEventListener('change', () => {
        sessGroup.style.display = allToggle.checked ? 'none' : '';
    });

    // Gen name toggle
    if (genNameChk) genNameChk.addEventListener('change', () => {
        nameFields.style.opacity = genNameChk.checked ? '0.4' : '1';
        nameFields.querySelectorAll('input').forEach(i => i.disabled = genNameChk.checked);
    });

    // Gen username toggle
    if (genUnChk) genUnChk.addEventListener('change', () => {
        unField.style.opacity = genUnChk.checked ? '0.4' : '1';
        unField.querySelectorAll('input').forEach(i => i.disabled = genUnChk.checked);
        if (genUnChk.checked && clearUnChk) clearUnChk.checked = false;
    });

    // Clear username toggle
    if (clearUnChk) clearUnChk.addEventListener('change', () => {
        if (clearUnChk.checked && genUnChk) genUnChk.checked = false;
        if (genUnChk) {
            unField.style.opacity = '1';
            unField.querySelectorAll('input').forEach(i => i.disabled = false);
        }
    });

    // Generate buttons
    document.getElementById('cust-gen-name-btn')?.addEventListener('click', async () => {
        const d = await fetch('/api/customize/generate').then(r => r.json());
        document.getElementById('cust-first-name').value = d.first_name;
        document.getElementById('cust-last-name').value  = d.last_name;
        playSound('stdin.wav', 0.3);
    });
    document.getElementById('cust-gen-username-btn')?.addEventListener('click', async () => {
        const d = await fetch('/api/customize/generate').then(r => r.json());
        document.getElementById('cust-username').value = d.username;
        playSound('stdin.wav', 0.3);
    });

    // Photo drop zone
    if (photoDrop) {
        photoDrop.addEventListener('click', () => photoInput.click());
        photoDrop.addEventListener('dragover', e => { e.preventDefault(); photoDrop.style.borderColor = 'var(--primary)'; });
        photoDrop.addEventListener('dragleave', () => { photoDrop.style.borderColor = 'var(--border)'; });
        photoDrop.addEventListener('drop', e => {
            e.preventDefault();
            photoDrop.style.borderColor = 'var(--border)';
            setPhoto(e.dataTransfer.files[0]);
        });
        photoInput.addEventListener('change', () => setPhoto(photoInput.files[0]));
    }

    function setPhoto(file) {
        if (!file || !file.type.startsWith('image/')) { showNotification('Нужен файл изображения', 'error'); return; }
        custPhoto = file;
        const url = URL.createObjectURL(file);
        photoImg.src = url;
        photoPreview.style.display = '';
        photoLabel.textContent = '✓ ' + file.name;
        photoDrop.style.borderColor = 'var(--primary)';
    }

    if (photoClear) photoClear.addEventListener('click', () => {
        custPhoto = null;
        photoPreview.style.display = 'none';
        photoLabel.textContent = 'Перетащите фото или нажмите для выбора';
        photoDrop.style.borderColor = 'var(--border)';
        photoInput.value = '';
    });

    // Apply
    if (applyBtn) applyBtn.addEventListener('click', async () => {
        const allSessions = allToggle?.checked;
        const session_id  = document.getElementById('cust-session').value;

        if (!allSessions && !session_id) { showNotification('Выберите сессию', 'error'); return; }

        const fd = new FormData();
        fd.append('all_sessions', allSessions ? 'true' : 'false');
        if (!allSessions) fd.append('session_ids', session_id);

        fd.append('gen_name',     genNameChk?.checked ? 'true' : 'false');
        fd.append('gen_username', genUnChk?.checked   ? 'true' : 'false');
        fd.append('clear_username', clearUnChk?.checked ? 'true' : 'false');

        if (!genNameChk?.checked) {
            const fn = document.getElementById('cust-first-name').value.trim();
            const ln = document.getElementById('cust-last-name').value.trim();
            if (fn) fd.append('first_name', fn);
            fd.append('last_name', ln);
        }
        if (!genUnChk?.checked && !clearUnChk?.checked) {
            const un = document.getElementById('cust-username').value.trim();
            if (un) fd.append('username', un);
        }
        const bio = document.getElementById('cust-bio').value.trim();
        if (bio) fd.append('bio', bio);
        if (custPhoto) fd.append('photo', custPhoto);

        const logBox = document.getElementById('cust-log');
        logBox.innerHTML = '';
        document.getElementById('cust-progress-box').style.display = 'block';
        document.getElementById('cust-progress-fill').style.width = '0%';
        applyBtn.disabled = true;
        applyBtn.innerHTML = '<span class="spinner"></span> Применяю...';

        try {
            const res = await fetch('/api/customize/apply', { method: 'POST', body: fd });
            const data = await res.json();
            if (!data.success) {
                showNotification(data.message, 'error');
                applyBtn.disabled = false;
                applyBtn.textContent = '▶ Применить';
            } else {
                document.getElementById('cust-progress-text').textContent = '0 / ' + data.count;
                _custDone = 0;
                _custTotal = data.count;
            }
        } catch (e) {
            showNotification('Ошибка: ' + e.message, 'error');
            applyBtn.disabled = false;
            applyBtn.textContent = '▶ Применить';
        }
    });
}

let _custDone = 0, _custTotal = 0;

socket.on('customize_result', (data) => {
    _custDone++;
    const logBox  = document.getElementById('cust-log');
    const fillEl  = document.getElementById('cust-progress-fill');
    const textEl  = document.getElementById('cust-progress-text');
    const type    = data.success ? 'success' : 'error';
    const time    = new Date().toTimeString().slice(0, 8);
    const div     = document.createElement('div');
    div.className = `log-item log-${type}`;
    div.innerHTML = `<span class="log-time">${time}</span><span>[${data.session_id}] ${data.message}</span>`;
    if (logBox) { logBox.appendChild(div); logBox.scrollTop = logBox.scrollHeight; }
    if (_custTotal > 0) {
        const pct = Math.round((_custDone / _custTotal) * 100);
        if (fillEl) fillEl.style.width = pct + '%';
        if (textEl) textEl.textContent = _custDone + ' / ' + _custTotal;
    }
    if (data.success) playSound('info.wav', 0.4);
    else              playSound('error.wav', 0.5);
});

socket.on('customize_done', (data) => {
    _custDone = 0; _custTotal = 0;
    const applyBtn = document.getElementById('cust-apply-btn');
    if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = '▶ Применить'; }
    showNotification(`Готово: ${data.ok}/${data.total} успешно`, data.ok === data.total ? 'success' : 'info');
});

function refreshCustomizerSessions() {
    fetch('/api/sessions').then(r => r.json()).then(sessions => {
        const sel = document.getElementById('cust-session');
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = '<option value="">— выберите сессию —</option>';
        (sessions || []).forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.session_id;
            opt.textContent = (s.first_name || s.phone) + (s.username ? ' @' + s.username : '') + (s.test_mode ? ' [TEST]' : '');
            sel.appendChild(opt);
        });
        if (cur) sel.value = cur;
    }).catch(() => {});
}

// ── Settings ──────────────────────────────────────────────────────────────────
async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        const s = await res.json();
        if (document.getElementById('settings-sounds'))        document.getElementById('settings-sounds').checked        = s.sounds !== false;
        if (document.getElementById('settings-notifications')) document.getElementById('settings-notifications').checked = s.notifications !== false;
        if (document.getElementById('settings-lang'))          document.getElementById('settings-lang').value            = s.language || 'ru';
        if (document.getElementById('settings-test-mode'))     document.getElementById('settings-test-mode').checked     = s.test_mode || false;
        if (s.language) I18N.apply(s.language);

        // Proxy
        const p = s.proxy || {};
        const proxyEnabled = document.getElementById('proxy-enabled');
        if (proxyEnabled) {
            proxyEnabled.checked = !!p.enabled;
            document.getElementById('proxy-fields').style.display = p.enabled ? '' : 'none';
        }
        if (p.type)     document.getElementById('proxy-type').value     = p.type;
        if (p.host)     document.getElementById('proxy-host').value     = p.host;
        if (p.port)     document.getElementById('proxy-port').value     = p.port;
        if (p.username) document.getElementById('proxy-username').value = p.username;
        if (p.password) document.getElementById('proxy-password').value = p.password;
        if (p.secret)   document.getElementById('proxy-secret').value   = p.secret;
        updateProxyTypeUI(p.type || 'socks5');
    } catch (e) {}
}

function updateProxyTypeUI(type) {
    const mtFields   = document.getElementById('proxy-mtproto-fields');
    const authFields = document.getElementById('proxy-auth-fields');
    if (!mtFields) return;
    mtFields.style.display   = type === 'mtproto' ? '' : 'none';
    // MTProto не использует логин/пароль
    authFields.style.display = type === 'mtproto' ? 'none' : '';
}

document.getElementById('proxy-type')?.addEventListener('change', function() {
    updateProxyTypeUI(this.value);
});

document.getElementById('proxy-enabled')?.addEventListener('change', function() {
    document.getElementById('proxy-fields').style.display = this.checked ? '' : 'none';
});

document.getElementById('proxy-test-btn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('proxy-status');
    statusEl.textContent = '... Проверяю...';
    statusEl.style.color = 'var(--text-secondary)';
    try {
        const res = await fetch('/api/proxy/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type:     document.getElementById('proxy-type').value,
                host:     document.getElementById('proxy-host').value.trim(),
                port:     document.getElementById('proxy-port').value,
                username: document.getElementById('proxy-username').value.trim(),
                password: document.getElementById('proxy-password').value,
                secret:   document.getElementById('proxy-secret').value.trim(),
            }),
        });
        const data = await res.json();
        statusEl.textContent = data.success ? '+ ' + data.message : '- ' + data.message;
        statusEl.style.color = data.success ? 'var(--primary)' : 'var(--danger)';
    } catch (e) {
        statusEl.textContent = '- Ошибка запроса';
        statusEl.style.color = 'var(--danger)';
    }
});

const saveBtn = document.getElementById('settings-save-btn');
if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
        const lang = document.getElementById('settings-lang')?.value;
        const data = {
            sounds:        document.getElementById('settings-sounds')?.checked,
            notifications: document.getElementById('settings-notifications')?.checked,
            language:      lang,
            test_mode:     document.getElementById('settings-test-mode')?.checked,
            proxy: {
                enabled:  document.getElementById('proxy-enabled')?.checked || false,
                type:     document.getElementById('proxy-type')?.value     || 'socks5',
                host:     document.getElementById('proxy-host')?.value.trim()     || '',
                port:     parseInt(document.getElementById('proxy-port')?.value)  || 1080,
                username: document.getElementById('proxy-username')?.value.trim() || '',
                password: document.getElementById('proxy-password')?.value        || '',
                secret:   document.getElementById('proxy-secret')?.value.trim()   || '',
            },
        };
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (lang) I18N.apply(lang);
        showNotification(I18N.t('settings.saved'), 'success');
    });
}

// Смена языка в реальном времени
const langSelect = document.getElementById('settings-lang');
if (langSelect) {
    langSelect.addEventListener('change', () => {
        I18N.apply(langSelect.value);
    });
}
