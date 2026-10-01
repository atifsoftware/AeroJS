# WebSockets & Clustering

```ts
// Subscribe to Presence Channels
app.ws.channel('presence-room', (user) => {
  return user ? { id: user.id, name: user.name } : false;
});

// Broadcast across all cluster nodes using Redis Pub/Sub
await app.broadcast('presence-room', 'message.new', { text: 'Hello!' });
```
