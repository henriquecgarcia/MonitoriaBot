# MonitoriaBot

Bot Discord para monitoria de matérias de programação da UNIFESP SJC.

## Docker deployment

```bash
git clone https://github.com/henriquecgarcia/MonitoriaBot.git
cd MonitoriaBot

cp .env.example .env
nano .env

docker compose up -d --build
docker compose logs -f monitoria-bot
```

Para atualizar:

```bash
git pull
docker compose up -d --build
```

Para parar:

```bash
docker compose down
```

Para reiniciar:

```bash
docker compose restart monitoria-bot
```
