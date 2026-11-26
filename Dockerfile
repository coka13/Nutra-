FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV DATABASE_URL=file:/data/nutri.db NEXT_TELEMETRY_DISABLED=1
RUN npm run db:generate && npm run build && mkdir -p /data && chown -R node:node /app /data
ARG GIT_SHA=""
ENV NODE_ENV=production DEMO_ENABLED=false GIT_SHA=$GIT_SHA
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && npm run start"]
