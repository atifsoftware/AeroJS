/**
 * @file ui.ts
 * @description Swagger UI interactive HTML template generator for AeroJS.
 * Features responsive layout, dark theme accents, and live request execution.
 */

export interface SwaggerUIOptions {
  title?: string;
  specUrl: string;
}

export function renderSwaggerUI(options: SwaggerUIOptions): string {
  const { title = 'AeroJS API Documentation', specUrl } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css" />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .topbar {
      display: none !important;
    }
    .swagger-ui {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px 16px;
    }
    .swagger-ui .info {
      margin: 20px 0 30px;
    }
    .swagger-ui .info .title {
      color: #38bdf8;
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.025em;
    }
    .swagger-ui .info p, .swagger-ui .info li {
      color: #94a3b8;
      font-size: 15px;
    }
    .swagger-ui .scheme-container {
      background: #1e293b;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .swagger-ui .opblock {
      border-radius: 8px;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
      margin-bottom: 14px;
    }
    .swagger-ui .btn.authorize {
      background-color: #0284c7;
      border-color: #0284c7;
      color: #ffffff;
      border-radius: 6px;
    }
    .swagger-ui .btn.authorize svg {
      fill: #ffffff;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: "${specUrl}",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "BaseLayout",
        persistAuthorization: true,
      });
    };
  </script>
</body>
</html>`;
}
