FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY server.js ./
COPY public ./public
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server.js"]
