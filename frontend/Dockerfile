# Stage 1: build the two React bundles.
FROM node:22.12.0-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Stage 2: nginx serves the bundles over TLS and proxies /api to FastAPI.
FROM nginx:1.27.3-alpine
RUN apk add --no-cache openssl
COPY --from=build /src/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY tls-entrypoint.sh /docker-entrypoint.d/05-self-signed-cert.sh
RUN chmod +x /docker-entrypoint.d/05-self-signed-cert.sh
EXPOSE 80 443
