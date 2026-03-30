FROM node:24-bookworm-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 8080

CMD ["npm", "run", "start"]
