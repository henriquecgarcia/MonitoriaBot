FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force \
    && node --input-type=module -e "await import('discord.js'); await import('mysql2/promise'); console.log('Runtime dependencies verified.')"

COPY src ./src
COPY assets ./assets

USER node

CMD ["node", "src/index.js"]
