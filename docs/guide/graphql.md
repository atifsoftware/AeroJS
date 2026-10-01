# GraphQL Engine

A zero-dependency GraphQL lexer, AST parser, and Execution Engine.

```ts
import { createModelGraphQLType, GraphQLSchema } from 'aerojs/graphql';

const schema = new GraphQLSchema({
  query: new GraphQLObjectType('Query', () => ({
    user: { type: createModelGraphQLType(User) }
  }))
});

app.useGraphQL({ schema, playground: true });
```
