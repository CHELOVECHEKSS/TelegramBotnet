# TelegramBotnet Toolkit

Десктопное приложение для управления Telegram аккаунтами. Flask + pywebview, тёмный UI в стиле eDEX-UI.

## Возможности

- **Сессии** — добавление по номеру телефона, импорт `.session` файлов (одиночный и массовый), удаление невалидных файлов
- **Спам** — отправка текста в ЛС/группу или `/start` боту, режим "со всех сессий" (параллельный запуск)
- **Кастомизация** — изменение имени, фамилии, username, bio, фото профиля; генерация случайных данных через `wonderwords`
- **Прокси** — SOCKS5, SOCKS4, HTTP, MTProto; применяется ко всем операциям
- **Локализация** — русский / English

##Soon...
- ** Отправка жалоб**
- ** Fun хуйня**
## Установка

```bash
pip install -r requirements.txt
```

## Запуск

```bash
# Десктопное окно (pywebview)
python main_desktop.py

# Только веб-сервер (браузер)
python app.py
```

Откроется на `http://localhost:5000`

## Структура

```
TelegramTest/
├── app.py                  # Flask + SocketIO роуты
├── main_desktop.py         # pywebview запуск
├── modules/
│   ├── sessions.py         # Управление сессиями
│   ├── spammer.py          # Модуль рассылки
│   ├── customizer.py       # Кастомизация профилей
│   └── settings.py         # Настройки + прокси
├── templates/index.html
└── static/
    ├── css/style.css
    └── js/
        ├── app.js
        ├── intro.js
        ├── exit.js
        ├── i18n.js
        └── lang/ru.js, en.js
```

## API ID / Hash

По умолчанию используются встроенные значения. Можно заменить при добавлении сессии.

## Зависимости

| Пакет | Назначение |
|---|---|
| flask + flask-socketio | Веб-сервер и real-time события |
| pyrogram + tgcrypto | Telegram MTProto клиент |
| pywebview | Десктопное окно |
| wonderwords | Генерация случайных имён/username |

## Звуки

Звуковые эффекты взяты из проекта [eDEX-UI](https://github.com/GitSquared/edex-ui) (лицензия GPL-3.0).

## Лицензия

Только для образовательных целей.
