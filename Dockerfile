FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY src ./src
COPY assets ./assets

USER node

CMD ["node", "src/index.js"]
