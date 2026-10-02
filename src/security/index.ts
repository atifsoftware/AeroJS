/**
 * @file index.ts
 * @description Security modules for Aero Web Framework: JWT, Rate Limiter, Security Headers, and CSRF.
 */

export {
  jwt,
  sign,
  verify,
  decode,
  jwtAuth,
  parseTimespan,
  JsonWebTokenError,
  TokenExpiredError,
  NotBeforeError,
  type JwtAlgorithm,
  type JwtHeader,
  type JwtPayload,
  type JwtSignOptions,
  type JwtVerifyOptions,
  type JwtAuthOptions,
} from './jwt.js';

export {
  rateLimit,
  MemoryRateLimitStore,
  RedisRateLimitStore,
  TooManyRequestsError,
  type RateLimitOptions,
  type RateLimitStore,
  type RateLimitInfo,
  type RedisRateLimitStoreOptions,
} from './rate-limiter.js';

export {
  securityHeaders,
  type SecurityHeadersOptions,
  type HstsOptions,
  type ContentSecurityPolicyDirectives,
} from './headers.js';

export {
  csrf,
  type CsrfOptions,
} from './csrf.js';

export {
  Hash,
  hash,
  hashVerify,
  type ScryptOptions,
} from './hash.js';

export {
  cors,
  type CorsOptions,
} from '../middleware/cors.js';

export * from './totp.js';
export * from './vault.js';
export * from './signed-url.js';
export * from './encryption.js';
export * from './fingerprint.js';
