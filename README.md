# MonitoriaBot

Bot Discord para monitoria de matérias de programação da UNIFESP SJC.

## Docker deployment

```bash
git clone https://github.com/henriquecgarcia/MonitoriaBot.git
cd MonitoriaBot

cp .env.example .env
nano .env

docker compose up -d --build
docker compose ps
docker compose logs -f monitoria-bot
```

O serviço fica `healthy` somente quando consegue executar uma consulta no banco
configurado pelas variáveis `BOT_DB_*` do `.env`.

Para testar apenas a conexão com o banco usando a imagem já construída:

```bash
docker compose run --rm monitoria-bot npm run healthcheck
```

Se houver `ETIMEDOUT`, verifique se o host e a porta são alcançáveis pela máquina,
se o MySQL/MariaDB aceita conexões remotas e se firewall/roteador liberam a porta.

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
