# Multi-Store Cache System

```ts
import { Cache } from 'aerojs';

// Automatically prevents race conditions with atomic locks
const value = await Cache.remember('users.all', 3600, async () => {
  return User.all();
});
```
