# Local synthetic qualification only, not a distributable deployment image.
FROM node:24.19.0-bookworm@sha256:4196d66a565c6f195728d9952f161f4adfe2ad753052a08b7ec7f1c5a6bda42b AS node
FROM apache/superset:6.1.0@sha256:fb3464528ec7076f91195f0ff7835755aa023e281f1bb78a84782ce7a36b3705
USER root
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/bin/git /usr/bin/git
COPY --from=node /usr/share/git-core /usr/share/git-core
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && node --version && git --version \
 && /app/.venv/bin/python -c 'import importlib.metadata; assert importlib.metadata.version("apache-superset") == "6.1.0"'
ENV PYTHONDONTWRITEBYTECODE=1
USER 1000:1000
ENTRYPOINT []
CMD ["node", "--version"]
