import json
import os
import asyncio
import threading
import uuid
from pyrogram import Client
from pyrogram.errors import (
    SessionPasswordNeeded, PhoneCodeInvalid, PhoneCodeExpired,
    FloodWait, ApiIdInvalid
)
from modules.settings import SettingsManager

SESSIONS_DIR = os.path.join(os.path.dirname(__file__), '..', 'sessions')
SESSIONS_FILE = os.path.join(os.path.dirname(__file__), '..', 'sessions_db.json')

os.makedirs(SESSIONS_DIR, exist_ok=True)

_settings = SettingsManager()


def _proxy():
    return _settings.get_proxy_dict()


class SessionManager:
    def __init__(self, socketio=None):
        self.socketio = socketio
        self._sessions = {}       # session_id -> metadata
        self._pending = {}        # session_id -> pyrogram Client (awaiting code)
        self._loops = {}          # session_id -> asyncio event loop
        self._load()

    def _load(self):
        try:
            with open(SESSIONS_FILE, 'r', encoding='utf-8') as f:
                self._sessions = json.load(f)
        except Exception:
            self._sessions = {}

    def _save(self):
        with open(SESSIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump(self._sessions, f, indent=2, ensure_ascii=False)

    def list_sessions(self):
        return list(self._sessions.values())

    def add_session(self, phone: str, api_id: str, api_hash: str, test_mode: bool):
        session_id = str(uuid.uuid4())[:8]
        session_name = os.path.join(SESSIONS_DIR, f'session_{session_id}')

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        self._loops[session_id] = loop

        client = Client(
            session_name,
            api_id=int(api_id),
            api_hash=api_hash,
            phone_number=phone,
            test_mode=test_mode,
            in_memory=False,
            proxy=_proxy(),
        )

        async def _connect():
            try:
                await client.connect()
                sent = await client.send_code(phone)
                self._pending[session_id] = {
                    'client': client,
                    'phone_code_hash': sent.phone_code_hash,
                    'phone': phone,
                    'api_id': api_id,
                    'api_hash': api_hash,
                    'test_mode': test_mode,
                }
                return {
                    'success': True,
                    'status': 'code_sent',
                    'session_id': session_id,
                    'message': f'Код отправлен на {phone}',
                    'test_mode': test_mode,
                }
            except FloodWait as e:
                return {'success': False, 'message': f'FloodWait: подождите {e.value} сек'}
            except ApiIdInvalid:
                return {'success': False, 'message': 'Неверный API ID или API Hash'}
            except Exception as e:
                return {'success': False, 'message': str(e)}

        result = loop.run_until_complete(_connect())
        return result

    def verify_code(self, session_id: str, code: str):
        pending = self._pending.get(session_id)
        if not pending:
            return {'success': False, 'message': 'Сессия не найдена или уже подтверждена'}

        client = pending['client']
        loop = self._loops.get(session_id, asyncio.new_event_loop())
        asyncio.set_event_loop(loop)

        async def _sign_in():
            try:
                await client.sign_in(
                    pending['phone'],
                    pending['phone_code_hash'],
                    code,
                )
                me = await client.get_me()
                await client.disconnect()

                meta = {
                    'session_id': session_id,
                    'phone': pending['phone'],
                    'api_id': pending['api_id'],
                    'api_hash': pending['api_hash'],
                    'test_mode': pending['test_mode'],
                    'username': me.username or '',
                    'first_name': me.first_name or '',
                    'user_id': me.id,
                    'status': 'active',
                }
                self._sessions[session_id] = meta
                self._save()
                del self._pending[session_id]

                return {
                    'success': True,
                    'status': 'authorized',
                    'session_id': session_id,
                    'message': f'Авторизован как {me.first_name} (@{me.username})',
                    'meta': meta,
                }
            except PhoneCodeInvalid:
                return {'success': False, 'message': 'Неверный код'}
            except PhoneCodeExpired:
                return {'success': False, 'message': 'Код истёк, попробуйте снова'}
            except SessionPasswordNeeded:
                # Сохраняем клиент для 2FA — не удаляем из pending
                return {'success': False, 'status': '2fa_required', 'session_id': session_id, 'message': 'Требуется пароль 2FA'}
            except Exception as e:
                return {'success': False, 'message': str(e)}

        return loop.run_until_complete(_sign_in())

    def verify_2fa(self, session_id: str, password: str):
        pending = self._pending.get(session_id)
        if not pending:
            return {'success': False, 'message': 'Сессия не найдена'}

        client = pending['client']
        loop = self._loops.get(session_id, asyncio.new_event_loop())
        asyncio.set_event_loop(loop)

        async def _check_password():
            try:
                await client.check_password(password)
                me = await client.get_me()
                await client.disconnect()

                meta = {
                    'session_id': session_id,
                    'phone': pending['phone'],
                    'api_id': pending['api_id'],
                    'api_hash': pending['api_hash'],
                    'test_mode': pending['test_mode'],
                    'username': me.username or '',
                    'first_name': me.first_name or '',
                    'user_id': me.id,
                    'status': 'active',
                }
                self._sessions[session_id] = meta
                self._save()
                del self._pending[session_id]

                return {
                    'success': True,
                    'status': 'authorized',
                    'session_id': session_id,
                    'message': f'Авторизован как {me.first_name} (@{me.username})',
                    'meta': meta,
                }
            except Exception as e:
                return {'success': False, 'message': f'Неверный пароль 2FA: {e}'}

        return loop.run_until_complete(_check_password())

    def import_session(self, file_bytes: bytes, filename: str, api_id: str, api_hash: str, test_mode: bool):
        """Импорт готового .session файла pyrogram"""
        session_id = str(uuid.uuid4())[:8]
        dest = os.path.join(SESSIONS_DIR, f'session_{session_id}.session')
        with open(dest, 'wb') as f:
            f.write(file_bytes)

        session_name = os.path.join(SESSIONS_DIR, f'session_{session_id}')
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        async def _check():
            client = Client(
                session_name,
                api_id=int(api_id),
                api_hash=api_hash,
                test_mode=test_mode,
                proxy=_proxy(),
            )
            try:
                await client.connect()
                me = await client.get_me()
                return me
            except Exception as e:
                return e
            finally:
                try:
                    await client.disconnect()
                except Exception:
                    pass

        result = loop.run_until_complete(_check())

        if isinstance(result, Exception):
            # На Windows файл может быть ещё залочен — пробуем с retry
            import time
            for _ in range(5):
                try:
                    os.remove(dest)
                    break
                except PermissionError:
                    time.sleep(0.3)
            return {'success': False, 'message': f'Невалидная сессия: {result}'}

        me = result
        meta = {
            'session_id': session_id,
            'phone': me.phone_number or '',
            'api_id': api_id,
            'api_hash': api_hash,
            'test_mode': test_mode,
            'username': me.username or '',
            'first_name': me.first_name or '',
            'user_id': me.id,
            'status': 'active',
            'imported': True,
            'original_filename': filename,
        }
        self._sessions[session_id] = meta
        self._save()
        return {'success': True, 'message': f'Импортирована: {me.first_name} (@{me.username})', 'meta': meta}

    def cleanup_orphans(self):
        """Удаляет .session файлы которых нет в sessions_db.json"""
        known = {f'session_{sid}.session' for sid in self._sessions}
        removed = []
        errors = []
        import time
        for fname in os.listdir(SESSIONS_DIR):
            if not fname.endswith('.session'):
                continue
            if fname not in known:
                fpath = os.path.join(SESSIONS_DIR, fname)
                for _ in range(5):
                    try:
                        os.remove(fpath)
                        removed.append(fname)
                        break
                    except PermissionError:
                        time.sleep(0.3)
                else:
                    errors.append(fname)
        return {'success': True, 'removed': removed, 'errors': errors,
                'message': f'Удалено: {len(removed)}, ошибок: {len(errors)}'}

    def delete_session(self, session_id: str):
        if session_id in self._sessions:
            del self._sessions[session_id]
            self._save()
            # Remove session file
            session_file = os.path.join(SESSIONS_DIR, f'session_{session_id}.session')
            if os.path.exists(session_file):
                os.remove(session_file)
            return {'success': True, 'message': 'Сессия удалена'}
        return {'success': False, 'message': 'Сессия не найдена'}

    def check_status(self, session_id: str):
        meta = self._sessions.get(session_id)
        if not meta:
            return {'success': False, 'message': 'Сессия не найдена'}

        session_name = os.path.join(SESSIONS_DIR, f'session_{session_id}')
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        async def _check():
            client = Client(
                session_name,
                api_id=int(meta['api_id']),
                api_hash=meta['api_hash'],
                test_mode=meta.get('test_mode', False),
                proxy=_proxy(),
            )
            try:
                await client.connect()
                me = await client.get_me()
                await client.disconnect()
                return {'success': True, 'status': 'active', 'session_id': session_id,
                        'message': f'Активна: {me.first_name}'}
            except Exception as e:
                return {'success': False, 'status': 'error', 'session_id': session_id,
                        'message': str(e)}

        return loop.run_until_complete(_check())
