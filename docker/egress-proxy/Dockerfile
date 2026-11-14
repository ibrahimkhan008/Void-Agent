FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json server.js ./
# Zero runtime dependencies: node:crypto/net/dns only. Drops all capabilities.
USER node
EXPOSE 8080
CMD ["node", "server.js"]
