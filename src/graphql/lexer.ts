/**
 * @file lexer.ts
 * @description Zero-dependency Lexical Analyzer for GraphQL query documents.
 */

export enum TokenKind {
  EOF = '<EOF>',
  BANG = '!',
  DOLLAR = '$',
  AMP = '&',
  PAREN_L = '(',
  PAREN_R = ')',
  SPREAD = '...',
  COLON = ':',
  EQUALS = '=',
  AT = '@',
  BRACKET_L = '[',
  BRACKET_R = ']',
  BRACE_L = '{',
  PIPE = '|',
  BRACE_R = '}',
  NAME = 'Name',
  INT = 'Int',
  FLOAT = 'Float',
  STRING = 'String',
  BLOCK_STRING = 'BlockString',
  COMMENT = 'Comment'
}

export interface Token {
  kind: TokenKind;
  value?: string;
  line: number;
  column: number;
}

export class Lexer {
  private source: string;
  private position = 0;
  private line = 1;
  private column = 1;

  constructor(source: string) {
    this.source = source;
  }

  public nextToken(): Token {
    this.skipWhitespace();

    if (this.position >= this.source.length) {
      return this.createToken(TokenKind.EOF);
    }

    const char = this.source[this.position];

    if (char === '#') {
      return this.readComment();
    }

    if (this.isLetter(char) || char === '_') {
      return this.readName();
    }

    if (this.isDigit(char) || char === '-') {
      return this.readNumber();
    }

    if (char === '"') {
      return this.readString();
    }

    switch (char) {
      case '!': return this.readChar(TokenKind.BANG);
      case '$': return this.readChar(TokenKind.DOLLAR);
      case '&': return this.readChar(TokenKind.AMP);
      case '(': return this.readChar(TokenKind.PAREN_L);
      case ')': return this.readChar(TokenKind.PAREN_R);
      case ':': return this.readChar(TokenKind.COLON);
      case '=': return this.readChar(TokenKind.EQUALS);
      case '@': return this.readChar(TokenKind.AT);
      case '[': return this.readChar(TokenKind.BRACKET_L);
      case ']': return this.readChar(TokenKind.BRACKET_R);
      case '{': return this.readChar(TokenKind.BRACE_L);
      case '|': return this.readChar(TokenKind.PIPE);
      case '}': return this.readChar(TokenKind.BRACE_R);
      case '.':
        if (this.source[this.position + 1] === '.' && this.source[this.position + 2] === '.') {
          const token = this.createToken(TokenKind.SPREAD);
          this.advance(3);
          return token;
        }
    }

    throw new Error(`Syntax Error: Unexpected character "${char}" at line ${this.line}, column ${this.column}`);
  }

  private advance(count = 1) {
    for (let i = 0; i < count; i++) {
      if (this.source[this.position] === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.position++;
    }
  }

  private skipWhitespace() {
    while (this.position < this.source.length) {
      const char = this.source[this.position];
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === ',') {
        this.advance();
      } else {
        break;
      }
    }
  }

  private readComment(): Token {
    const startCol = this.column;
    let value = '';
    this.advance(); // Skip '#'
    while (this.position < this.source.length && this.source[this.position] !== '\n' && this.source[this.position] !== '\r') {
      value += this.source[this.position];
      this.advance();
    }
    return { kind: TokenKind.COMMENT, value: value.trim(), line: this.line, column: startCol };
  }

  private readName(): Token {
    const startCol = this.column;
    let value = '';
    while (this.position < this.source.length) {
      const char = this.source[this.position];
      if (this.isLetter(char) || this.isDigit(char) || char === '_') {
        value += char;
        this.advance();
      } else {
        break;
      }
    }
    return { kind: TokenKind.NAME, value, line: this.line, column: startCol };
  }

  private readNumber(): Token {
    const startCol = this.column;
    let value = '';
    let isFloat = false;

    if (this.source[this.position] === '-') {
      value += '-';
      this.advance();
    }

    while (this.position < this.source.length) {
      const char = this.source[this.position];
      if (this.isDigit(char)) {
        value += char;
        this.advance();
      } else if (char === '.') {
        isFloat = true;
        value += char;
        this.advance();
      } else {
        break;
      }
    }
    return { kind: isFloat ? TokenKind.FLOAT : TokenKind.INT, value, line: this.line, column: startCol };
  }

  private readString(): Token {
    const startCol = this.column;
    let value = '';
    this.advance(); // skip opening quote

    // Very simplified string parsing (ignores block strings and escape chars for brevity, but functional for 99% cases)
    while (this.position < this.source.length) {
      const char = this.source[this.position]!;
      if (char === '"') {
        this.advance(); // skip closing quote
        break;
      }
      value += char;
      this.advance();
    }

    return { kind: TokenKind.STRING, value, line: this.line, column: startCol };
  }

  private readChar(kind: TokenKind): Token {
    const token = this.createToken(kind);
    this.advance();
    return token;
  }

  private createToken(kind: TokenKind): Token {
    return { kind, line: this.line, column: this.column };
  }

  private isLetter(char: string | undefined): boolean {
    if (!char) return false;
    const code = char.charCodeAt(0);
    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
  }

  private isDigit(char: string | undefined): boolean {
    if (!char) return false;
    const code = char.charCodeAt(0);
    return code >= 48 && code <= 57;
  }
}
