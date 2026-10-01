# Seeders & Factories

Easily seed your database with mock data.

```ts
const user = await ModelFactory.define(User, () => ({
  name: 'John Doe',
  role: 'admin'
})).createMany(10);
```

Nested Transaction Savepoints protect data integrity:
```ts
await DB.transaction(async (trx) => {
  // Nested transactions use SQL SAVEPOINTs
});
```
