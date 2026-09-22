FROM golang:1.24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/bin/server ./cmd/server/main.go

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/bin/server /app/server
COPY --from=builder /app/migrations /app/migrations

ENV PORT=8080
ENV ENV=production

EXPOSE 8080

CMD ["/app/server"]
