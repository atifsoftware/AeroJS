/**
 * @file oauth-driver.ts
 * @description Standard contracts and models for OAuth 2.0 social login in AeroJS.
 */

export interface OAuthUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  raw: any;
}

export interface OAuthCallbackResult {
  accessToken: string;
  tokenType?: string;
  expiresIn?: number;
  refreshToken?: string;
  scope?: string;
  user: OAuthUser;
}

export interface OAuthDriverConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
  [key: string]: any;
}

export interface OAuthDriver {
  getRedirectUrl(options?: { state?: string; scopes?: string[] }): string;
  getUserFromToken(accessToken: string): Promise<OAuthUser>;
  handleCallback(code: string, state?: string): Promise<OAuthCallbackResult>;
}
