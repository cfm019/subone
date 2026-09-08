# ================= BUILD STAGE ================= #
FROM node:22-alpine AS builder

WORKDIR /app

# Install backend dependencies
COPY package*.json ./
RUN npm install

# Build backend
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build:server

# Install and build frontend
COPY web/package*.json ./web/
RUN cd web && npm install
COPY web/ ./web/
RUN npm run build:web

# ================= PRODUCTION RUNTIME ================= #
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy build artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist


EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "dist/server/index.js"]
