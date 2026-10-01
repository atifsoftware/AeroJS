import { describe, it, expect } from 'vitest';
import { Lexer, TokenKind } from '../src/graphql/lexer.js';
import { Parser } from '../src/graphql/parser.js';
import { execute } from '../src/graphql/executor.js';
import { GraphQLSchema } from '../src/graphql/schema.js';
import { GraphQLObjectType, GraphQLString, GraphQLInt } from '../src/graphql/types.js';
import { createModelGraphQLType, generateCRUDFields } from '../src/graphql/adapter.js';
import { Aero } from '../src/core/application.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('Zero-Dependency GraphQL Engine', () => {
  describe('Lexer', () => {
    it('tokenizes basic queries', () => {
      const lexer = new Lexer('{ id name }');
      expect(lexer.nextToken().kind).toBe(TokenKind.BRACE_L);
      expect(lexer.nextToken().value).toBe('id');
      expect(lexer.nextToken().value).toBe('name');
      expect(lexer.nextToken().kind).toBe(TokenKind.BRACE_R);
      expect(lexer.nextToken().kind).toBe(TokenKind.EOF);
    });

    it('handles strings and arguments', () => {
      const lexer = new Lexer('user(id: "123")');
      expect(lexer.nextToken().value).toBe('user');
      expect(lexer.nextToken().kind).toBe(TokenKind.PAREN_L);
      expect(lexer.nextToken().value).toBe('id');
      expect(lexer.nextToken().kind).toBe(TokenKind.COLON);
      expect(lexer.nextToken().value).toBe('123'); // STRING
      expect(lexer.nextToken().kind).toBe(TokenKind.PAREN_R);
    });
  });

  describe('Parser', () => {
    it('parses an anonymous query to AST', () => {
      const parser = new Parser('{ user(id: 1) { name } }');
      const ast = parser.parseDocument();
      expect(ast.kind).toBe('Document');
      expect(ast.definitions[0].kind).toBe('OperationDefinition');
      expect(ast.definitions[0].selectionSet.selections[0].name).toBe('user');
      expect(ast.definitions[0].selectionSet.selections[0].arguments[0].name).toBe('id');
      expect(ast.definitions[0].selectionSet.selections[0].selectionSet.selections[0].name).toBe('name');
    });
  });

  describe('Execution Engine', () => {
    it('executes a basic query', async () => {
      const queryType = new GraphQLObjectType('Query', () => ({
        hello: {
          type: GraphQLString,
          resolve: () => 'world'
        },
        add: {
          type: GraphQLInt,
          args: { a: { type: GraphQLInt }, b: { type: GraphQLInt } },
          resolve: (_: any, args: any) => parseInt(args.a) + parseInt(args.b)
        }
      }));

      const schema = new GraphQLSchema({ query: queryType });

      const parser = new Parser('{ hello add(a: 5, b: 10) }');
      const document = parser.parseDocument();

      const result = await execute({ schema, document });
      expect(result.data.hello).toBe('world');
      expect(result.data.add).toBe(15);
    });

    it('resolves nested objects', async () => {
      const UserType = new GraphQLObjectType('User', () => ({
        id: { type: GraphQLInt },
        name: { type: GraphQLString }
      }));

      const queryType = new GraphQLObjectType('Query', () => ({
        user: {
          type: UserType,
          resolve: () => ({ id: 1, name: 'Alice' })
        }
      }));

      const schema = new GraphQLSchema({ query: queryType });

      const parser = new Parser('{ user { id name } }');
      const document = parser.parseDocument();

      const result = await execute({ schema, document });
      expect(result.data.user.id).toBe(1);
      expect(result.data.user.name).toBe('Alice');
    });
  });

  describe('Model Adapter', () => {
    it('generates a GraphQL type from an Active Record Model', async () => {
      class MockUserModel {
        static columns = {
          name: { type: 'string' },
          age: { type: 'integer' },
          isActive: { type: 'boolean' }
        };
      }

      const UserGQLType = createModelGraphQLType(MockUserModel);
      const fields = UserGQLType.getFields();

      expect(fields.id.type.name).toBe('ID');
      expect(fields.name.type.name).toBe('String');
      expect(fields.age.type.name).toBe('Int');
      expect(fields.isActive.type.name).toBe('Boolean');
    });
  });

  describe('Plugin & HTTP Transport', () => {
    it('handles POST /graphql and GET /graphql playground', async () => {
      const queryType = new GraphQLObjectType('Query', () => ({
        ping: { type: GraphQLString, resolve: () => 'pong' }
      }));
      const schema = new GraphQLSchema({ query: queryType });

      const app = new Aero();
            app.useGraphQL({ schema });
      app.onError((err, ctx) => { console.error('GQL ERROR:', err); ctx.res.status(500).send(err.message); });

      const client = createTestClient(app);

      // Test POST query
            const postRes = await client.post('/graphql', {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ ping }' })
      });

      expect(postRes.status).toBe(200);
      expect(await postRes.json()).toEqual({ data: { ping: 'pong' } });

      // Test GET playground
      const getRes = await client.get('/graphql');
      expect(getRes.status).toBe(200);
      expect(getRes.headers['content-type']).toContain('text/html');
      expect(await getRes.text()).toContain('GraphQLPlayground.init');
    });
  });
});
