FROM node:24-slim

WORKDIR /app

# Enable Corepack and use the pnpm version expected by the project
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

# Copy dependency files first for Docker layer caching
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy TypeScript configuration and source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN pnpm build

# Hugging Face Spaces
ENV NODE_ENV=production
ENV PORT=7860

EXPOSE 7860

CMD ["pnpm", "start"]

