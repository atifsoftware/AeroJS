/**
 * @file schema.ts
 * @description Lightweight, zero-dependency JSON Schema validation and fast serialization engine.
 */

import { BadRequestError } from '../core/errors.js';

export interface ValidationErrorDetail {
  keyword: string;
  dataPath: string;
  message: string;
}

export interface JSONSchemaDefinition {
  type?: string;
  required?: string[];
  properties?: Record<string, JSONSchemaDefinition>;
  items?: JSONSchemaDefinition;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: 'email' | 'uri' | 'uuid' | string;
  enum?: unknown[];
}

export interface RouteValidationSchema {
  body?: JSONSchemaDefinition;
  query?: JSONSchemaDefinition;
  querystring?: JSONSchemaDefinition;
  params?: JSONSchemaDefinition;
  headers?: JSONSchemaDefinition;
  response?: Record<string | number, JSONSchemaDefinition>;
}

export function validateSchema(
  schema: JSONSchemaDefinition | unknown,
  data: unknown,
  path = 'root'
): ValidationErrorDetail[] {
  if (!schema || typeof schema !== 'object') {
    return [];
  }

  const s = schema as JSONSchemaDefinition;
  const errors: ValidationErrorDetail[] = [];

  // 1. Type validation
  if (typeof s.type === 'string') {
    const expectedType = s.type;
    const actualType = Array.isArray(data)
      ? 'array'
      : data === null
      ? 'null'
      : typeof data;

    if (expectedType === 'integer') {
      if (typeof data !== 'number' || !Number.isInteger(data)) {
        errors.push({
          keyword: 'type',
          dataPath: path,
          message: `Expected integer, received ${actualType}`,
        });
        return errors;
      }
    } else if (actualType !== expectedType) {
      errors.push({
        keyword: 'type',
        dataPath: path,
        message: `Expected ${expectedType}, received ${actualType}`,
      });
      return errors;
    }
  }

  // 2. Enum validation
  if (Array.isArray(s.enum)) {
    if (!s.enum.includes(data)) {
      errors.push({
        keyword: 'enum',
        dataPath: path,
        message: `Value must be one of: ${JSON.stringify(s.enum)}`,
      });
    }
  }

  // 3. String constraints
  if (typeof data === 'string') {
    if (typeof s.minLength === 'number' && data.length < s.minLength) {
      errors.push({
        keyword: 'minLength',
        dataPath: path,
        message: `String length must be >= ${s.minLength}`,
      });
    }
    if (typeof s.maxLength === 'number' && data.length > s.maxLength) {
      errors.push({
        keyword: 'maxLength',
        dataPath: path,
        message: `String length must be <= ${s.maxLength}`,
      });
    }
    if (typeof s.pattern === 'string') {
      const reg = new RegExp(s.pattern);
      if (!reg.test(data)) {
        errors.push({
          keyword: 'pattern',
          dataPath: path,
          message: `String does not match pattern ${s.pattern}`,
        });
      }
    }
    if (s.format === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data)) {
        errors.push({
          keyword: 'format',
          dataPath: path,
          message: 'String must be a valid email address',
        });
      }
    }
    if (s.format === 'uuid') {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(data)) {
        errors.push({
          keyword: 'format',
          dataPath: path,
          message: 'String must be a valid UUID',
        });
      }
    }
  }

  // 4. Number constraints
  if (typeof data === 'number') {
    if (typeof s.minimum === 'number' && data < s.minimum) {
      errors.push({
        keyword: 'minimum',
        dataPath: path,
        message: `Value must be >= ${s.minimum}`,
      });
    }
    if (typeof s.maximum === 'number' && data > s.maximum) {
      errors.push({
        keyword: 'maximum',
        dataPath: path,
        message: `Value must be <= ${s.maximum}`,
      });
    }
  }

  // 5. Object constraints
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const dataObj = data as Record<string, unknown>;

    if (Array.isArray(s.required)) {
      for (const field of s.required) {
        if (dataObj[field] === undefined) {
          errors.push({
            keyword: 'required',
            dataPath: `${path}.${field}`,
            message: `Missing required property '${field}'`,
          });
        }
      }
    }

    if (s.properties && typeof s.properties === 'object') {
      for (const [propName, propSchema] of Object.entries(s.properties)) {
        if (dataObj[propName] !== undefined) {
          const propErrors = validateSchema(
            propSchema,
            dataObj[propName],
            `${path}.${propName}`
          );
          errors.push(...propErrors);
        }
      }
    }
  }

  // 6. Array constraints
  if (Array.isArray(data) && s.items) {
    for (let i = 0; i < data.length; i++) {
      const itemErrors = validateSchema(s.items, data[i], `${path}[${i}]`);
      errors.push(...itemErrors);
    }
  }

  return errors;
}

export function compileFastSerializer(schema?: unknown): (data: unknown) => string {
  if (!schema || typeof schema !== 'object') {
    return (data: unknown) => JSON.stringify(data);
  }

  const s = schema as Record<string, unknown>;
  if (s['type'] === 'object' && s['properties'] && typeof s['properties'] === 'object') {
    const props = Object.keys(s['properties'] as Record<string, unknown>);
    return (data: unknown) => {
      if (typeof data !== 'object' || data === null) {
        return JSON.stringify(data);
      }
      const obj = data as Record<string, unknown>;
      const parts: string[] = [];
      for (const key of props) {
        if (obj[key] !== undefined) {
          parts.push(`${JSON.stringify(key)}:${JSON.stringify(obj[key])}`);
        }
      }
      return `{${parts.join(',')}}`;
    };
  }

  return (data: unknown) => JSON.stringify(data);
}

export function assertValid(schema: JSONSchemaDefinition | unknown, data: unknown, target = 'payload'): void {
  const errors = validateSchema(schema, data, target);
  if (errors.length > 0) {
    throw new BadRequestError(`${target} validation failed`, 'VALIDATION_ERROR', errors);
  }
}
