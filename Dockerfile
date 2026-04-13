FROM node:22-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy source
COPY . .

# Expose port
EXPOSE 3001

# Start
CMD ["node", "--import", "tsx", "src/index.ts"]
