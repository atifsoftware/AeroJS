/**
 * @file errors.ts
 * @description Standard error classes for the Aero framework.
 */

/**
 * Base HTTP and framework error class in Aero.
 */
export class AeroError extends Error {
  /**
   * HTTP status code associated with the error.
   */
  public readonly status: number;

  /**
   * Optional machine-readable error code.
   */
  public readonly code?: string;

  /**
   * Optional contextual details or validation errors.
   */
  public readonly details?: unknown;

  /**
   * Creates an instance of AeroError.
   *
   * @param message - Human-readable error message.
   * @param status - HTTP status code (defaults to 500).
   * @param code - Optional machine-readable error code.
   * @param details - Optional additional error details.
   */
  constructor(
    message: string,
    status = 500,
    code?: string,
    details?: unknown
  ) {
    super(message);
    this.name = 'AeroError';
    this.status = status;
    this.code = code;
    this.details = details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * HTTP 400 Bad Request error.
 */
export class BadRequestError extends AeroError {
  constructor(
    message = 'Bad Request',
    code = 'BAD_REQUEST',
    details?: unknown
  ) {
    super(message, 400, code, details);
    this.name = 'BadRequestError';
  }
}

/**
 * HTTP 401 Unauthorized error.
 */
export class UnauthorizedError extends AeroError {
  constructor(
    message = 'Unauthorized',
    code = 'UNAUTHORIZED',
    details?: unknown
  ) {
    super(message, 401, code, details);
    this.name = 'UnauthorizedError';
  }
}

/**
 * HTTP 403 Forbidden error.
 */
export class ForbiddenError extends AeroError {
  constructor(
    message = 'Forbidden',
    code = 'FORBIDDEN',
    details?: unknown
  ) {
    super(message, 403, code, details);
    this.name = 'ForbiddenError';
  }
}

/**
 * HTTP 404 Not Found error.
 */
export class NotFoundError extends AeroError {
  constructor(
    message = 'Not Found',
    code = 'NOT_FOUND',
    details?: unknown
  ) {
    super(message, 404, code, details);
    this.name = 'NotFoundError';
  }
}

/**
 * HTTP 405 Method Not Allowed error.
 */
export class MethodNotAllowedError extends AeroError {
  public readonly allowedMethods: readonly string[];

  constructor(
    message = 'Method Not Allowed',
    allowedMethods: readonly string[] = [],
    code = 'METHOD_NOT_ALLOWED'
  ) {
    super(message, 405, code, { allowed: allowedMethods });
    this.name = 'MethodNotAllowedError';
    this.allowedMethods = allowedMethods;
  }
}

/**
 * HTTP 413 Payload Too Large error.
 */
export class PayloadTooLargeError extends AeroError {
  constructor(
    message = 'Payload Too Large',
    code = 'PAYLOAD_TOO_LARGE',
    details?: unknown
  ) {
    super(message, 413, code, details);
    this.name = 'PayloadTooLargeError';
  }
}

/**
 * HTTP 500 Internal Server Error.
 */
export class InternalError extends AeroError {
  constructor(
    message = 'Internal Server Error',
    code = 'INTERNAL_SERVER_ERROR',
    details?: unknown
  ) {
    super(message, 500, code, details);
    this.name = 'InternalError';
  }
}
