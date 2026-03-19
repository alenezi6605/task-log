FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY src/ ./src/
COPY public/ ./public/

ENV PORT=3001
ENV DATA_DIR=/data

EXPOSE 3001

# Docker healthcheck — polls /health every 30s
# start-period: 10s to allow server startup before first check
# 3 consecutive failures → container marked unhealthy
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "src/server.js"]
