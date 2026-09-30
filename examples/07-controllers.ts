/**
 * @file 07-controllers.ts
 * @description Controller resolution and automatic dependency injection with Aero.
 */

import { Aero, AeroContext, inject } from '../src/index.js';

class UserService {
  private users = [
    { id: 1, name: 'Ada Lovelace', role: 'admin' },
    { id: 2, name: 'Alan Turing', role: 'engineer' },
  ];

  public all() {
    return this.users;
  }

  public find(id: number) {
    return this.users.find((u) => u.id === id);
  }
}

class UserController {
  constructor(@inject('UserService') private userService: UserService) {}

  public async index(ctx: AeroContext) {
    return ctx.json({ users: this.userService.all() });
  }

  public async show(ctx: AeroContext) {
    const user = this.userService.find(Number(ctx.params.id));
    if (!user) {
      return ctx.status(404).json({ error: 'User not found' });
    }
    // Directly return object for automatic JSON dispatch
    return { user };
  }
}

const app = new Aero();

// Register service in IoC container
app.container.singleton('UserService', () => new UserService());

// Define routes using controller action tuples
app.get('/users', [UserController, 'index']).as('users.index');
app.get('/users/:id', [UserController, 'show']).as('users.show');

app.listen(3000, () => {
  console.log(`Server running at http://localhost:3000/users`);
});
