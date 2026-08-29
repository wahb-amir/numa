FROM node:24.18.0-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

COPY package.json pnpm-lock.yaml .npmrc pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copy application files
COPY tsconfig.json ./
COPY src ./src
COPY supabase ./supabase

RUN pnpm build

ENV NODE_ENV=production
ENV PORT=7860

EXPOSE 7860

CMD ["pnpm", "start"]

