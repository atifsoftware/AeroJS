/**
 * @file oauth-manager.ts
 * @description Central OAuth 2.0 social login manager for AeroJS.
 * Manages OAuth providers (Google, GitHub, custom) with easy redirection and callback handling.
 */

import type { OAuthDriver, OAuthDriverConfig, OAuthUser, OAuthCallbackResult } from './oauth-driver.js';
import { GoogleOAuthDriver } from './google-driver.js';
import { GitHubOAuthDriver } from './github-driver.js';

export interface OAuthConfig {
  providers?: Record<string, OAuthDriverConfig>;
}

export class OAuthManager {
  private configs = new Map<string, OAuthDriverConfig>();
  private drivers = new Map<string, OAuthDriver>();
  private customFactories = new Map<string, (config: OAuthDriverConfig) => OAuthDriver>();
  private fakedUser?: OAuthUser;

  constructor(config: OAuthConfig = {}) {
    this.configure(config);
  }

  public configure(config: OAuthConfig): this {
    if (config.providers) {
      for (const [name, cfg] of Object.entries(config.providers)) {
        this.configs.set(name.toLowerCase(), cfg);
      }
    }
    return this;
  }

  public extend(providerName: string, factory: (config: OAuthDriverConfig) => OAuthDriver): this {
    this.customFactories.set(providerName.toLowerCase(), factory);
    return this;
  }

  public driver(provider: 'google' | 'github' | string): OAuthDriver {
    const name = provider.toLowerCase();

    if (this.fakedUser) {
      const mockUser = this.fakedUser;
      return {
        getRedirectUrl: () => `https://mock-oauth.com/${name}/auth`,
        getUserFromToken: async () => mockUser,
        handleCallback: async () => ({
          accessToken: 'mock_access_token_123',
          user: mockUser,
        }),
      };
    }

    if (this.drivers.has(name)) {
      return this.drivers.get(name)!;
    }

    const cfg = this.configs.get(name) || {
      clientId: process.env[`${name.toUpperCase()}_CLIENT_ID`] || '',
      clientSecret: process.env[`${name.toUpperCase()}_CLIENT_SECRET`] || '',
      redirectUri: process.env[`${name.toUpperCase()}_REDIRECT_URI`] || '',
    };

    let driverInstance: OAuthDriver;

    if (this.customFactories.has(name)) {
      driverInstance = this.customFactories.get(name)!(cfg);
    } else {
      switch (name) {
        case 'google':
          driverInstance = new GoogleOAuthDriver(cfg);
          break;
        case 'github':
          driverInstance = new GitHubOAuthDriver(cfg);
          break;
        default:
          throw new Error(`Unsupported OAuth provider: "${provider}". Register custom driver with OAuth.extend()`);
      }
    }

    this.drivers.set(name, driverInstance);
    return driverInstance;
  }

  /**
   * Fakes OAuth authentication for test environments.
   */
  public fake(user: Partial<OAuthUser> = {}): OAuthUser {
    this.fakedUser = {
      id: user.id || 'faked-oauth-user-id',
      email: user.email || 'faked@example.com',
      name: user.name || 'Faked OAuth User',
      avatarUrl: user.avatarUrl || 'https://example.com/avatar.png',
      raw: user.raw || {},
    };
    return this.fakedUser;
  }

  public restore(): void {
    this.fakedUser = undefined;
  }
}

export const OAuth = new OAuthManager();
