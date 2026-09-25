FROM node:20-slim

WORKDIR /app

# Skip heavy Chromium download during Cloud Run container build
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src
COPY data ./data
COPY screenshots ./screenshots

EXPOSE 8080

CMD ["node", "src/mcp-server/server.mjs"]
