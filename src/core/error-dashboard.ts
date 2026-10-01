/**
 * @file error-dashboard.ts
 * @description Next.js & Laravel Ignition style Interactive Developer Error Dashboard for AeroJS.
 * Displays syntax/runtime exceptions with source code snippets, highlighted crash lines,
 * interactive call stacks, and request context in development mode.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AeroContext } from './context.js';

export interface StackFrame {
  method: string;
  file: string;
  line: number;
  column: number;
  isApp: boolean;
  snippet?: {
    startLine: number;
    errorLine: number;
    lines: { num: number; code: string; isError: boolean }[];
  };
}

/**
 * Parses Node.js Error.stack into structured StackFrames with source code snippets.
 */
export function parseStackTrace(stack: string): StackFrame[] {
  const lines = stack.split('\n').slice(1);
  const frames: StackFrame[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed.startsWith('at ')) continue;

    // Pattern 1: at MethodName (path/to/file.ts:12:34)
    // Pattern 2: at path/to/file.ts:12:34
    // Pattern 3: at async MethodName (path/to/file.ts:12:34)
    const match =
      /at (?:async )?(?:(.+?)\s+\((.+?):(\d+):(\d+)\)|(.+?):(\d+):(\d+))/.exec(trimmed);

    if (match) {
      const method = match[1] || '<anonymous>';
      let filePath = match[2] || match[5] || '';
      const line = parseInt(match[3] || match[6] || '0', 10);
      const column = parseInt(match[4] || match[7] || '0', 10);

      // Convert file:// URL to path if necessary
      if (filePath.startsWith('file://')) {
        try {
          filePath = fileURLToPath(filePath);
        } catch {
          // ignore
        }
      }

      const isNodeInternal = filePath.startsWith('node:') || !filePath.includes('/') && !filePath.includes('\\');
      const isNodeModules = filePath.includes('node_modules');
      const isApp = !isNodeInternal && !isNodeModules;

      const frame: StackFrame = {
        method,
        file: filePath,
        line,
        column,
        isApp,
      };

      // Extract source code snippet if file exists
      if (line > 0 && existsSync(filePath)) {
        try {
          const content = readFileSync(filePath, 'utf-8');
          const allLines = content.split(/\r?\n/);
          const start = Math.max(1, line - 5);
          const end = Math.min(allLines.length, line + 5);

          const snippetLines: { num: number; code: string; isError: boolean }[] = [];
          for (let i = start; i <= end; i++) {
            snippetLines.push({
              num: i,
              code: allLines[i - 1] ?? '',
              isError: i === line,
            });
          }

          frame.snippet = {
            startLine: start,
            errorLine: line,
            lines: snippetLines,
          };
        } catch {
          // File reading error ignored
        }
      }

      frames.push(frame);
    }
  }

  return frames;
}

function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Renders the Interactive Next.js style Error Dashboard HTML.
 */
export function renderErrorDashboard(
  error: Error,
  ctx: AeroContext<any>,
  options: { status?: number; code?: string } = {}
): string {
  const status = options.status || 500;
  const code = options.code || 'INTERNAL_SERVER_ERROR';
  const errorName = error.name || 'Error';
  const errorMessage = error.message || 'An unhandled exception occurred in application code.';
  const stack = error.stack || `${errorName}: ${errorMessage}`;
  const frames = parseStackTrace(stack);

  // Find the most relevant frame with source snippet (prefer application frame)
  const primaryFrame = frames.find((f) => f.isApp && f.snippet) || frames.find((f) => f.snippet) || frames[0];

  const reqHeaders = ctx.req.headers;
  const reqQuery = ctx.req.query || {};
  const reqParams = ctx.req.params || {};
  const reqBody = ctx.body;
  const method = ctx.method || 'GET';
  const url = ctx.url || '/';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(errorName)}: ${escapeHtml(errorMessage)} — AeroJS Error Dashboard</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --card-header: #162032;
      --border: #1f2937;
      --border-focus: #374151;
      --danger: #ef4444;
      --danger-soft: rgba(239, 68, 68, 0.15);
      --danger-border: rgba(239, 68, 68, 0.35);
      --text: #f9fafb;
      --text-muted: #9ca3af;
      --text-subtle: #6b7280;
      --brand: #38bdf8;
      --code-bg: #030712;
      --highlight: rgba(239, 68, 68, 0.22);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding-bottom: 5rem;
    }
    .top-bar {
      background: #030712;
      border-bottom: 1px solid var(--border);
      padding: 0.85rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .logo-badge {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .badge-error {
      background: var(--danger-soft);
      color: #f87171;
      border: 1px solid var(--danger-border);
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .req-badge {
      font-family: ui-monospace, Menlo, Consolas, monospace;
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .copy-btn {
      background: #1f2937;
      border: 1px solid #374151;
      color: #e5e7eb;
      padding: 0.4rem 0.9rem;
      border-radius: 0.4rem;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .copy-btn:hover {
      background: #374151;
      color: #fff;
    }
    .container {
      max-width: 1200px;
      margin: 2rem auto;
      padding: 0 1.5rem;
    }
    /* Hero Error Header */
    .hero-error {
      margin-bottom: 2rem;
    }
    .error-type {
      font-size: 0.95rem;
      font-weight: 700;
      color: #f87171;
      letter-spacing: 0.02em;
      margin-bottom: 0.4rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .error-title {
      font-size: 1.85rem;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.02em;
      line-height: 1.25;
      word-break: break-word;
    }
    /* Code Snippet Card */
    .snippet-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      overflow: hidden;
      margin-bottom: 2rem;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .snippet-header {
      background: var(--card-header);
      padding: 0.75rem 1.25rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: ui-monospace, Menlo, monospace;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .snippet-file {
      color: var(--brand);
      font-weight: 600;
    }
    .code-viewer {
      background: var(--code-bg);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.85rem;
      overflow-x: auto;
      padding: 0.75rem 0;
    }
    .code-line {
      display: flex;
      padding: 0.15rem 1rem;
      line-height: 1.6;
    }
    .code-line.error-highlight {
      background: var(--highlight);
      border-left: 3px solid var(--danger);
    }
    .line-number {
      width: 45px;
      color: #4b5563;
      user-select: none;
      text-align: right;
      padding-right: 1.25rem;
    }
    .code-line.error-highlight .line-number {
      color: #f87171;
      font-weight: 700;
    }
    .line-content {
      color: #e5e7eb;
      white-space: pre;
    }
    /* Tabs Section */
    .tabs-nav {
      display: flex;
      gap: 0.5rem;
      border-bottom: 1px solid var(--border);
      margin-bottom: 1.5rem;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 0.75rem 1.25rem;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }
    .tab-btn.active {
      color: var(--brand);
      border-bottom-color: var(--brand);
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
    /* Stack Trace List */
    .stack-list {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      overflow: hidden;
    }
    .stack-item {
      padding: 0.75rem 1.25rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: ui-monospace, Menlo, monospace;
      font-size: 0.85rem;
    }
    .stack-item:last-child {
      border-bottom: none;
    }
    .stack-item.app-frame {
      background: rgba(56, 189, 248, 0.04);
    }
    .stack-method {
      color: #fff;
      font-weight: 600;
    }
    .stack-loc {
      color: var(--text-subtle);
      font-size: 0.8rem;
    }
    .stack-item.app-frame .stack-loc {
      color: var(--brand);
    }
    /* Table inspector */
    .inspector-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      overflow: hidden;
      margin-bottom: 1.5rem;
    }
    .inspector-table th, .inspector-table td {
      padding: 0.75rem 1.25rem;
      text-align: left;
      font-size: 0.88rem;
      border-bottom: 1px solid var(--border);
    }
    .inspector-table th {
      background: var(--card-header);
      color: var(--text-muted);
      width: 25%;
      font-family: ui-monospace, Menlo, monospace;
    }
    .inspector-table td {
      font-family: ui-monospace, Menlo, monospace;
      color: #e5e7eb;
      word-break: break-all;
    }
    .inspector-table tr:last-child th, .inspector-table tr:last-child td {
      border-bottom: none;
    }
  </style>
</head>
<body>
  <div class="top-bar">
    <div class="logo-badge">
      <span style="font-weight: 800; font-size: 1.1rem; color: #fff;">🚀 AeroJS</span>
      <span class="badge-error">${escapeHtml(status)} &bull; ${escapeHtml(code)}</span>
      <span class="req-badge">${escapeHtml(method)} ${escapeHtml(url)}</span>
    </div>
    <div>
      <button class="copy-btn" id="copy-stack-btn">Copy Stack Trace</button>
    </div>
  </div>

  <div class="container">
    <!-- Hero Error Title -->
    <div class="hero-error">
      <div class="error-type">
        <span>⚠️</span> ${escapeHtml(errorName)}
      </div>
      <h1 class="error-title">${escapeHtml(errorMessage)}</h1>
    </div>

    <!-- Code Snippet Box -->
    ${
      primaryFrame?.snippet
        ? `
    <div class="snippet-card">
      <div class="snippet-header">
        <span class="snippet-file">${escapeHtml(primaryFrame.file)}:${escapeHtml(primaryFrame.line)}</span>
        <span>Line ${escapeHtml(primaryFrame.line)}</span>
      </div>
      <div class="code-viewer">
        ${primaryFrame.snippet.lines
          .map(
            (l) => `
          <div class="code-line ${l.isError ? 'error-highlight' : ''}">
            <span class="line-number">${l.isError ? '→ ' : ''}${l.num}</span>
            <span class="line-content">${escapeHtml(l.code)}</span>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
    `
        : `
    <div class="snippet-card" style="padding: 1.5rem;">
      <p style="color: var(--text-muted);">No local source file preview available for this stack frame.</p>
    </div>
    `
    }

    <!-- Tab Navigation -->
    <div class="tabs-nav">
      <button class="tab-btn active" onclick="switchTab('stack')">Call Stack (${frames.length})</button>
      <button class="tab-btn" onclick="switchTab('request')">Request Context</button>
      <button class="tab-btn" onclick="switchTab('system')">System & Environment</button>
    </div>

    <!-- Tab 1: Stack Trace -->
    <div id="tab-stack" class="tab-content active">
      <div class="stack-list">
        ${frames
          .map(
            (f) => `
          <div class="stack-item ${f.isApp ? 'app-frame' : ''}">
            <div>
              <span class="stack-method">${escapeHtml(f.method)}</span>
            </div>
            <div class="stack-loc">${escapeHtml(f.file)}:${escapeHtml(f.line)}:${escapeHtml(f.column)}</div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>

    <!-- Tab 2: Request Context -->
    <div id="tab-request" class="tab-content">
      <h3 style="margin-bottom: 0.75rem; color: #fff; font-size: 1.1rem;">Request Information</h3>
      <table class="inspector-table">
        <tr><th>Method</th><td>${escapeHtml(method)}</td></tr>
        <tr><th>URL</th><td>${escapeHtml(url)}</td></tr>
        <tr><th>Path Parameters</th><td>${escapeHtml(JSON.stringify(reqParams))}</td></tr>
        <tr><th>Query Parameters</th><td>${escapeHtml(JSON.stringify(reqQuery))}</td></tr>
        <tr><th>Parsed Body</th><td>${escapeHtml(reqBody ? JSON.stringify(reqBody, null, 2) : 'None')}</td></tr>
      </table>

      <h3 style="margin-bottom: 0.75rem; color: #fff; font-size: 1.1rem;">Request Headers</h3>
      <table class="inspector-table">
        ${Object.entries(reqHeaders)
          .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`)
          .join('')}
      </table>
    </div>

    <!-- Tab 3: System & Environment -->
    <div id="tab-system" class="tab-content">
      <h3 style="margin-bottom: 0.75rem; color: #fff; font-size: 1.1rem;">Environment</h3>
      <table class="inspector-table">
        <tr><th>Node.js Version</th><td>${escapeHtml(process.version)}</td></tr>
        <tr><th>Platform</th><td>${escapeHtml(process.platform)} (${escapeHtml(process.arch)})</td></tr>
        <tr><th>Framework</th><td>AeroJS v0.1.0</td></tr>
        <tr><th>Working Directory</th><td>${escapeHtml(process.cwd())}</td></tr>
        <tr><th>Process ID (PID)</th><td>${escapeHtml(process.pid)}</td></tr>
        <tr><th>Memory (Heap Used)</th><td>${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB</td></tr>
      </table>
    </div>
  </div>

  <script>
    function switchTab(tabName) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
      document.getElementById('tab-' + tabName).classList.add('active');
      event.target.classList.add('active');
    }

    const rawStack = ${JSON.stringify(stack)};
    document.getElementById('copy-stack-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(rawStack).then(() => {
        const btn = document.getElementById('copy-stack-btn');
        btn.innerText = 'Copied to Clipboard!';
        setTimeout(() => { btn.innerText = 'Copy Stack Trace'; }, 2000);
      });
    });
  </script>
</body>
</html>`;
}
