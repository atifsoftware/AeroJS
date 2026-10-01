import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "AeroJS",
  description: "Ultra-Fast Zero-Dependency Framework",
  appearance: 'dark',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/architecture' },
      { text: 'API Reference', link: '/api/' },
      { text: 'Architecture', link: '/guide/architecture' },
      { text: 'GitHub', link: 'https://github.com/aerojs/aero' }
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/index' }
        ]
      },
      {
        text: 'Core Architecture',
        items: [
          { text: 'Architecture & Pipeline', link: '/guide/architecture' },
          { text: 'Routing & Controllers', link: '/guide/routing' }
        ]
      },
      {
        text: 'Database & ORM',
        items: [
          { text: 'Active Record & Migrations', link: '/guide/database' },
          { text: 'Seeders & Factories', link: '/guide/seeders-factories' }
        ]
      },
      {
        text: 'Storage & Caching',
        items: [
          { text: 'Multi-Store Cache', link: '/guide/cache' },
          { text: 'Chunked Uploads & Streaming', link: '/guide/storage' }
        ]
      },
      {
        text: 'Networking & Real-Time',
        items: [
          { text: 'Native Redis Client', link: '/guide/redis' },
          { text: 'WebSockets & Clustering', link: '/guide/websockets' }
        ]
      },
      {
        text: 'Security',
        items: [
          { text: 'Advanced Security', link: '/guide/security' }
        ]
      },
      {
        text: 'API & Integrations',
        items: [
          { text: 'GraphQL Engine', link: '/guide/graphql' },
          { text: 'Diagnostics & Prometheus', link: '/guide/diagnostics' }
        ]
      },
      {
        text: 'Frontend & Views',
        items: [
          { text: 'Inertia & Views', link: '/guide/views-inertia' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/aerojs/aero' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present AeroJS Contributors'
    }
  }
})
