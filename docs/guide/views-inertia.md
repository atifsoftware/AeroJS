# Views & Inertia.js

Seamless React/Vue SPA monoliths:

```ts
app.useInertia({ version: '1.0' });

app.get('/dashboard', (ctx) => {
  return ctx.inertia.render('Dashboard', { props: { user: ctx.user } });
});
```
