/**
 * @file types.ts
 * @description Core shared types and interfaces for the Aero framework.
 */

import type { AeroContext } from './context.js';

/**
 * Standard HTTP methods supported by Aero.
 */
export type HttpVerb =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS'
  | 'ALL';

/**
 * Parsed query string dictionary.
 */
export type ParsedQuery = Record<string, string | string[] | undefined>;

/**
 * Route parameter dictionary extracted from URL path patterns.
 */
export type RouteParams = Record<string, string>;

/**
 * Options for serializing HTTP cookies.
 */
export interface CookieOptions {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  priority?: 'low' | 'medium' | 'high';
  sameSite?: boolean | 'lax' | 'strict' | 'none';
  secure?: boolean;
}

/**
 * Next function callback triggering downstream middleware execution.
 */
export type NextFunction = () => Promise<void>;

/**
 * Standard onion middleware function signature.
 */
export type Middleware<State = Record<string, unknown>> = (
  ctx: AeroContext<State>,
  next: NextFunction
) => void | Promise<void>;

/**
 * Composed middleware pipeline executor.
 */
export type ComposedMiddleware<State = Record<string, unknown>> = (
  ctx: AeroContext<State>,
  next?: NextFunction
) => Promise<void>;

/**
 * Global application configuration options.
 */
export interface AeroOptions {
  debug?: boolean;
  disableDefault404?: boolean;
  bodyLimit?: number;
  trustProxy?: boolean;
}

/**
 * Error handler function signature.
 */
export type ErrorHandler<State = Record<string, unknown>> = (
  error: Error,
  ctx: AeroContext<State>
) => void | Promise<void>;

/**
 * Route handler function signature.
 */
export type RouteHandler<State = Record<string, unknown>> = (
  ctx: AeroContext<State>
) => unknown | Promise<unknown>;

/**
 * Type-level helper extracting parameter names from route path strings (e.g. '/users/:id/posts/:postId').
 */
export type ExtractRouteParams<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ExtractRouteParams<Rest>]: string }
    : Path extends `${string}:${infer Param}`
    ? { [K in Param]: string }
    : Path extends `${string}*${infer Wildcard}`
    ? { [K in Wildcard extends '' ? '*' : Wildcard]: string }
    : Record<string, string>;
