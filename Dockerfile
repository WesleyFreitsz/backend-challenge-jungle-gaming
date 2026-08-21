FROM oven/bun:1.2-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source code and build
COPY . .
RUN bun run build

# Run application
EXPOSE 3000
CMD ["bun", "run", "start"]
