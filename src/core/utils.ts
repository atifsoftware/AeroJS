/**
 * @file utils.ts
 * @description Internal utility functions for path normalization, cookies, and query strings.
 */

import type { CookieOptions, ParsedQuery } from './types.js';

/**
 * Normalizes a URL path by stripping trailing slashes while preserving root '/'.
 *
 * @param path - Raw URL path string.
 * @returns Clean normalized path.
 */
export function normalizePath(path: string): string {
  if (!path || path === '/') {
    return '/';
  }
  const collapsed = path.replace(/\/+/g, '/');
  const stripped = collapsed.endsWith('/') && collapsed.length > 1 ? collapsed.slice(0, -1) : collapsed;
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

/**
 * Parses a standard HTTP `Cookie` header into a key-value dictionary.
 *
 * @param cookieHeader - Raw Cookie header value.
 * @returns Parsed cookie dictionary.
 */
export function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;

    const rawKey = pair.slice(0, eqIdx).trim();
    const rawVal = pair.slice(eqIdx + 1).trim();
    if (!rawKey) continue;

    try {
      const key = decodeURIComponent(rawKey);
      const val =
        rawVal.startsWith('"') && rawVal.endsWith('"')
          ? decodeURIComponent(rawVal.slice(1, -1))
          : decodeURIComponent(rawVal);
      cookies[key] = val;
    } catch {
      cookies[rawKey] = rawVal;
    }
  }

  return cookies;
}

/**
 * Serializes a cookie name, value, and options into a valid Set-Cookie header string.
 *
 * @param name - Cookie name.
 * @param value - Cookie value.
 * @param options - Cookie serialization options.
 * @returns Formatted Set-Cookie string.
 */
export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {}
): string {
  const parts: string[] = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  const path = options.path ?? '/';
  parts.push(`Path=${path}`);

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }
  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options.httpOnly) {
    parts.push('HttpOnly');
  }
  if (options.secure) {
    parts.push('Secure');
  }
  if (options.sameSite) {
    const sameSiteValue =
      typeof options.sameSite === 'string'
        ? options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1).toLowerCase()
        : 'Lax';
    parts.push(`SameSite=${sameSiteValue}`);
  }

  return parts.join('; ');
}

/**
 * Extracts query parameters from URLSearchParams into a key-value record.
 *
 * @param searchParams - Standard URLSearchParams instance.
 * @returns Parsed query object.
 */
export function parseQuery(searchParams: URLSearchParams): ParsedQuery {
  const query: ParsedQuery = {};
  for (const [key, value] of searchParams.entries()) {
    const existing = query[key];
    if (existing === undefined) {
      query[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      query[key] = [existing, value];
    }
  }
  return query;
}
