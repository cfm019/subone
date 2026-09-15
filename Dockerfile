# ================= BUILD STAGE ================= #
FROM node:22-alpine AS builder

WORKDIR /app

# Install backend and frontend dependencies
COPY package*.json ./
COPY web/package*.json ./web/
RUN npm install

# Build backend
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build:server

# Build frontend
COPY web/ ./web/
RUN npm run build:web

# ================= PRODUCTION RUNTIME ================= #
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3456

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

# Copy build artifacts and templates
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist
COPY templates/ ./templates/
COPY templates/ ./templates.default/
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3456

VOLUME ["/app/data"]

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/server/index.js"]
