# Active Record & Migrations

AeroJS ships with a powerful native ORM and query builder.

```ts
import { Model } from 'aerojs';

export class User extends Model {
  static table = 'users';
  static relations = {
    posts: { type: 'hasMany', model: Post }
  }
}
```
