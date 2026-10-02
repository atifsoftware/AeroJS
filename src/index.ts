/**
 * @file index.ts
 * @description Main public API entry point for Aero Web Framework.
 */

import { loadEnv } from './config/env.js';
loadEnv();

export { Aero, Aero as AeroJS, ApplicationCore, type HookName, type HookMap } from './core/application.js';
export { AeroRequest, type AeroRequestOptions } from './core/request.js';
export { AeroResponse } from './core/response.js';
export { AeroContext, type DefaultState, type ContainerLike } from './core/context.js';
export { compose } from './core/middleware.js';
export { Router, type Route, type RouteMatch, type RouteSchema } from './core/router.js';
export { Container, type FactoryFunction, type BindingDefinition } from './di/container.js';
export { ServiceProvider, type ServiceProviderConstructor } from './di/provider.js';
export { inject, getParamInjections, getPropertyInjections } from './di/inject.js';
export { Config } from './config/config.js';
export { env, Env, loadEnv, type EnvRule } from './config/env.js';
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
  RedisRateLimitStore,
  TooManyRequestsError,
  securityHeaders,
  csrf,
  Hash,
  hash,
  hashVerify,
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
  type ScryptOptions,
} from './security/index.js';
export {
  AeroWebSocket,
  handleWebSocketUpgrade,
  type WebSocketUpgradeHandler,
} from './ws/websocket.js';
export {
  Database,
  DB,
  MemoryDatabaseAdapter,
  SqliteDatabaseAdapter,
  useSqlite,
  isSqliteSupported,
  Model,
  Relation,
  computed,
  encrypted,
  QueryBuilder,
  Schema,
  TableBlueprint,
  Migrator,
  // Lifecycle Hook System
  getHookRegistry,
  registerHook,
  ModelHookRegistry,
  beforeCreate,
  afterCreate,
  beforeSave,
  afterSave,
  beforeUpdate,
  afterUpdate,
  beforeDelete,
  afterDelete,
  beforeFind,
  afterFind,
  beforeFetch,
  afterFetch,
  type DatabaseAdapter,
  type DatabaseRow,
  type WhereClause,
  type JoinClause,
  type PaginationResult,
  type RelationDefinition,
  type ManyToManyOptions,
  type HasManyThroughOptions,
  type ColumnDefinition,
  type Migration,
  type ModelHookEvent,
  type ModelHookHandler,
  Seeder,
  DatabaseSeeder,
  ModelFactory,
  type FactoryDefinition,
} from './database/index.js';
export {
  Logger,
  requestLogger,
  RequestContext,
  type LogLevel,
  type RequestStore,
} from './logging/index.js';
export {
  ViewEngine,
  SimpleViewDriver,
  createEdgeDriver,
  createEjsDriver,
  viewPlugin,
  type ViewDriver,
} from './views/view.js';
export {
  vite,
  type ViteOptions,
} from './views/vite.js';
export {
  Inertia,
  inertiaPlugin,
  lazy,
  type InertiaPage,
  type InertiaConfig,
  type InertiaProp,
} from './inertia/inertia.js';
export {
  SSREngine,
  type SSRRenderResult,
  type SSRRenderer,
  type SSREngineOptions,
} from './ssr/index.js';
export {
  Storage,
  StorageManager,
  UploadedFile,
  LocalStorageDriver,
  MemoryStorageDriver,
  S3StorageDriver,
  type StorageDriver,
  type StorageConfig,
  type StorageDiskConfig,
  type FileValidationRules,
} from './storage/index.js';
export {
  Queue,
  QueueManager,
  Job,
  QueueWorker,
  MemoryQueueDriver,
  DatabaseQueueDriver,
  RedisQueueDriver,
  type QueueDriver,
  type QueuedJobRecord,
  type FailedJobDetails,
  type PushOptions,
  type WorkerOptions,
  type FailedJobRecord,
  type QueueConfig,
} from './queue/index.js';
export {
  Mail,
  MailManager,
  MailMessage,
  MemoryMailDriver,
  LogMailDriver,
  type MailDriver,
  type SentMailResult,
  type MailAttachment,
  type MailerConfig,
} from './mail/index.js';
export {
  SwaggerGenerator,
  renderSwaggerUI,
  swaggerPlugin,
  type OpenAPISpec,
  type SwaggerOptions,
  type SwaggerUIOptions,
} from './swagger/index.js';
export {
  AeroCLI,
} from './cli/index.js';
export {
  KnexDatabaseAdapter,
  useKnex,
  usePrisma,
  useDrizzle,
  type PrismaIntegrationOptions,
} from './database/index.js';
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
  renderErrorDashboard,
  parseStackTrace,
  type StackFrame,
} from './core/error-dashboard.js';
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
export {
  Validator,
  VineHelper,
  defaultBengaliVineMessages,
} from './validation/index.js';
export {
  UnprocessableEntityError,
  ValidationError,
} from './core/errors.js';
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

// ─── Enterprise Modules ───────────────────────────────────────────────────────

// Auth System (Session + JWT + API Token Guards)
export {
  Auth,
  AuthManager,
  authManager,
  authPlugin,
  auth,
  type AuthConfig,
  type GuardDriverConfig,
  type GuardDriverName,
} from './auth/auth-manager.js';
export {
  SessionGuard,
  type SessionGuardConfig,
} from './auth/guards/session-guard.js';
export {
  JwtGuard,
  type JwtGuardConfig,
  type JwtTokenPair,
} from './auth/guards/jwt-guard.js';
export {
  ApiTokenGuard,
  type ApiTokenGuardConfig,
  type ApiToken,
  type GeneratedToken,
} from './auth/guards/api-token-guard.js';
export {
  type GuardContract,
  type AuthUser,
  type LoginOptions,
} from './auth/guards/guard.js';

// RBAC / Bouncer Authorization
export {
  Bouncer,
  BouncerManager,
  bouncerManager,
  bouncerPlugin,
  requireRole,
  requirePermission,
  type PolicyContract,
  type PolicyConstructor,
  type PermissionStore,
} from './auth/bouncer.js';

// Session Management
export {
  SessionManager,
  sessionPlugin,
  type SessionConfig,
} from './session/session-manager.js';
export {
  MemorySessionDriver,
  FileSessionDriver,
  RedisSessionDriver,
  CookieSessionDriver,
  type SessionDriver,
} from './session/index.js';

// Immutable Audit Trail (Section 38)
export {
  AuditTrail,
  AuditTrailManager,
  DatabaseAuditDriver,
  MemoryAuditDriver,
  type AuditLogEntry,
  type AuditLogRecord,
  type AuditAction,
  type AuditDriver,
} from './audit/audit-trail.js';

// Domain Event Bus (Section 2 — Reactive Event Bus)
export {
  Events,
  EventBus,
  DomainEvent,
  // Canonical Domain Events
  UserRegisteredEvent,
  OrderPlacedEvent,
  PaymentReceivedEvent,
  RecordArchivedEvent,
  LowStockAlertEvent,
  type EventListener,
  type EventListenerFn,
} from './events/event-bus.js';

// Cron Task Scheduler
export {
  Schedule,
  Scheduler,
  TaskBuilder,
  type TaskDefinition,
  type TaskHandler,
  type TaskRunRecord,
} from './scheduler/scheduler.js';

export * from './cache/index.js';

export * from './redis/index.js';

export * from './ws/index.js';
export * from './diagnostics/index.js';
export * from './security/index.js';
export * from './graphql/index.js';

export * from './di/decorators.js';
export * from './auth/index.js';
export * from './tenancy/index.js';

export * from './sse/index.js';
export * from './pdf/index.js';
export * from './i18n/index.js';
export * from './config/env-schema.js';

export * from './tcp/index.js';
export * from './webhook/index.js';
export * from './http/index.js';
export * from './notifications/index.js';


