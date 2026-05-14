FROM node:20-slim

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
