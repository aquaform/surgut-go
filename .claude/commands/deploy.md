Задеплой это приложение в интернет через Dokploy.

Шаги:
1. Убедись, что тесты зелёные и сборка проходит. Если нет — остановись и доложи.
2. Проверь, что есть Dockerfile и эндпоинт /health.
3. Используй DOKPLOY_URL и DOKPLOY_API_KEY из окружения. Не печатай значение API key.
4. Если applicationId передан в $ARGUMENTS — задеплой его. Если не передан — создай/настрой приложение через Dokploy API по требованиям job card.
5. Для публичного GitHub repo используй sourceType=git и customGitUrl, не sourceType=github, если Github Provider не настроен.
6. Опрашивай статус деплоя до success/failure. При ошибке — вытащи логи и доложи.
7. Проверь публичный /health и сообщи финальный URL.
