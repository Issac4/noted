FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace configuration files
COPY package.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install dependencies across workspaces
RUN npm install

# Copy full source tree
COPY shared ./shared
COPY server ./server
COPY client ./client

# Build shared types, frontend Vite bundle, and backend server
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/drizzle ./server/drizzle
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 3000
CMD ["node", "server/dist/index.js"]
