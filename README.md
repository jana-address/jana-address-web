# jana-address-web

Веб-интерфейс Jana Address (React 19.2 + Vite 8.2, сборка в nginx 1.30).

Запускается вместе с API из репозитория `jana-address-api`, где этот репо подключён как
submodule `web/`. Отдельно для разработки:

```bash
npm ci
npm run dev   # http://localhost:5173, /api проксируется на http://localhost:8080
```

Шрифт Inter подключён локально (`@fontsource-variable/inter`): интерфейс не делает
внешних запросов и работает без сети.
