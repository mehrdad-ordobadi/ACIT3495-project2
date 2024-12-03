FROM node:14-slim
WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install
COPY app.js .
COPY index.html .
CMD ["node", "app.js"]