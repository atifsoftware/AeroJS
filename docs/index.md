---
layout: home

hero:
  name: "AeroJS"
  text: "Ultra-Fast Zero-Dependency Full-Stack Framework"
  tagline: Built entirely on Node.js native libraries for maximum performance and security.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/architecture
    - theme: alt
      text: View API Docs
      link: /api/

features:
  - title: Zero Dependencies
    details: Core engine built entirely using \`node:http\`, \`node:crypto\`, \`node:stream\` and native APIs. No supply-chain risks.
  - title: Built-in Active Record & GraphQL
    details: Native database ORM, robust migrations, zero-dependency GraphQL execution engine, and playground out of the box.
  - title: WebSockets & Clustering
    details: Horizontal scaling via native Redis Pub/Sub, with Presence and Private channels out of the box.
  - title: Enterprise Grade
    details: Prometheus metrics, health checks, TOTP, AES-256-GCM Vault encryption, and streaming HTTP 206 chunked uploads.
---

## Quick Start

```bash
# Initialize a new AeroJS project
npx aerojs init my-app
cd my-app
npm install
npm run build
```
