/**
 * @file google-driver.ts
 * @description Google OAuth 2.0 social login provider for AeroJS.
 */

import type { OAuthDriver, OAuthDriverConfig, OAuthUser, OAuthCallbackResult } from './oauth-driver.js';
import { Http } from '../../http/http.js';

export class GoogleOAuthDriver implements OAuthDriver {
  private config: OAuthDriverConfig;

  constructor(config: OAuthDriverConfig) {
    this.config = {
      scopes: ['openid', 'email', 'profile'],
      ...config,
    };
  }

  public getRedirectUrl(options: { state?: string; scopes?: string[] } = {}): string {
    const scopes = options.scopes || this.config.scopes || ['openid', 'email', 'profile'];
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
    });

    if (options.state) {
      params.set('state', options.state);
    }

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  public async getUserFromToken(accessToken: string): Promise<OAuthUser> {
    const res = await Http.withToken(accessToken).get('https://www.googleapis.com/oauth2/v3/userinfo');
    res.throw();

    const data = res.json();
    return {
      id: String(data.sub || data.id),
      email: data.email || null,
      name: data.name || null,
      avatarUrl: data.picture || null,
      raw: data,
    };
  }

  public async handleCallback(code: string): Promise<OAuthCallbackResult> {
    const res = await Http.asForm().post('https://oauth2.googleapis.com/token', {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.config.redirectUri,
    });
    res.throw();

    const tokenData = res.json();
    const accessToken = tokenData.access_token;
    const user = await this.getUserFromToken(accessToken);

    return {
      accessToken,
      tokenType: tokenData.token_type,
      expiresIn: tokenData.expires_in,
      refreshToken: tokenData.refresh_token,
      scope: tokenData.scope,
      user,
    };
  }
}
