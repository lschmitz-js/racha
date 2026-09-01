FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json* .npmrc* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Inside the container we always want the public registry — drop any
# project-local .npmrc that might point at a private registry.
RUN rm -f .npmrc && echo "registry=https://registry.npmjs.org/" > .npmrc

RUN npm install --workspaces --include-workspace-root

COPY packages/shared packages/shared/
COPY apps/api apps/api/
COPY apps/web apps/web/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/web
RUN npm run build --workspace=apps/api

# Prune dev deps to slim the runtime image
RUN npm prune --workspaces --include-workspace-root --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/data/racha.db

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY package.json ./

VOLUME ["/data"]
EXPOSE 8080

# Drop from root to the image's unprivileged `node` user (uid 1000). The app
# only writes to /data, so that bind-mount must be owned by uid 1000 on the host
# (chown -R 1000:1000 ./data); everything under /app is read-only to the app.
USER node

CMD ["node", "apps/api/dist/server.js"]
