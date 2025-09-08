# ---- Étape 1 : build ----
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

# ---- Étape 2 : runtime ----
FROM node:20-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
