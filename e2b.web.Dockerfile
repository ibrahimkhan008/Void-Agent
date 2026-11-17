# Minimal Node runtime for Void Agent App Builder previews.
#
# App Builder uploads its own bounded static files and starts the fixed
# `server.js` implementation from app-build-runner.ts. The template therefore
# contains only the runtime it needs; no application source or user-selected
# startup command is baked into the image.
FROM node:22.11.0-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

USER user
WORKDIR /home/user

CMD ["sleep", "infinity"]
