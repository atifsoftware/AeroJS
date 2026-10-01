/**
 * @file parser.ts
 * @description Zero-dependency Recursive Descent Parser for GraphQL AST.
 */

import { Lexer, TokenKind } from './lexer.js';
import type { Token } from './lexer.js';

export interface ASTNode {
  kind: string;
  [key: string]: any;
}

export class Parser {
  private lexer: Lexer;
  private currentToken!: Token;

  constructor(source: string) {
    this.lexer = new Lexer(source);
    this.advance();
  }

  private advance() {
    this.currentToken = this.lexer.nextToken();
    // Skip comments
    while (this.currentToken.kind === TokenKind.COMMENT) {
      this.currentToken = this.lexer.nextToken();
    }
  }

  private expect(kind: TokenKind): Token {
    if (this.currentToken.kind === kind) {
      const token = this.currentToken;
      this.advance();
      return token;
    }
    throw new Error(`Expected token ${kind}, but found ${this.currentToken.kind} at line ${this.currentToken.line}`);
  }

  private check(kind: TokenKind): boolean {
    return this.currentToken.kind === kind;
  }

  public parseDocument(): ASTNode {
    const definitions: ASTNode[] = [];
    while (!this.check(TokenKind.EOF)) {
      definitions.push(this.parseDefinition());
    }
    return { kind: 'Document', definitions };
  }

  private parseDefinition(): ASTNode {
    if (this.check(TokenKind.NAME)) {
      if (this.currentToken.value === 'query' || this.currentToken.value === 'mutation' || this.currentToken.value === 'subscription') {
        return this.parseOperationDefinition();
      }
      if (this.currentToken.value === 'fragment') {
        return this.parseFragmentDefinition();
      }
    } else if (this.check(TokenKind.BRACE_L)) {
      // Anonymous query
      return {
        kind: 'OperationDefinition',
        operation: 'query',
        selectionSet: this.parseSelectionSet()
      };
    }
    throw new Error(`Unexpected token at root level: ${this.currentToken.value}`);
  }

  private parseOperationDefinition(): ASTNode {
    const operation = this.expect(TokenKind.NAME).value;
    let name;
    if (this.check(TokenKind.NAME)) {
      name = this.expect(TokenKind.NAME).value;
    }

    let variableDefinitions: ASTNode[] = [];
    if (this.check(TokenKind.PAREN_L)) {
      this.advance();
      while (!this.check(TokenKind.PAREN_R)) {
        variableDefinitions.push(this.parseVariableDefinition());
      }
      this.expect(TokenKind.PAREN_R);
    }

    const selectionSet = this.parseSelectionSet();

    return {
      kind: 'OperationDefinition',
      operation,
      name,
      variableDefinitions,
      selectionSet
    };
  }

  private parseVariableDefinition(): ASTNode {
    const variable = this.parseVariable();
    this.expect(TokenKind.COLON);
    const type = this.parseType();
    return { kind: 'VariableDefinition', variable, type };
  }

  private parseVariable(): ASTNode {
    this.expect(TokenKind.DOLLAR);
    const name = this.expect(TokenKind.NAME).value;
    return { kind: 'Variable', name };
  }

  private parseType(): ASTNode {
    let type: ASTNode;
    if (this.check(TokenKind.BRACKET_L)) {
      this.advance();
      type = { kind: 'ListType', type: this.parseType() };
      this.expect(TokenKind.BRACKET_R);
    } else {
      type = { kind: 'NamedType', name: this.expect(TokenKind.NAME).value };
    }

    if (this.check(TokenKind.BANG)) {
      this.advance();
      type = { kind: 'NonNullType', type };
    }
    return type;
  }

  private parseSelectionSet(): ASTNode {
    this.expect(TokenKind.BRACE_L);
    const selections: ASTNode[] = [];
    while (!this.check(TokenKind.BRACE_R)) {
      selections.push(this.parseSelection());
    }
    this.expect(TokenKind.BRACE_R);
    return { kind: 'SelectionSet', selections };
  }

  private parseSelection(): ASTNode {
    if (this.check(TokenKind.SPREAD)) {
      this.advance();
      if (this.check(TokenKind.NAME) && this.currentToken.value !== 'on') {
        return { kind: 'FragmentSpread', name: this.expect(TokenKind.NAME).value };
      }
      let typeCondition;
      if (this.currentToken.value === 'on') {
        this.advance();
        typeCondition = this.expect(TokenKind.NAME).value;
      }
      return { kind: 'InlineFragment', typeCondition, selectionSet: this.parseSelectionSet() };
    }

    return this.parseField();
  }

  private parseField(): ASTNode {
    let name = this.expect(TokenKind.NAME).value;
    let alias;

    if (this.check(TokenKind.COLON)) {
      this.advance();
      alias = name;
      name = this.expect(TokenKind.NAME).value;
    }

    let argumentsNode: ASTNode[] = [];
    if (this.check(TokenKind.PAREN_L)) {
      this.advance();
      while (!this.check(TokenKind.PAREN_R)) {
        argumentsNode.push(this.parseArgument());
      }
      this.expect(TokenKind.PAREN_R);
    }

    let selectionSet;
    if (this.check(TokenKind.BRACE_L)) {
      selectionSet = this.parseSelectionSet();
    }

    return {
      kind: 'Field',
      alias,
      name,
      arguments: argumentsNode,
      selectionSet
    };
  }

  private parseArgument(): ASTNode {
    const name = this.expect(TokenKind.NAME).value;
    this.expect(TokenKind.COLON);
    const value = this.parseValue();
    return { kind: 'Argument', name, value };
  }

  private parseValue(): ASTNode {
    if (this.check(TokenKind.DOLLAR)) {
      return this.parseVariable();
    }
    if (this.check(TokenKind.INT)) {
      return { kind: 'IntValue', value: this.expect(TokenKind.INT).value };
    }
    if (this.check(TokenKind.FLOAT)) {
      return { kind: 'FloatValue', value: this.expect(TokenKind.FLOAT).value };
    }
    if (this.check(TokenKind.STRING)) {
      return { kind: 'StringValue', value: this.expect(TokenKind.STRING).value };
    }
    if (this.check(TokenKind.NAME)) {
      const name = this.expect(TokenKind.NAME).value;
      if (name === 'true' || name === 'false') {
        return { kind: 'BooleanValue', value: name === 'true' };
      }
      if (name === 'null') {
        return { kind: 'NullValue' };
      }
      return { kind: 'EnumValue', value: name };
    }
    throw new Error(`Unexpected value token: ${this.currentToken.kind}`);
  }

  private parseFragmentDefinition(): ASTNode {
    this.expect(TokenKind.NAME); // fragment
    const name = this.expect(TokenKind.NAME).value;
    if (this.currentToken.value === 'on') {
      this.advance();
    }
    const typeCondition = this.expect(TokenKind.NAME).value;
    const selectionSet = this.parseSelectionSet();

    return {
      kind: 'FragmentDefinition',
      name,
      typeCondition,
      selectionSet
    };
  }
}
