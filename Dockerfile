FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv curl unzip procps \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN npm install -g openclaw@2026.2.15

WORKDIR /app/monitor-api
COPY openclaw-monitor-api/package.json ./
RUN npm install --production
COPY openclaw-monitor-api/ ./

COPY scripts/ /app/scripts/

WORKDIR /app
COPY entrypoint.sh ./
RUN chmod +x /app/entrypoint.sh

EXPOSE 8080

CMD ["/app/entrypoint.sh"]
