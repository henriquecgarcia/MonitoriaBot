# =========================
# Build
# =========================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY assets ./assets

RUN npm run build


# =========================
# Production
# =========================
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets

USER node

CMD ["node", "dist/index.js"]