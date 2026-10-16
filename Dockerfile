# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package definition files
COPY package*.json ./

# Install dependencies
RUN npm ci || npm install

# Copy all source files
COPY . .

# Build Vite frontend & compile server.ts to dist/server.cjs
RUN npm run build

# Production Runtime Stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package definitions and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production || npm install --omit=dev

# Copy compiled assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/index.html ./index.html

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/server.cjs"]
