# Diagnostics & Prometheus

```ts
app.useDiagnostics({
  metricsRoute: '/metrics',
  healthRoute: '/health'
});
```
Tracks active WS connections, CPU, memory heap, and HTTP request duration percentiles natively.
