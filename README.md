# Mnemo Cards — Telegram Mini App

Статичное веб-приложение с карточками для запоминания испанских слов.
Данные — в `cards.json`, картинки (опционально) — в `images/слово.jpg`.
Без картинки карточка просто показывает слово текстом на цветном фоне.

## Локальная проверка

Открыть `index.html` через любой локальный сервер (не через `file://`, иначе `fetch('cards.json')` не сработает):

```
cd mnemo-miniapp
python -m http.server 8080
```

Открыть `http://localhost:8080` в браузере.

---

## Шаг 1. Залить проект на GitHub

```bash
cd /c/Users/shami/mnemo-miniapp
git init
git add index.html cards.json README.md images
git commit -m "Mnemo Cards mini app"
```

Создать репозиторий на GitHub (через сайт или `gh`):

```bash
gh repo create mnemo-miniapp --public --source=. --remote=origin --push
```

Если без `gh` — создать пустой репозиторий вручную на github.com, затем:

```bash
git remote add origin https://github.com/<твой_логин>/mnemo-miniapp.git
git branch -M main
git push -u origin main
```

---

## Шаг 2. Новый поддомен DuckDNS

1. Зайти на https://www.duckdns.org, залогиниться (тем же аккаунтом, что для `erg234wefbot`).
2. В поле "sub domain" ввести `spainlearn123` → получится `spainlearn123.duckdns.org`.
3. Нажать **add domain**. IP подставить тот же, что у сервера с Hyper (тот, что уже стоит у `erg234wefbot`).
4. Обновление IP на сервере обычно делается тем же cron/скриптом, что уже поддерживает `erg234wefbot.duckdns.org` — надо просто добавить туда второй домен через запятую в URL обновления DuckDNS:

```
https://www.duckdns.org/update?domains=erg234wefbot,spainlearn123&token=<твой_token>&ip=
```

Проверить, где сейчас лежит этот update-скрипт на сервере (обычно `crontab -l` покажет строку с `curl ... duckdns.org/update`), и дописать туда `spainlearn123` через запятую.

---

## Шаг 3. Деплой файлов на сервер

Сервер тот же, что у Hyper: `/opt/hfrh54hdrtf`. Мини-апп кладём рядом, отдельной папкой, чтобы не путать с ботом:

```bash
ssh <user>@<server-ip>
sudo mkdir -p /mnt/different-project/mnemo-miniapp
sudo chown $USER:$USER /mnt/different-project/mnemo-miniapp
```

С локальной машины склонировать репозиторий прямо на сервер (или через git clone на сервере):

```bash
# на сервере
cd /mnt/different-project/mnemo-miniapp
git clone https://github.com/<твой_логин>/mnemo-miniapp.git .
```

Дальше обновление — просто `git pull` в этой папке.

---

## Шаг 4. Nginx + TLS-сертификат для нового поддомена

На сервере уже стоит nginx (обслуживает `erg234wefbot.duckdns.org`). Добавляем новый server-блок.

Создать конфиг:

```bash
sudo nano /etc/nginx/sites-available/spainlearn123
```

Содержимое (сначала БЕЗ ssl-строк — сертификата пока нет):

```nginx
server {
    listen 80;
    server_name spainlearn123.duckdns.org;

    root /mnt/different-project/mnemo-miniapp;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

Включить сайт и перезапустить nginx:

```bash
sudo ln -s /etc/nginx/sites-available/spainlearn123 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Проверить, что `http://spainlearn123.duckdns.org` уже отдаёт страницу (DNS у DuckDNS обновляется быстро, обычно сразу).

### Получить TLS-сертификат

По памяти о прошлых проблемах с сертификатом на Hyper: certbot standalone конфликтует с уже работающим nginx на порту 80. Правильный путь — **certbot с nginx-плагином**, он сам временно освобождает порт через сам nginx, а не убивает его:

```bash
sudo certbot --nginx -d spainlearn123.duckdns.org
```

Certbot сам допишет `listen 443 ssl` и пути к сертификатам в конфиг, плюс предложит редирект с 80 на 443 — соглашаться.

Продлевается автоматически таймером `certbot.timer` (уже должен стоять в системе, раз он используется для `erg234wefbot`). Проверить:

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

---

## Шаг 5. Регистрация Mini App в Telegram

1. В Telegram открыть **@BotFather**.
2. Если под этот мини-апп нужен отдельный бот — `/newbot`, задать имя и username.
   Если вешаем мини-апп на существующего бота (например, тот же, что для Hyper) — пропустить этот пункт.
3. `/mybots` → выбрать бота → **Bot Settings** → **Menu Button** → **Configure Menu Button**.
4. Ввести URL: `https://spainlearn123.duckdns.org`
5. Ввести текст кнопки, например `📚 Карточки`.

Готово — у бота в чате появится кнопка, открывающая мини-апп на весь экран Telegram.

Для теста через `/newapp` (полноценное Mini App с превью в списке приложений бота) — тот же BotFather, `/newapp`, выбрать бота, указать тот же URL и залить иконку 640×360.

---

## Шаг 6. Картинки к карточкам (опционально)

Сгенерировать изображения по промтам из `mnemo-cards-SPEC.md` (любой генератор), сохранить как:

```
images/tomar.jpg
images/hablar.jpg
images/por_qué.jpg   ← пробелы в названии слова заменяются на "_"
...
```

Имя файла = испанское слово в нижнем регистре, пробелы → `_`, расширение `.jpg` (можно `.png`, но тогда поправить путь в `index.html`, строка с `imgPath`).
Без файла карточка просто показывает слово на синем фоне — приложение не ломается.

После добавления картинок:

```bash
git add images
git commit -m "Add card images"
git push
```

На сервере:

```bash
cd /mnt/different-project/mnemo-miniapp && git pull
```

Обновление видно сразу — сервер отдаёт статику напрямую из папки, кэш чистить не надо (кроме кэша самого Telegram WebView — иногда помогает закрыть и заново открыть мини-апп).
