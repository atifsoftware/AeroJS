/**
 * @file schema.ts
 * @description GraphQL Schema container.
 */

import { GraphQLObjectType } from './types.js';

export interface GraphQLSchemaConfig {
  query: GraphQLObjectType;
  mutation?: GraphQLObjectType;
}

export class GraphQLSchema {
  public queryType: GraphQLObjectType;
  public mutationType?: GraphQLObjectType;

  constructor(config: GraphQLSchemaConfig) {
    if (!config.query) {
      throw new Error('Schema query must be provided.');
    }
    this.queryType = config.query;
    this.mutationType = config.mutation;
  }
}
