import { describe, it, expect, beforeEach } from 'vitest';
import { OAuth, GoogleOAuthDriver, GitHubOAuthDriver } from '../src/auth/oauth/index.js';
import { Http } from '../src/http/http.js';

describe('AeroJS Social Authentication (OAuth 2.0)', () => {
  beforeEach(() => {
    Http.reset();
    OAuth.restore();
  });

  it('generates correct Google OAuth redirect authorization URL', () => {
    const google = new GoogleOAuthDriver({
      clientId: 'google-client-123.apps.googleusercontent.com',
      clientSecret: 'secret-xyz',
      redirectUri: 'https://myapp.com/auth/google/callback',
      scopes: ['openid', 'email', 'profile'],
    });

    const url = google.getRedirectUrl({ state: 'random_csrf_token' });

    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth?');
    expect(url).toContain('client_id=google-client-123.apps.googleusercontent.com');
    expect(url).toContain('redirect_uri=https%3A%2F%2Fmyapp.com%2Fauth%2Fgoogle%2Fcallback');
    expect(url).toContain('state=random_csrf_token');
    expect(url).toContain('scope=openid+email+profile');
  });

  it('generates correct GitHub OAuth redirect authorization URL', () => {
    const github = new GitHubOAuthDriver({
      clientId: 'github-client-456',
      clientSecret: 'github-secret-789',
      redirectUri: 'https://myapp.com/auth/github/callback',
    });

    const url = github.getRedirectUrl({ state: 'github_state_abc' });

    expect(url).toContain('https://github.com/login/oauth/authorize?');
    expect(url).toContain('client_id=github-client-456');
    expect(url).toContain('redirect_uri=https%3A%2F%2Fmyapp.com%2Fauth%2Fgithub%2Fcallback');
    expect(url).toContain('state=github_state_abc');
  });

  it('handles Google token exchange and user fetching via Http client', async () => {
    Http.fake({
      'https://oauth2.googleapis.com/token': {
        access_token: 'google_test_access_token_999',
        token_type: 'Bearer',
        expires_in: 3600,
      },
      'https://www.googleapis.com/oauth2/v3/userinfo': {
        sub: '109283019283',
        name: 'John Doe',
        email: 'john.doe@example.org',
        picture: 'https://google.com/avatar.jpg',
      },
    });

    const google = new GoogleOAuthDriver({
      clientId: 'test-client',
      clientSecret: 'test-secret',
      redirectUri: 'https://test.com/callback',
    });

    const result = await google.handleCallback('valid_authorization_code');

    expect(result.accessToken).toBe('google_test_access_token_999');
    expect(result.user.id).toBe('109283019283');
    expect(result.user.name).toBe('John Doe');
    expect(result.user.email).toBe('john.doe@example.org');
    expect(result.user.avatarUrl).toBe('https://google.com/avatar.jpg');
  });

  it('supports OAuth.fake() for painless controller unit tests', async () => {
    OAuth.fake({
      id: 'mock-user-42',
      email: 'sarah@company.com',
      name: 'Sarah Connor',
    });

    const driver = OAuth.driver('google');
    const result = await driver.handleCallback('any_code');

    expect(result.user.id).toBe('mock-user-42');
    expect(result.user.email).toBe('sarah@company.com');
    expect(result.user.name).toBe('Sarah Connor');
  });

  it('supports custom OAuth providers via OAuth.extend()', () => {
    OAuth.extend('discord', (cfg) => ({
      getRedirectUrl: () => `https://discord.com/oauth2/authorize?client_id=${cfg.clientId}`,
      getUserFromToken: async () => ({ id: '1', email: 'd@d.com', name: 'DiscordUser', avatarUrl: null, raw: {} }),
      handleCallback: async () => ({
        accessToken: 'tok',
        user: { id: '1', email: 'd@d.com', name: 'DiscordUser', avatarUrl: null, raw: {} },
      }),
    }));

    OAuth.configure({
      providers: {
        discord: {
          clientId: 'discord-app-1',
          clientSecret: 'discord-sec',
          redirectUri: 'https://app.com/discord',
        },
      },
    });

    const discord = OAuth.driver('discord');
    expect(discord.getRedirectUrl()).toContain('discord-app-1');
  });
});
