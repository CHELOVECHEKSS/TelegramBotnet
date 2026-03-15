"""
TelegramBotnet Desktop — pywebview wrapper.
Run: python main_desktop.py
"""
import threading
import time
import sys
import os
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Перенаправляем вывод в лог если нет консоли (exe)
if sys.stdout is None or sys.stderr is None:
    log = open(os.path.join(os.path.expanduser('~'), 'TelegramBotnet.log'), 'w', encoding='utf-8')
    sys.stdout = sys.stderr = log

import webview

PORT = 5002
URL  = f'http://127.0.0.1:{PORT}'

flask_error = None


def start_flask():
    global flask_error
    try:
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        from app import app, socketio
        socketio.run(app, host='127.0.0.1', port=PORT,
                     use_reloader=False, log_output=False, allow_unsafe_werkzeug=True)
    except Exception:
        flask_error = traceback.format_exc()
        print('[Flask ERROR]\n' + flask_error, flush=True)


def wait_for_flask(timeout=20):
    import urllib.request
    deadline = time.time() + timeout
    while time.time() < deadline:
        if flask_error:
            return False
        try:
            urllib.request.urlopen(URL, timeout=1)
            return True
        except Exception:
            time.sleep(0.15)
    return False


if __name__ == '__main__':
    t = threading.Thread(target=start_flask, daemon=True)
    t.start()

    if not wait_for_flask():
        msg = flask_error or 'Flask не запустился за 20 секунд'
        print('FATAL: ' + msg, flush=True)
        # Показываем ошибку в окне если консоли нет
        try:
            import webview as wv
            err_win = wv.create_window(
                'Ошибка запуска',
                html=f'<body style="background:#000;color:#ff3333;font-family:monospace;padding:2rem"><pre>{msg}</pre></body>',
                width=800, height=400,
            )
            wv.start()
        except Exception:
            pass
        sys.exit(1)

    class Api:
        def exit_app(self):
            window.destroy()
            sys.exit(0)

    window = webview.create_window(
        title='TelegramBotnet',
        url=URL,
        width=1400,
        height=900,
        min_size=(1100, 700),
        background_color='#000000',
        text_select=False,
        fullscreen=False,
        js_api=Api(),
    )

    webview.start(debug=False, private_mode=False)
