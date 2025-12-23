FROM oven/bun:1.2.9-alpine AS base

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Create logs directory
RUN mkdir -p logs metrics

# Run the bot
CMD ["bun", "run", "src/index.ts"]
