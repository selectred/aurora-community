# Aurora backend in browser mode (no Tauri), for docker-compose.yml and k8s/.
#
# The official Playwright image ships Node plus the browsers that match the
# pinned playwright version, so the first-run "Test Engine" step finds them
# already installed. Keep the tag in step with "playwright" in package.json.
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app

# AURORA_DATA_DIR puts the server in desktop mode: SQLite database, prompts,
# evidence and test data all live under /data, and pending Prisma migrations
# run in-process at start-up.
ENV PORT=3000 \
    AURORA_DATA_DIR=/data \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Install dev dependencies too: prisma.config.ts loads dotenv, and the Prisma
# CLI reads that config during generate.
COPY package*.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
RUN DATABASE_URL=file:/data/aurora.db npx prisma generate \
 && printf "module.exports={buildTime:'%s',buildTarget:'docker'}\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > buildinfo.js

ENV NODE_ENV=production

EXPOSE 3000
VOLUME /data

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# A virtual display lets headed launches (recorder, headed sessions) start
# instead of crashing. Nobody can see or drive it. Xvfb is started directly:
# xvfb-run hangs when it runs as PID 1.
ENV DISPLAY=:99
CMD ["sh", "-c", "Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp >/dev/null 2>&1 & exec node server.js"]
