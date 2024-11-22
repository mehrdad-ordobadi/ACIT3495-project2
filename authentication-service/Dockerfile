FROM node:14-slim
WORKDIR /app
COPY package.json .
RUN npm install
COPY auth_service.js .
CMD ["node", "auth_service.js"]