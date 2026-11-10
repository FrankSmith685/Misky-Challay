# =============================================================================
# API de Verde Bowl
#
# Construccion en dos etapas: la imagen final no lleva ni el compilador de
# TypeScript ni las dependencias de desarrollo. Se construye desde la RAIZ del
# monorepo, porque el lockfile y los workspaces viven ahi:
#
#   docker build -f backend/Dockerfile -t verde-bowl-api .
# =============================================================================

# --- Etapa 1: compilar -------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Solo los manifiestos primero: mientras no cambien, Docker reutiliza la capa de
# dependencias y la reconstruccion baja de minutos a segundos.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# El backend no necesita las dependencias del frontend para compilar.
RUN npm ci --workspace backend --include-workspace-root

COPY backend ./backend

RUN npm run build --workspace backend

# Se reinstala solo lo de produccion: tsc, eslint y compania no viajan a la imagen final.
RUN npm ci --workspace backend --include-workspace-root --omit=dev


# --- Etapa 2: ejecutar -------------------------------------------------------
FROM node:22-alpine AS runtime

# tini como PID 1: Node no reenvia bien las senales cuando es el proceso 1, y sin
# esto un SIGTERM del orquestador no llega al apagado ordenado.
# mysql-client lo usa el script de backup.
RUN apk add --no-cache tini mysql-client

ENV NODE_ENV=production \
    TZ=America/Lima

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/scripts ./backend/scripts
COPY --from=build /app/backend/package.json ./backend/
COPY --from=build /app/package.json ./

# Las imagenes subidas se montan aqui. Es un volumen a proposito: el sistema de
# archivos del contenedor es efimero y cada despliegue borraria el catalogo.
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# node:alpine ya trae el usuario `node`. Ejecutar como root dentro del contenedor
# convierte cualquier ejecucion remota de codigo en control total de la imagen.
USER node

EXPOSE 4000

# La sonda que no toca la base de datos: si esta falla, el proceso esta colgado.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
# Ejecuta las migraciones antes de iniciar la API. Al estar definido como
# arreglo JSON, Render no tiene que interpretar ningun `&&` en su panel.
CMD ["sh", "-c", "node backend/dist/database/migrate.js up && exec node backend/dist/index.js"]
