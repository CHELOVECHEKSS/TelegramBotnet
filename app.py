from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_socketio import SocketIO
from modules.sessions import SessionManager
from modules.settings import SettingsManager
from modules import spammer
from modules import customizer
import threading
import os
import uuid

app = Flask(__name__)
app.config['SECRET_KEY'] = 'TelegramBotnet-secret-key'
socketio = SocketIO(app, cors_allowed_origins='*', async_mode='threading')

session_mgr = SessionManager(socketio)
settings_mgr = SettingsManager()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/assets/<path:filename>')
def assets(filename):
    return send_from_directory('assets', filename)


# ── Sessions ──────────────────────────────────────────────────────────────────

@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    return jsonify(session_mgr.list_sessions())


@app.route('/api/sessions/add', methods=['POST'])
def add_session():
    d = request.json
    phone = d.get('phone', '').strip()
    api_id = d.get('api_id', '').strip()
    api_hash = d.get('api_hash', '').strip()
    test_mode = d.get('test_mode', False)

    def run():
        result = session_mgr.add_session(phone, api_id, api_hash, test_mode)
        socketio.emit('session_result', result)

    threading.Thread(target=run, daemon=True).start()
    return jsonify({'success': True})


@app.route('/api/sessions/verify', methods=['POST'])
def verify_session():
    d = request.json
    session_id = d.get('session_id')
    code = d.get('code', '').strip()

    def run():
        result = session_mgr.verify_code(session_id, code)
        socketio.emit('session_result', result)

    threading.Thread(target=run, daemon=True).start()
    return jsonify({'success': True})


@app.route('/api/sessions/verify2fa', methods=['POST'])
def verify_2fa():
    d = request.json
    session_id = d.get('session_id')
    password = d.get('password', '').strip()

    def run():
        result = session_mgr.verify_2fa(session_id, password)
        socketio.emit('session_result', result)

    threading.Thread(target=run, daemon=True).start()
    return jsonify({'success': True})


@app.route('/api/sessions/import_bulk', methods=['POST'])
def import_bulk():
    files     = request.files.getlist('files')
    api_id    = request.form.get('api_id', '21592124').strip()
    api_hash  = request.form.get('api_hash', 'c2100f2a2c6beb6af0a98830509f371a').strip()
    test_mode = request.form.get('test_mode', 'false').lower() == 'true'

    if not files:
        return jsonify({'success': False, 'message': 'Нет файлов'})

    # Читаем байты сразу (до передачи в тред)
    items = [(f.filename, f.read()) for f in files if f.filename.endswith('.session')]
    if not items:
        return jsonify({'success': False, 'message': 'Нет .session файлов'})

    def run():
        ok = 0
        for filename, data in items:
            result = session_mgr.import_session(data, filename, api_id, api_hash, test_mode)
            result['filename'] = filename
            socketio.emit('bulk_import_result', result)
            if result['success']:
                ok += 1
        socketio.emit('bulk_import_done', {'total': len(items), 'ok': ok})

    threading.Thread(target=run, daemon=True).start()
    return jsonify({'success': True, 'count': len(items)})


@app.route('/api/sessions/import', methods=['POST'])
def import_session():
    f = request.files.get('file')
    if not f or not f.filename.endswith('.session'):
        return jsonify({'success': False, 'message': 'Нужен файл .session'})
    api_id   = request.form.get('api_id', '21592124').strip()
    api_hash = request.form.get('api_hash', 'c2100f2a2c6beb6af0a98830509f371a').strip()
    test_mode = request.form.get('test_mode', 'false').lower() == 'true'

    def run():
        result = session_mgr.import_session(f.read(), f.filename, api_id, api_hash, test_mode)
        socketio.emit('session_result', {**result, 'status': 'authorized' if result['success'] else 'error'})

    threading.Thread(target=run, daemon=True).start()
    return jsonify({'success': True})


@app.route('/api/sessions/cleanup', methods=['POST'])
def sessions_cleanup():
    result = session_mgr.cleanup_orphans()
    return jsonify(result)


@app.route('/api/sessions/delete', methods=['POST'])
def delete_session():
    d = request.json
    session_id = d.get('session_id')
    result = session_mgr.delete_session(session_id)
    return jsonify(result)


@app.route('/api/sessions/status', methods=['POST'])
def session_status():
    d = request.json
    session_id = d.get('session_id')

    def run():
        result = session_mgr.check_status(session_id)
        socketio.emit('session_status', result)

    threading.Thread(target=run, daemon=True).start()
    return jsonify({'success': True})


# ── Spam ──────────────────────────────────────────────────────────────────────

@app.route('/api/spam/start', methods=['POST'])
def spam_start():
    d = request.json
    session_id = d.get('session_id')
    target     = d.get('target', '').strip()
    mode       = d.get('mode', 'message')   # 'message' | 'start'
    message    = d.get('message', '').strip()
    count      = int(d.get('count', 10))
    delay      = float(d.get('delay', 1.0))

    meta = session_mgr._sessions.get(session_id)
    if not meta:
        return jsonify({'success': False, 'message': 'Сессия не найдена'})
    if not target:
        return jsonify({'success': False, 'message': 'Укажите цель'})
    if mode == 'message' and not message:
        return jsonify({'success': False, 'message': 'Укажите текст сообщения'})

    task_id = str(uuid.uuid4())[:8]

    threading.Thread(
        target=spammer.run_spam,
        args=(task_id, meta, target, mode, message, count, delay, socketio),
        daemon=True
    ).start()

    return jsonify({'success': True, 'task_id': task_id})


@app.route('/api/spam/stop', methods=['POST'])
def spam_stop():
    task_id = request.json.get('task_id')
    spammer.stop_spam(task_id)
    return jsonify({'success': True})


# ── Customizer ────────────────────────────────────────────────────────────────

@app.route('/api/customize/generate', methods=['GET'])
def customize_generate():
    username = customizer.generate_username()
    first, last = customizer.generate_name()
    return jsonify({'username': username, 'first_name': first, 'last_name': last})


@app.route('/api/customize/apply', methods=['POST'])
def customize_apply():
    form      = request.form
    session_ids = form.getlist('session_ids')   # список или 'all'
    all_flag    = form.get('all_sessions') == 'true'

    changes = {}
    if form.get('first_name'): changes['first_name'] = form['first_name']
    if 'last_name'  in form:   changes['last_name']  = form.get('last_name', '')
    if 'bio'        in form:   changes['bio']         = form.get('bio', '')
    if form.get('username'):   changes['username']    = form['username']
    if form.get('clear_username') == 'true': changes['username'] = ''

    photo = request.files.get('photo')
    if photo:
        changes['photo_bytes'] = photo.read()

    if all_flag:
        targets = list(session_mgr._sessions.values())
    else:
        targets = [session_mgr._sessions[sid] for sid in session_ids if sid in session_mgr._sessions]

    if not targets:
        return jsonify({'success': False, 'message': 'Нет сессий для обновления'})

    def run():
        results = []
        for meta in targets:
            # Если генерация — каждой сессии свой ник/имя
            c = dict(changes)
            if form.get('gen_username') == 'true':
                c['username'] = customizer.generate_username()
            if form.get('gen_name') == 'true':
                fn, ln = customizer.generate_name()
                c['first_name'] = fn
                c['last_name']  = ln
            r = customizer.apply_profile(meta, c)
            r['session_id'] = meta['session_id']
            results.append(r)
            socketio.emit('customize_result', r)
        socketio.emit('customize_done', {'total': len(results),
                                         'ok': sum(1 for r in results if r['success'])})

    threading.Thread(target=run, daemon=True).start()
    return jsonify({'success': True, 'count': len(targets)})


# ── Settings ───────────────────────────────────────────────────────────────────

@app.route('/api/settings', methods=['GET'])
def get_settings():
    return jsonify(settings_mgr.get())


@app.route('/api/settings', methods=['POST'])
def save_settings():
    data = request.json
    # proxy приходит как вложенный объект
    return jsonify(settings_mgr.update(data))


@app.route('/api/proxy/test', methods=['POST'])
def proxy_test():
    d = request.json
    proxy = {
        'scheme':   d.get('type', 'socks5'),
        'hostname': d.get('host', ''),
        'port':     int(d.get('port', 1080)),
    }
    if d.get('username'): proxy['username'] = d['username']
    if d.get('password'): proxy['password'] = d['password']
    if d.get('secret'):   proxy['secret']   = d['secret']

    if not proxy['hostname']:
        return jsonify({'success': False, 'message': 'Укажите хост'})

    import asyncio
    from pyrogram import Client

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    async def _test():
        cfg = settings_mgr.get()
        client = Client(
            'proxy_test_session',
            api_id=21592124,
            api_hash='c2100f2a2c6beb6af0a98830509f371a',
            proxy=proxy,
            in_memory=True,
        )
        try:
            await client.connect()
            await client.disconnect()
            return {'success': True, 'message': 'Прокси работает'}
        except Exception as e:
            return {'success': False, 'message': str(e)}

    result = loop.run_until_complete(_test())
    return jsonify(result)


if __name__ == '__main__':
    socketio.run(app, host='127.0.0.1', port=5002,
                 debug=True, use_reloader=False, allow_unsafe_werkzeug=True)
