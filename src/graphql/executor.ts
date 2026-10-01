/**
 * @file executor.ts
 * @description Zero-dependency GraphQL Execution Engine.
 */

import { GraphQLSchema } from './schema.js';
import type { ASTNode } from './parser.js';
import { GraphQLObjectType, GraphQLList, GraphQLNonNull, GraphQLScalarType, GraphQLType } from './types.js';

export interface ExecutionArgs {
  schema: GraphQLSchema;
  document: ASTNode;
  rootValue?: any;
  contextValue?: any;
  variableValues?: Record<string, any>;
  operationName?: string;
}

export async function execute(args: ExecutionArgs) {
  const { schema, document, rootValue, contextValue, variableValues, operationName } = args;

  try {
    const operations = document.definitions.filter((def: any) => def.kind === 'OperationDefinition');
    const fragments = document.definitions.filter((def: any) => def.kind === 'FragmentDefinition');

    let operation = operations[0];
    if (operationName) {
      operation = operations.find((op: any) => op.name === operationName);
    }

    if (!operation) {
      throw new Error('Must provide a valid operation.');
    }

    let rootType: GraphQLObjectType;
    if (operation.operation === 'query') {
      rootType = schema.queryType;
    } else if (operation.operation === 'mutation' && schema.mutationType) {
      rootType = schema.mutationType;
    } else {
      throw new Error(`Schema is not configured for ${operation.operation}.`);
    }

    const data = await executeSelectionSet(
      operation.selectionSet,
      rootType,
      rootValue,
      contextValue,
      variableValues || {},
      fragments
    );

    return { data };
  } catch (error: any) {
    return { data: null, errors: [{ message: error.message || String(error) }] };
  }
}

async function executeSelectionSet(
  selectionSet: ASTNode,
  objectType: GraphQLObjectType,
  source: any,
  context: any,
  variables: Record<string, any>,
  fragments: ASTNode[]
): Promise<any> {
  const result: any = {};
  const fields = objectType.getFields();

  for (const selection of selectionSet.selections) {
    if (selection.kind === 'Field') {
      const fieldName = selection.name;
      const alias = selection.alias || fieldName;

      // Introspection skip for basic engine (could implement __typename etc)
      if (fieldName === '__typename') {
        result[alias] = objectType.name;
        continue;
      }

      const fieldDef = fields[fieldName];
      if (!fieldDef) continue;

      const args = coerceArgumentValues(fieldDef, selection, variables);

      let resolvedValue;
      if (fieldDef.resolve) {
        resolvedValue = await fieldDef.resolve(source, args, context, { fieldName, parentType: objectType });
      } else {
        resolvedValue = source && source[fieldName] !== undefined ? source[fieldName] : null;
      }

      result[alias] = await completeValue(
        fieldDef.type,
        resolvedValue,
        selection.selectionSet,
        context,
        variables,
        fragments
      );
    } else if (selection.kind === 'FragmentSpread') {
      const frag = fragments.find(f => f.name === selection.name);
      if (frag) {
        const fragResult = await executeSelectionSet(frag.selectionSet, objectType, source, context, variables, fragments);
        Object.assign(result, fragResult);
      }
    } else if (selection.kind === 'InlineFragment') {
      if (!selection.typeCondition || selection.typeCondition === objectType.name) {
        const fragResult = await executeSelectionSet(selection.selectionSet, objectType, source, context, variables, fragments);
        Object.assign(result, fragResult);
      }
    }
  }

  return result;
}

function coerceArgumentValues(fieldDef: any, fieldNode: ASTNode, variables: Record<string, any>) {
  const coerced: any = {};
  if (!fieldDef.args) return coerced;

  for (const argNode of fieldNode.arguments) {
    const name = argNode.name;
    const valueNode = argNode.value;

    let value;
    if (valueNode.kind === 'Variable') {
      value = variables[valueNode.name];
    } else {
      value = valueNode.value; // For IntValue, StringValue etc
    }

    coerced[name] = value;
  }
  return coerced;
}

async function completeValue(
  returnType: GraphQLType,
  result: any,
  selectionSet: ASTNode | undefined,
  context: any,
  variables: Record<string, any>,
  fragments: ASTNode[]
): Promise<any> {
  if (returnType instanceof GraphQLNonNull) {
    const completed = await completeValue(returnType.ofType, result, selectionSet, context, variables, fragments);
    if (completed === null || completed === undefined) {
      throw new Error(`Cannot return null for non-nullable field.`);
    }
    return completed;
  }

  if (result === null || result === undefined) {
    return null;
  }

  if (returnType instanceof GraphQLList) {
    if (!Array.isArray(result)) {
      throw new Error('Expected Iterable, but did not find one.');
    }
    const promises = result.map(item => completeValue(returnType.ofType, item, selectionSet, context, variables, fragments));
    return Promise.all(promises);
  }

  if (returnType instanceof GraphQLScalarType) {
    return returnType.serialize(result);
  }

  if (returnType instanceof GraphQLObjectType) {
    if (!selectionSet) {
      throw new Error(`Field of type ${returnType.name} must have a selection of subfields.`);
    }
    return executeSelectionSet(selectionSet, returnType, result, context, variables, fragments);
  }

  throw new Error(`Unknown type ${returnType.constructor.name}`);
}
