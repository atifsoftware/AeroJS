/**
 * @file index.ts
 * @description Main public API entry point for Aero Web Framework.
 */

export { Aero, type HookName, type HookMap } from './core/application.js';
export { AeroRequest, type AeroRequestOptions } from './core/request.js';
export { AeroResponse } from './core/response.js';
export { AeroContext, type DefaultState, type ContainerLike } from './core/context.js';
export { compose } from './core/middleware.js';
export { Router, type Route, type RouteMatch, type RouteSchema } from './core/router.js';
export { Container, type FactoryFunction, type BindingDefinition } from './di/container.js';
export { ServiceProvider, type ServiceProviderConstructor } from './di/provider.js';
export { inject, getParamInjections, getPropertyInjections } from './di/inject.js';
export { Config } from './config/config.js';
export { env, Env, type EnvRule } from './config/env.js';
export { NamedMiddlewareRegistry } from './routing/named-middleware.js';
export { RouteBuilder } from './routing/route-builder.js';
export { RouteGroup } from './routing/route-group.js';
export {
  createControllerHandler,
  isControllerTuple,
  type ControllerConstructor,
  type ControllerTuple,
} from './routing/controller.js';
export {
  createPlugin,
  SKIP_OVERRIDE,
  type AeroPlugin,
  type PluginOptions,
  type PluginMetadata,
} from './plugins/plugin.js';
export {
  createTestClient,
  TestClient,
  type TestResponse,
  type TestRequestOptions,
} from './testing/test-client.js';
export {
  serveStatic,
  getMimeType,
  type StaticOptions,
} from './static/static.js';
export {
  cors,
  type CorsOptions,
} from './middleware/cors.js';
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
  rateLimit,
  MemoryRateLimitStore,
  TooManyRequestsError,
  securityHeaders,
  csrf,
  type JwtAlgorithm,
  type JwtHeader,
  type JwtPayload,
  type JwtSignOptions,
  type JwtVerifyOptions,
  type JwtAuthOptions,
  type RateLimitOptions,
  type RateLimitStore,
  type RateLimitInfo,
  type SecurityHeadersOptions,
  type HstsOptions,
  type ContentSecurityPolicyDirectives,
  type CsrfOptions,
} from './security/index.js';
export {
  AeroWebSocket,
  handleWebSocketUpgrade,
  type WebSocketUpgradeHandler,
} from './ws/websocket.js';
export {
  ViewEngine,
  SimpleViewDriver,
  createEdgeDriver,
  createEjsDriver,
  viewPlugin,
  type ViewDriver,
} from './views/view.js';
export {
  Inertia,
  inertiaPlugin,
  lazy,
  type InertiaPage,
  type InertiaConfig,
  type InertiaProp,
} from './inertia/inertia.js';
export {
  parseBody,
  readRawBody,
  parseUrlEncoded,
  type BodyParserOptions,
} from './core/body-parser.js';
export {
  normalizePath,
  parseCookies,
  serializeCookie,
  parseQuery,
} from './core/utils.js';
export {
  AeroError,
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  MethodNotAllowedError,
  PayloadTooLargeError,
  InternalError,
} from './core/errors.js';
export {
  HookRunner,
  type OnRequestHook,
  type PreParsingHook,
  type PreValidationHook,
  type PreHandlerHook,
  type PreSerializationHook,
  type OnSendHook,
  type OnResponseHook,
  type OnErrorHook,
} from './core/hooks.js';
export {
  validateSchema,
  assertValid,
  compileFastSerializer,
  type JSONSchemaDefinition,
  type RouteValidationSchema,
  type ValidationErrorDetail,
} from './validation/schema.js';
export type {
  HttpVerb,
  ParsedQuery,
  RouteParams,
  CookieOptions,
  NextFunction,
  Middleware,
  ComposedMiddleware,
  AeroOptions,
  ErrorHandler,
  RouteHandler,
  ExtractRouteParams,
} from './core/types.js';

import { Aero } from './core/application.js';
export default Aero;
