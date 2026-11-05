# Stage 1: build the React client
FROM node:22-slim AS build
WORKDIR /app
COPY client/package*.json client/
RUN npm --prefix client ci
COPY client client
RUN npm --prefix client run build

# Stage 2: run the API and serve the built client
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package*.json ./
RUN npm ci --omit=dev
COPY server server
COPY --from=build /app/client/dist client/dist
RUN mkdir -p data
EXPOSE 8080
CMD ["npx", "tsx", "server/src/index.ts"]
