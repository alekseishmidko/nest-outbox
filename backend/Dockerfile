FROM oven/bun:1.3.14-alpine AS base

WORKDIR /app

FROM base AS dependencies

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dependencies AS development

COPY . .
EXPOSE 3000
CMD ["bun", "run", "start:dev"]

FROM dependencies AS build

COPY . .
RUN bun run build

FROM base AS production

ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["bun", "run", "start:prod"]
