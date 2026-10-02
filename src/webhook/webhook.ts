/**
 * @file webhook.ts
 * @description Zero-dependency Webhook Engine for AeroJS.
 * Supports outbound HMAC-SHA256 signed dispatches with retry backoff,
 * and inbound signature verification middleware.
 */

import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { UnauthorizedError } from '../core/errors.js';

export interface WebhookDispatchOptions {
  secret?: string;
  retries?: number;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface WebhookResult {
  success: boolean;
  statusCode: number;
  attempts: number;
  responseBody?: string;
}

export class Webhook {
  /**
   * Dispatches an outbound webhook payload with HMAC-SHA256 signing and auto-retries.
   */
  public static async dispatch(
    urlStr: string,
    payload: any,
    options: WebhookDispatchOptions = {}
  ): Promise<WebhookResult> {
    const maxRetries = options.retries ?? 3;
    const timeout = options.timeout ?? 5000;
    const bodyString = typeof payload === 'string' ? payload : JSON.stringify(payload);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(bodyString)),
      'User-Agent': 'AeroJS-Webhook/1.0',
      ...(options.headers || {}),
    };

    if (options.secret) {
      const hmac = crypto.createHmac('sha256', options.secret);
      hmac.update(bodyString);
      const signature = hmac.digest('hex');
      headers['X-Aero-Signature'] = `sha256=${signature}`;
    }

    let lastError: Error | null = null;
    let statusCode = 0;
    let responseBody = '';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.sendHttpRequest(urlStr, headers, bodyString, timeout);
        statusCode = result.statusCode;
        responseBody = result.body;

        if (statusCode >= 200 && statusCode < 300) {
          return {
            success: true,
            statusCode,
            attempts: attempt,
            responseBody,
          };
        }
      } catch (err: any) {
        lastError = err;
      }

      // If not the last attempt, wait with exponential backoff (e.g. 50ms, 100ms)
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 50));
      }
    }

    return {
      success: false,
      statusCode: statusCode || 500,
      attempts: maxRetries,
      responseBody: responseBody || lastError?.message,
    };
  }

  private static sendHttpRequest(
    urlStr: string,
    headers: Record<string, string>,
    body: string,
    timeout: number
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.request(
        url,
        {
          method: 'POST',
          headers,
          timeout,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            resolve({ statusCode: res.statusCode || 200, body: data });
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('Request timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Inbound Webhook Middleware verifying HMAC-SHA256 signature header.
   */
  public static verify(secret: string, headerName: string = 'x-aero-signature') {
    return async function (ctx: any, next: any) {
      const rawHeader =
        ctx.req.headers[headerName.toLowerCase()] ||
        ctx.req.headers['x-signature'] ||
        ctx.req.headers['x-hub-signature-256'];

      if (!rawHeader) {
        throw new UnauthorizedError('Missing webhook signature header.');
      }

      // Extract hex signature (supports "sha256=<hex>" or raw "<hex>")
      const expectedSignature = String(rawHeader).replace(/^sha256=/, '').trim();

      // Get payload string from parsed body or raw stream
      const rawBody =
        typeof ctx.body === 'string'
          ? ctx.body
          : ctx.body !== undefined
          ? JSON.stringify(ctx.body)
          : '';

      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(rawBody);
      const computedSignature = hmac.digest('hex');

      try {
        const expectedBuf = Buffer.from(expectedSignature, 'hex');
        const computedBuf = Buffer.from(computedSignature, 'hex');

        if (
          expectedBuf.length !== computedBuf.length ||
          !crypto.timingSafeEqual(expectedBuf, computedBuf)
        ) {
          throw new UnauthorizedError('Invalid webhook signature.');
        }
      } catch {
        throw new UnauthorizedError('Invalid webhook signature format.');
      }

      await next();
    };
  }
}
