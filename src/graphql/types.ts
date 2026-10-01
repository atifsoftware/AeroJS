/**
 * @file types.ts
 * @description Zero-dependency GraphQL Type System.
 */

export abstract class GraphQLType {
  abstract name: string;
}

export class GraphQLScalarType extends GraphQLType {
  constructor(
    public name: string,
    public serialize: (value: any) => any,
    public parseValue: (value: any) => any = (v) => v,
    public parseLiteral: (astNode: any) => any = (v) => v.value
  ) {
    super();
  }
}

export const GraphQLString = new GraphQLScalarType('String', String);
export const GraphQLInt = new GraphQLScalarType('Int', (val) => Math.floor(Number(val)));
export const GraphQLFloat = new GraphQLScalarType('Float', Number);
export const GraphQLBoolean = new GraphQLScalarType('Boolean', Boolean);
export const GraphQLID = new GraphQLScalarType('ID', String);

export type Thunk<T> = (() => T) | T;

export interface GraphQLFieldConfig {
  type: GraphQLType;
  args?: Record<string, { type: GraphQLType; defaultValue?: any }>;
  resolve?: (source: any, args: any, context: any, info: any) => any;
}

export class GraphQLObjectType extends GraphQLType {
  private _fields: Thunk<Record<string, GraphQLFieldConfig>>;

  constructor(
    public name: string,
    fields: Thunk<Record<string, GraphQLFieldConfig>>
  ) {
    super();
    this._fields = fields;
  }

  public getFields() {
    if (typeof this._fields === 'function') {
      return this._fields();
    }
    return this._fields;
  }
}

export class GraphQLInputObjectType extends GraphQLType {
  constructor(
    public name: string,
    public fields: Record<string, { type: GraphQLType; defaultValue?: any }>
  ) {
    super();
  }
}

export class GraphQLList extends GraphQLType {
  public name = 'List';
  constructor(public ofType: GraphQLType) {
    super();
  }
}

export class GraphQLNonNull extends GraphQLType {
  public name = 'NonNull';
  constructor(public ofType: GraphQLType) {
    super();
  }
}

export class GraphQLEnumType extends GraphQLType {
  constructor(
    public name: string,
    public values: Record<string, { value: any }>
  ) {
    super();
  }
}
