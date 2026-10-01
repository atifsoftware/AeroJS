/**
 * @file plugin.ts
 * @description AeroJS Plugin for executing GraphQL queries and serving the interactive GraphQL Playground.
 */

import { Parser } from './parser.js';
import { execute } from './executor.js';
import { GraphQLSchema } from './schema.js';

export interface GraphQLPluginOptions {
  schema: GraphQLSchema;
  path?: string;
  playground?: boolean;
  context?: (ctx: any) => any;
}

export function graphqlPlugin(options: GraphQLPluginOptions) {
  const routePath = options.path || '/graphql';
  const enablePlayground = options.playground !== false;

  return function (app: any) {
    // API Endpoint for executing queries
    app.post(routePath, async (ctx: any) => {
      const body = (ctx.body || {}) as any;
      const { query, variables, operationName } = body;

      if (!query) {
        ctx.res.status(400).json({ errors: [{ message: 'Must provide query string.' }] });
        return;
      }

      try {
        const parser = new Parser(query);
        const document = parser.parseDocument();

        const contextValue = options.context ? await options.context(ctx) : ctx;

        const result = await execute({
          schema: options.schema,
          document,
          contextValue,
          variableValues: variables,
          operationName
        });

        ctx.res.status(200).json(result);
      } catch (err: any) {
        ctx.res.status(400).json({ errors: [{ message: err.message || String(err) }] });
      }
    });

    // Interactive GraphQL Playground (GraphiQL alternative)
    if (enablePlayground) {
      app.get(routePath, (ctx: any) => {
        const html = renderPlaygroundPage({ endpoint: routePath });
        ctx.res.html(html);
      });
    }
  };
}

function renderPlaygroundPage(options: { endpoint: string }) {
  // A minimal, dark-mode, single-file HTML wrapper using GraphQL Playground React CDN
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset=utf-8/>
  <meta name="viewport" content="user-scalable=no, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, minimal-ui">
  <title>AeroJS GraphQL Playground</title>
  <link rel="stylesheet" href="//cdn.jsdelivr.net/npm/graphql-playground-react/build/static/css/index.css" />
  <link rel="shortcut icon" href="//cdn.jsdelivr.net/npm/graphql-playground-react/build/favicon.png" />
  <script src="//cdn.jsdelivr.net/npm/graphql-playground-react/build/static/js/middleware.js"></script>
</head>
<body>
  <div id="root">
    <style>
      body {
        background-color: #172a3a;
        font-family: Open Sans, sans-serif;
        height: 100vh;
      }
      #root {
        height: 100%;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .loading {
        font-size: 32px;
        font-weight: 200;
        color: rgba(255, 255, 255, .6);
        margin-left: 20px;
      }
      img {
        width: 78px;
        height: 78px;
      }
      .title {
        font-weight: 400;
      }
    </style>
    <img src='//cdn.jsdelivr.net/npm/graphql-playground-react/build/logo.png' alt=''>
    <div class="loading"> Loading
      <span class="title">AeroJS GraphQL Playground</span>
    </div>
  </div>
  <script>window.addEventListener('load', function (event) {
      GraphQLPlayground.init(document.getElementById('root'), {
        endpoint: '${options.endpoint}',
        settings: {
          'editor.theme': 'dark'
        }
      })
    })</script>
</body>
</html>`;
}
