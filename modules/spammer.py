import asyncio
import os
from pyrogram import Client
from pyrogram.errors import FloodWait, UserIsBlocked, PeerIdInvalid, UsernameInvalid
from modules.settings import SettingsManager as _SM

SESSIONS_DIR = os.path.join(os.path.dirname(__file__), '..', 'sessions')
_settings_sm = _SM()

# Активные задачи спама: task_id -> {'running': bool}
_tasks = {}


def stop_spam(task_id: str):
    if task_id in _tasks:
        _tasks[task_id]['running'] = False


def run_spam(task_id: str, session_meta: dict, target: str, mode: str,
             message: str, count: int, delay: float, socketio):
    """
    mode: 'message'  — обычный текст в лс/группу
          'start'    — /start боту (многократно)
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(
        _spam_async(task_id, session_meta, target, mode, message, count, delay, socketio)
    )


async def _spam_async(task_id, session_meta, target, mode, message, count, delay, socketio):
    _tasks[task_id] = {'running': True}

    proxy = _settings_sm.get_proxy_dict()
    session_name = os.path.join(SESSIONS_DIR, f'session_{session_meta["session_id"]}')
    client = Client(
        session_name,
        api_id=int(session_meta['api_id']),
        api_hash=session_meta['api_hash'],
        test_mode=session_meta.get('test_mode', False),
        proxy=proxy,
    )

    def emit(data):
        socketio.emit('spam_progress', data)

    try:
        await client.connect()
        sent = 0
        errors = 0

        for i in range(count):
            if not _tasks[task_id]['running']:
                emit({'task_id': task_id, 'status': 'stopped', 'sent': sent, 'errors': errors,
                      'message': f'Остановлено. Отправлено: {sent}'})
                break

            try:
                if mode == 'start':
                    # /start боту — join + send_message с командой
                    await client.send_message(target, '/start')
                else:
                    await client.send_message(target, message)

                sent += 1
                emit({'task_id': task_id, 'status': 'progress', 'sent': sent,
                      'total': count, 'errors': errors})

                if i < count - 1:
                    await asyncio.sleep(delay)

            except FloodWait as e:
                emit({'task_id': task_id, 'status': 'flood_wait', 'sent': sent,
                      'errors': errors, 'message': f'FloodWait {e.value}s, ждём...'})
                await asyncio.sleep(e.value)
                # Повторяем эту итерацию
                i -= 1
                continue

            except (UserIsBlocked, PeerIdInvalid, UsernameInvalid) as e:
                errors += 1
                emit({'task_id': task_id, 'status': 'error', 'sent': sent,
                      'errors': errors, 'message': str(e)})
                break

            except Exception as e:
                errors += 1
                emit({'task_id': task_id, 'status': 'error', 'sent': sent,
                      'errors': errors, 'message': str(e)})

        else:
            emit({'task_id': task_id, 'status': 'done', 'sent': sent,
                  'errors': errors, 'message': f'Готово. Отправлено: {sent}, ошибок: {errors}'})

    except Exception as e:
        emit({'task_id': task_id, 'status': 'error', 'sent': 0,
              'errors': 1, 'message': f'Ошибка подключения: {e}'})
    finally:
        try:
            await client.disconnect()
        except Exception:
            pass
        _tasks.pop(task_id, None)
