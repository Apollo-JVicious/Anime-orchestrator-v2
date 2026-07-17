FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Copy only build inputs so local environment files and repository metadata never
# enter an image layer.
COPY index.html metadata.json server.ts tsconfig.json vite.config.ts ./
COPY assets ./assets
COPY server ./server
COPY src ./src

RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    INTEGRATIONS_DB_PATH=/app/data/integrations.sqlite

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 3000
VOLUME ["/app/data"]
STOPSIGNAL SIGTERM

CMD ["node", "dist/server.cjs"]
