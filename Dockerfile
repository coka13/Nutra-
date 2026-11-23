FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV DATABASE_URL=file:/data/nutri.db NEXT_TELEMETRY_DISABLED=1
RUN npm run db:generate && npm run build && mkdir -p /data && chown -R node:node /app /data
ENV NODE_ENV=production DEMO_ENABLED=false
USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && npm run start"]
