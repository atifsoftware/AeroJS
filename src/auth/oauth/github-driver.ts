/**
 * @file github-driver.ts
 * @description GitHub OAuth 2.0 social login provider for AeroJS.
 */

import type { OAuthDriver, OAuthDriverConfig, OAuthUser, OAuthCallbackResult } from './oauth-driver.js';
import { Http } from '../../http/http.js';

export class GitHubOAuthDriver implements OAuthDriver {
  private config: OAuthDriverConfig;

  constructor(config: OAuthDriverConfig) {
    this.config = {
      scopes: ['read:user', 'user:email'],
      ...config,
    };
  }

  public getRedirectUrl(options: { state?: string; scopes?: string[] } = {}): string {
    const scopes = options.scopes || this.config.scopes || ['read:user', 'user:email'];
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: scopes.join(' '),
    });

    if (options.state) {
      params.set('state', options.state);
    }

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  public async getUserFromToken(accessToken: string): Promise<OAuthUser> {
    const res = await Http.withToken(accessToken)
      .withHeaders({ 'User-Agent': 'AeroJS-OAuth' })
      .get('https://api.github.com/user');
    res.throw();

    const data = res.json();

    // If primary email is private in GitHub, fetch from /user/emails
    let email: string | null = data.email || null;
    if (!email) {
      try {
        const emailsRes = await Http.withToken(accessToken)
          .withHeaders({ 'User-Agent': 'AeroJS-OAuth' })
          .get('https://api.github.com/user/emails');
        if (emailsRes.successful) {
          const emails = emailsRes.json();
          const primary = emails.find((e: any) => e.primary && e.verified) || emails[0];
          if (primary) email = primary.email;
        }
      } catch {
        // Ignored
      }
    }

    return {
      id: String(data.id),
      email,
      name: data.name || data.login || null,
      avatarUrl: data.avatar_url || null,
      raw: data,
    };
  }

  public async handleCallback(code: string): Promise<OAuthCallbackResult> {
    const res = await Http.acceptJson()
      .withHeaders({ 'User-Agent': 'AeroJS-OAuth' })
      .post('https://github.com/login/oauth/access_token', {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: this.config.redirectUri,
      });
    res.throw();

    const tokenData = res.json();
    const accessToken = tokenData.access_token;
    const user = await this.getUserFromToken(accessToken);

    return {
      accessToken,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
      user,
    };
  }
}
