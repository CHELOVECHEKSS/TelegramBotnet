import asyncio
import os
import random
import string
from modules.settings import SettingsManager as _SM

try:
    from wonderwords import RandomWord
    _rw = RandomWord()
    def _gen_word():
        return _rw.word(word_min_length=3, word_max_length=8)
except Exception:
    _rw = None
    def _gen_word():
        return ''.join(random.choices(string.ascii_lowercase, k=random.randint(4, 8)))

SESSIONS_DIR = os.path.join(os.path.dirname(__file__), '..', 'sessions')
_settings_cust = _SM()


def generate_username():
    """Генерирует случайный username: word + word + digits"""
    w1 = _gen_word().capitalize()
    w2 = _gen_word().capitalize()
    num = random.randint(10, 999)
    return f"{w1}{w2}{num}"


def generate_name():
    """Генерирует случайное имя: два слова"""
    first = _gen_word().capitalize()
    last  = _gen_word().capitalize()
    return first, last


def _make_client(session_meta):
    from pyrogram import Client
    proxy = _settings_cust.get_proxy_dict()
    session_name = os.path.join(SESSIONS_DIR, f'session_{session_meta["session_id"]}')
    return Client(
        session_name,
        api_id=int(session_meta['api_id']),
        api_hash=session_meta['api_hash'],
        test_mode=session_meta.get('test_mode', False),
        proxy=proxy,
    )


def apply_profile(session_meta: dict, changes: dict) -> dict:
    """
    changes может содержать:
      first_name, last_name, bio, username
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    async def _run():
        client = _make_client(session_meta)
        results = {}
        try:
            await client.connect()

            # Имя / фамилия / bio
            update_kwargs = {}
            if 'first_name' in changes and changes['first_name']:
                update_kwargs['first_name'] = changes['first_name']
            if 'last_name' in changes:
                update_kwargs['last_name'] = changes['last_name']
            if 'bio' in changes:
                update_kwargs['bio'] = changes['bio']
            if update_kwargs:
                await client.update_profile(**update_kwargs)
                results['profile'] = 'ok'

            # Username
            if 'username' in changes and changes['username'] is not None:
                await client.set_username(changes['username'])
                results['username'] = 'ok'

            # Фото профиля
            if 'photo_bytes' in changes and changes['photo_bytes']:
                import tempfile
                with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                    tmp.write(changes['photo_bytes'])
                    tmp_path = tmp.name
                await client.set_profile_photo(photo=tmp_path)
                os.unlink(tmp_path)
                results['photo'] = 'ok'

            me = await client.get_me()
            await client.disconnect()
            return {
                'success': True,
                'results': results,
                'message': f'Профиль обновлён: {me.first_name} (@{me.username})',
                'me': {
                    'first_name': me.first_name or '',
                    'last_name': me.last_name or '',
                    'username': me.username or '',
                    'user_id': me.id,
                }
            }
        except Exception as e:
            try:
                await client.disconnect()
            except Exception:
                pass
            return {'success': False, 'message': str(e)}

    return loop.run_until_complete(_run())
