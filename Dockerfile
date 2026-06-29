# Production Dockerfile for RedisVue Modern
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Install build dependencies if needed (alpine is lightweight)
RUN apk add --no-cache curl

# Copy dependencies manifest
COPY package*.json ./

# Install dependencies (including devDependencies for compiling)
RUN npm install

# Copy the rest of the application files
COPY . .

# Build Vite static assets and compile the server using esbuild
RUN npm run build

# Remove unnecessary source files to keep container light (optional but clean)
# RUN rm -rf src tsconfig.json vite.config.ts

# Expose port 3000 (standard ingress for this environment)
EXPOSE 3000

# Environment setup
ENV NODE_ENV=production
ENV PORT=3000

# Start server using the compiled CJS output
CMD ["npm", "run", "start"]
