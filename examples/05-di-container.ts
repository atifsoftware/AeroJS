/**
 * @file 05-di-container.ts
 * @description Aero IoC Container example demonstrating bind, singleton, and resolve.
 */

import { Aero } from '../src/index.js';

class UserRepository {
  public getUsers() {
    return [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
  }
}

class UserService {
  constructor(private userRepo: UserRepository) {}
  public list() {
    return this.userRepo.getUsers();
  }
}

const app = new Aero({ debug: true });

// 1. Bind singleton repository
app.container.singleton('userRepo', () => new UserRepository());

// 2. Bind service using resolved repository dependency
app.container.bind('userService', (c) => new UserService(c.resolve('userRepo')));

app.get('/users', (ctx) => {
  const service = ctx.container?.resolve<UserService>('userService');
  ctx.json({ users: service?.list() });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Aero 05-di-container listening on http://localhost:${PORT}`);
});
