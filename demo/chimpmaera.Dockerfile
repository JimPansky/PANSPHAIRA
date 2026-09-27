FROM node:24.14.1-bookworm-slim@sha256:e484ae3f1e3c378021c967fd42254f343c302a9263e412280eac32bf5bca7008 AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY packages ./packages
COPY demo/tsconfig.runtime.json ./tsconfig.json
RUN npm exec -- tsc -p tsconfig.json

FROM node:24.14.1-bookworm-slim@sha256:e484ae3f1e3c378021c967fd42254f343c302a9263e412280eac32bf5bca7008
LABEL io.chimpmaera.demo.owner="chimpmaera-v01-playable-installer"
ENV NODE_ENV=production
WORKDIR /opt/chimpmaera
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force \
  && mkdir -p /var/lib/chimpmaera \
  && chown node:node /var/lib/chimpmaera
COPY --from=build /src/dist ./dist
COPY examples/poc-release/showcase-v1.json ./examples/poc-release/showcase-v1.json
COPY demo/manifests ./manifests
COPY demo/runtime/server.mjs ./server.mjs
COPY demo/runtime/enforcement-gate.mjs ./enforcement-gate.mjs
COPY demo/runtime/local-journal-owner.mjs ./local-journal-owner.mjs
COPY demo/runtime/admin-ai-poc.mjs ./admin-ai-poc.mjs
COPY demo/runtime/admin-ai-policy.mjs ./admin-ai-policy.mjs
COPY demo/runtime/authoritative-approval-snapshot.mjs ./authoritative-approval-snapshot.mjs
COPY demo/runtime/policy-evaluator.mjs ./policy-evaluator.mjs
COPY demo/runtime/policy-generation-fence.mjs ./policy-generation-fence.mjs
COPY demo/runtime/paperless-ngx-zoo-adapter.mjs ./paperless-ngx-zoo-adapter.mjs
COPY demo/runtime/approval-workbench.mjs ./approval-workbench.mjs
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
