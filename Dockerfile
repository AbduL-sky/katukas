FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p data
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node","server.js"]
