FROM node:22-bookworm-slim

WORKDIR /app

# playwright-core only: the executor connects over CDP to the Steel container's
# browser and never launches one of its own, so no browser download is needed.
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY server.js ./

# Drops all capabilities; binds the internal network only.
USER node

EXPOSE 8080
CMD ["node", "server.js"]
