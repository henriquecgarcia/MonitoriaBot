FROM alpine:3.20

RUN apk add --no-cache nodejs npm

COPY . .

RUN npm install

CMD ["npm","start"]
