FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3-venv \
    && rm -rf /var/lib/apt/lists/*
COPY inference/requirements.txt /tmp/plantcare-inference-requirements.txt
RUN python3 -m venv /opt/plantcare-inference \
    && /opt/plantcare-inference/bin/pip install --no-cache-dir --only-binary=:all: -r /tmp/plantcare-inference-requirements.txt \
    && rm /tmp/plantcare-inference-requirements.txt
COPY inference/app.py inference/screening.py /app/inference/
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY --chmod=0555 start-render.sh /app/start-render.sh
COPY --chmod=0555 docker-entrypoint.sh /usr/local/bin/plantcare-entrypoint
USER node
EXPOSE 3000
ENTRYPOINT ["/bin/sh", "/usr/local/bin/plantcare-entrypoint"]
CMD ["node", "dist/server.js"]
