# Образ backend «Та-дам»: API + бот + напоминания в одном процессе.
# Зависимостей нет — только встроенные модули Node (node:sqlite нужен Node >= 22.5).
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production PORT=8787
# База SQLite живёт здесь — этот каталог обязательно монтировать как volume, иначе данные пропадут при пересборке
VOLUME ["/app/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "index.js"]
