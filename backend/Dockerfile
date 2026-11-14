FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
COPY migrations ./migrations
RUN CGO_ENABLED=0 go build -o /api ./cmd/api && mkdir /photos

FROM scratch
COPY --from=build /api /api
COPY --from=build --chown=65532:65532 /photos /photos
USER 65532:65532
ENTRYPOINT ["/api"]
