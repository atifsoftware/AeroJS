# Routing & Controllers

AeroJS provides expressive routing.

```ts
app.get('/users/:id', async (ctx) => {
  return ctx.json({ id: ctx.params.id });
});

app.group('/api', (router) => {
  router.post('/login', 'AuthController.login');
});
```
