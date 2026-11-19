# MinIO Community is distributed as source. These commits match the server's 2025-10-15
# and client's 2025-04-16 releases. Go verifies modules with its checksum database.
FROM golang:1.24-alpine AS build
ENV CGO_ENABLED=0 GOBIN=/out
RUN go install -trimpath -ldflags='-s -w' github.com/minio/minio@v0.0.0-20251015172955-9e49d5e7a648 \
    && go install -trimpath -ldflags='-s -w' github.com/minio/mc@v0.0.0-20250416181326-b00526b153a3

FROM alpine:3.22
RUN apk add --no-cache ca-certificates curl \
    && mkdir /data \
    && chown 1000:1000 /data
COPY --from=build /out/minio /out/mc /usr/local/bin/
ENV MC_CONFIG_DIR=/tmp/.mc
USER 1000:1000
EXPOSE 9000
