/**
 * @file 11-security-and-jwt.ts
 * @description Demonstrates Aero's zero-dependency Security features:
 * - Security Headers (Helmet-like)
 * - Rate Limiter with automated cleanup & HTTP 429 headers
 * - JWT Authentication (sign, verify, and jwtAuth middleware)
 */

import { Aero, jwt, jwtAuth } from '../src/index.js';

const app = new Aero({ debug: true });
const JWT_SECRET = 'aero-super-secret-key-production-ready';

// 1. Global Security Headers (nosniff, frameguard, XSS protection, HSTS, referrer policy)
app.useSecurityHeaders({
  frameOptions: 'SAMEORIGIN',
  hsts: { maxAge: 31536000, includeSubDomains: true },
});

// 2. Global Rate Limiter: max 20 requests per minute
app.useRateLimit({
  windowMs: 60_000,
  max: 20,
  message: { error: 'Rate limit exceeded. Slow down!' },
});

// 3. Public Route: Login to generate JWT token
app.post('/api/login', (ctx) => {
  const { username, password } = (ctx.body as any) || {};

  if (username === 'admin' && password === 'secret') {
    // Generate token expiring in 2 hours
    const token = jwt.sign(
      { userId: 101, username: 'admin', role: 'administrator' },
      JWT_SECRET,
      { expiresIn: '2h', issuer: 'aero-security' }
    );

    ctx.json({
      success: true,
      message: 'Login successful',
      token,
    });
  } else {
    ctx.throw(401, 'Invalid credentials');
  }
});

// 4. Protected Route Group using JWT Auth Middleware
app.group('/api/admin', (admin) => {
  admin.use(jwtAuth({ secret: JWT_SECRET }));

  admin.get('/dashboard', (ctx) => {
    ctx.json({
      message: 'Welcome to the protected dashboard!',
      user: ctx.state.user,
    });
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🛡️ Aero Security & JWT server running on http://localhost:${PORT}`);
});
