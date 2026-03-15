import json
import os

SETTINGS_FILE = os.path.join(os.path.dirname(__file__), '..', 'tg_config.json')

DEFAULTS = {
    'test_mode': False,
    'language': 'ru',
    'sounds': True,
    'notifications': True,
    'proxy': {
        'enabled': False,
        'type': 'socks5',   # socks5 | socks4 | http | mtproto
        'host': '',
        'port': 1080,
        'username': '',
        'password': '',
        'secret': '',       # только для MTProto
    }
}


class SettingsManager:
    def __init__(self):
        self._data = dict(DEFAULTS)
        self._load()

    def _load(self):
        try:
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                self._data.update(json.load(f))
        except Exception:
            pass

    def _save(self):
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(self._data, f, indent=2, ensure_ascii=False)

    def get(self):
        return dict(self._data)

    def update(self, data: dict):
        self._data.update(data)
        self._save()
        return {'success': True}

    def get_proxy_dict(self):
        """Возвращает dict для передачи в pyrogram Client(proxy=...)"""
        p = self._data.get('proxy', {})
        if not p.get('enabled') or not p.get('host'):
            return None
        proxy = {
            'scheme': p['type'],   # socks5 / socks4 / http / mtproto
            'hostname': p['host'],
            'port': int(p.get('port', 1080)),
        }
        if p.get('username'):
            proxy['username'] = p['username']
        if p.get('password'):
            proxy['password'] = p['password']
        if p['type'] == 'mtproto' and p.get('secret'):
            proxy['secret'] = p['secret']
        return proxy
