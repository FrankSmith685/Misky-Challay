# =============================================================================
# Cliente web de Verde Bowl
#
# Vite compila a HTML/CSS/JS estatico: en produccion no hace falta Node, solo un
# servidor de ficheros que ademas sepa reenviar /api al backend.
#
#   docker build -f frontend/Dockerfile -t verde-bowl-web .
# =============================================================================

# --- Etapa 1: compilar -------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci --workspace frontend --include-workspace-root

COPY frontend ./frontend
COPY scripts/check-admin-nav.mjs scripts/check-misky-ar-assets.cjs ./scripts/

# La URL del API se cablea en tiempo de COMPILACION (Vite sustituye import.meta.env
# al empaquetar). Por defecto queda relativa, que es lo correcto cuando nginx sirve
# el sitio y hace de proxy: mismo origen, sin CORS y sin exponer el backend.
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_PUBLIC_WEB_URL=
ENV VITE_PUBLIC_WEB_URL=$VITE_PUBLIC_WEB_URL

RUN npm run build --workspace frontend


# --- Etapa 2: servir ---------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
