# Third-party notices

PanSphaira project-authored work is licensed under Apache License 2.0. The
pinned JavaScript development/runtime dependency set in `package-lock.json`
includes these direct dependencies and selected transitive components:

| Package | Version | License |
| --- | ---: | --- |
| `ajv` | 8.20.0 | MIT |
| `ajv-formats` | 3.0.1 | MIT |
| `fast-deep-equal` | 3.1.3 | MIT |
| `fast-uri` | 3.1.4 | BSD-3-Clause |
| `json-schema-traverse` | 1.0.0 | MIT |
| `require-from-string` | 2.0.2 | MIT |
| `@types/node` | 24.10.1 | MIT |
| `typescript` | 5.9.3 | Apache-2.0 |
| `playwright` | 1.63.0 | Apache-2.0 |
| `playwright-core` | 1.63.0 | Apache-2.0 |
| `undici-types` | 7.16.0 | MIT |
| `pg` | 8.16.3 | MIT |
| `@types/pg` | 8.15.1 | MIT |
| `embedded-postgres` | 18.4.0-beta.17 | MIT |
| `@embedded-postgres/linux-x64` | 18.4.0-beta.17 | MIT |
| `pg-connection-string` | 2.14.0 | MIT |
| `pg-pool` | 3.14.0 | MIT |
| `pg-protocol` | 1.16.0 | MIT |
| `pg-types` | 4.1.0 | MIT |
| `pgpass` | 1.0.5 | MIT |
| `async-exit-hook` | 2.0.1 | MIT |

The playable demo references pinned container images for Node.js, MariaDB,
EspoCRM and Dolibarr. The optional video reference image installs Debian
Bookworm packages including Python, PyYAML, FFmpeg and CA certificates.
Those components remain under their respective upstream licenses. Building or
redistributing a container image may require retaining additional notices
from the resulting image.

Separated external video artifacts carry their own media-license boundary.
Apache-2.0 grants no trademark, word-mark, logo, endorsement or broader media
grant for those assets.
