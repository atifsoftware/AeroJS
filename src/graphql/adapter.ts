/**
 * @file adapter.ts
 * @description Active Record Model to GraphQL Schema Adapter.
 */

import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLID,
  GraphQLList,
  GraphQLNonNull
} from './types.js';

export function createModelGraphQLType(ModelClass: any): GraphQLObjectType {
  const name = ModelClass.name;

  return new GraphQLObjectType(name, () => {
    const fields: any = {};
    const columns = ModelClass.columns || {};

    // Fallback if columns aren't statically defined
    // We assume ID is present
    fields['id'] = { type: GraphQLID };

    for (const [colName, colDef] of Object.entries(columns)) {
      const def = colDef as any;
      let gqlType: any = GraphQLString;

      if (def.type === 'integer' || def.type === 'increments') gqlType = GraphQLInt;
      else if (def.type === 'float' || def.type === 'decimal') gqlType = GraphQLFloat;
      else if (def.type === 'boolean') gqlType = GraphQLBoolean;

      fields[colName] = { type: gqlType };
    }

    // Auto-map relations if defined
    if (ModelClass.relations) {
      for (const [relName, relDef] of Object.entries(ModelClass.relations)) {
        const relation = relDef as any;
        if (relation.type === 'hasMany' || relation.type === 'belongsToMany') {
          // Lazy load the related type to avoid circular dependencies
          fields[relName] = {
            type: new GraphQLList(createModelGraphQLType(relation.model)),
            resolve: async (source: any) => {
               // Invoke relation loader if we were actually linked to real AeroJS Model methods
               // Simplification for the engine adapter
               return source[relName] ? (typeof source[relName] === 'function' ? await source[relName]() : source[relName]) : [];
            }
          };
        } else if (relation.type === 'belongsTo' || relation.type === 'hasOne') {
          fields[relName] = {
            type: createModelGraphQLType(relation.model),
            resolve: async (source: any) => {
               return source[relName] ? (typeof source[relName] === 'function' ? await source[relName]() : source[relName]) : null;
            }
          };
        }
      }
    }

    return fields;
  });
}

/**
 * Generates standard CRUD Query and Mutation fields for a given Model.
 */
export function generateCRUDFields(ModelClass: any, type: GraphQLObjectType) {
  const modelName = ModelClass.name;
  const pluralName = modelName.toLowerCase() + 's';
  const singularName = modelName.toLowerCase();

  return {
    queries: {
      [pluralName]: {
        type: new GraphQLList(type),
        resolve: async () => {
          return await ModelClass.all();
        }
      },
      [singularName]: {
        type: type,
        args: { id: { type: new GraphQLNonNull(GraphQLID) } },
        resolve: async (_: any, args: any) => {
          return await ModelClass.find(args.id);
        }
      }
    },
    mutations: {
      [`create${modelName}`]: {
        type: type,
        // In a real app we'd map input object types, using simplistic args here
        args: {
          data: { type: GraphQLString } // Simplified payload
        },
        resolve: async (_: any, args: any) => {
          let payload = args.data;
          if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch {}
          }
          return await ModelClass.create(payload);
        }
      },
      [`delete${modelName}`]: {
        type: GraphQLBoolean,
        args: { id: { type: new GraphQLNonNull(GraphQLID) } },
        resolve: async (_: any, args: any) => {
          const instance = await ModelClass.find(args.id);
          if (instance) {
            await instance.delete();
            return true;
          }
          return false;
        }
      }
    }
  };
}
