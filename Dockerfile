FROM node:10.15.2

RUN apt-get update && apt-get -y upgrade \
        && apt-get install -y sqlite3 libsqlite3-dev

WORKDIR /db
WORKDIR /uploads
WORKDIR /app
COPY . .
RUN yarn install
RUN cd client && yarn install \
 && cd ../server && yarn install \
 && cd ../client && yarn build

ENV DATABASE_FILE_PATH=/db/db.sqlite \
    UPLOADS_PATH=/uploads \
    PORT=3000 \
    NODE_ENV=production

EXPOSE 3000

CMD ["node", "server/src/index.js"]
