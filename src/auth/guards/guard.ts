/**
 * @file guard.ts
 * @description Base Auth Guard interface and shared types for AeroJS Auth System.
 * Supports Session, JWT, and API Token authentication strategies.
 */

import type { AeroContext } from '../../core/context.js';

export interface AuthUser {
  id: string | number;
  role?: string;
  branchId?: string | number;
  terminalId?: string | number;
  [key: string]: unknown;
}

export interface GuardContract {
  /**
   * Returns the currently authenticated user, or null if not authenticated.
   */
  user(): AuthUser | null;

  /**
   * Checks if a user is authenticated.
   */
  check(): boolean;

  /**
   * Returns authenticated user or throws UnauthorizedError.
   */
  authenticate(): Promise<AuthUser>;

  /**
   * Silently attempts auth without throwing — returns true/false.
   */
  silentCheck(): Promise<boolean>;
}

export interface LoginOptions {
  remember?: boolean;      // Keep session alive longer
  rememberDuration?: number; // Seconds to keep alive (default: 30 days)
}
