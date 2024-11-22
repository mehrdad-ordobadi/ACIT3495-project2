FROM node:14-slim
WORKDIR /app
COPY package.json .
RUN npm install
COPY app.js .
COPY index.html .
CMD ["node", "app.js"]
