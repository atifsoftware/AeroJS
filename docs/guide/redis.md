# Native Redis Client

AeroJS includes a zero-dependency RESP parser and native TCP connection manager.

```ts
import { Redis } from 'aerojs';

await Redis.set('key', 'value');
const val = await Redis.get('key');
```
