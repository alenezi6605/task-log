FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY src/ ./src/
COPY public/ ./public/

ENV PORT=3001
ENV DATA_DIR=/data

EXPOSE 3001

CMD ["node", "src/server.js"]
