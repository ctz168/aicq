#!/usr/bin/env node
/**
 * AICQ Management UI — Standalone Test Server
 *
 * Reads CSS/JS from management-page.ts and serves a fully functional
 * management UI with mock API endpoints for development/testing.
 *
 * Usage:  node test-mgmt-ui.mjs
 * URL:    http://localhost:8099
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 8099;

// ══════════════════════════════════════════════════════════════
// Extract template literal content from the TypeScript source
// ══════════════════════════════════════════════════════════════

/**
 * Extract the raw content of a template literal from source text.
 * Handles escaped backticks (\`) and template expressions (${...}).
 */
function extractTemplateLiteral(source, marker) {
  const startIdx = source.indexOf(marker);
  if (startIdx === -1) {
    throw new Error(`Marker "${marker}" not found in source`);
  }

  let pos = startIdx + marker.length;
  let result = '';
  let exprDepth = 0; // tracks depth inside ${...}

  while (pos < source.length) {
    const ch = source[pos];

    if (exprDepth > 0) {
      // Inside a template expression ${...}
      if (ch === '{') exprDepth++;
      else if (ch === '}') {
        exprDepth--;
        if (exprDepth === 0) {
          result += ch;
          pos++;
          continue;
        }
      }
      result += ch;
      pos++;
    } else {
      // Outside template expression — looking for end of literal
      if (ch === '\\') {
        // Escape sequence: take the backslash + next char as-is
        result += source[pos] + (source[pos + 1] || '');
        pos += 2;
      } else if (ch === '`') {
        // Closing backtick — end of template literal
        break;
      } else if (ch === '$' && pos + 1 < source.length && source[pos + 1] === '{') {
        // Start of template expression
        result += '${';
        pos += 2;
        exprDepth = 1;
      } else {
        result += ch;
        pos++;
      }
    }
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// Load and parse the management-page.ts source
// ══════════════════════════════════════════════════════════════

const srcPath = join(__dirname, 'src', 'ui', 'management-page.ts');
console.log(`📄 Reading source: ${srcPath}`);

const source = readFileSync(srcPath, 'utf-8');

const cssContent = extractTemplateLiteral(source, 'const CSS = `');
const jsContent = extractTemplateLiteral(source, 'const JS = `');
const htmlTemplate = extractTemplateLiteral(source, 'const HTML = `');

// Build final HTML by interpolating CSS and JS into the HTML template
// Use split/join instead of replace() to avoid $-sign special interpretation
const finalHTML = htmlTemplate
  .split('${CSS}').join(cssContent)
  .split('${JS}').join(jsContent);

console.log(`✅ Parsed management-page.ts: CSS=${cssContent.length}B, JS=${jsContent.length}B, HTML=${finalHTML.length}B`);

// ══════════════════════════════════════════════════════════════
// Mock Data
// ══════════════════════════════════════════════════════════════

const mockData = {
  status: {
    connected: true,
    agentId: 'test-agent-123',
    fingerprint: 'abc123',
    friendCount: 3,
    sessionCount: 2,
    serverUrl: 'https://aicq.online:61018',
  },
  identity: {
    agentId: 'test-agent-123',
    publicKeyFingerprint: 'abc123def456',
    connected: true,
    serverUrl: 'https://aicq.online:61018',
  },
  friends: {
    friends: [
      {
        id: 'agent-001',
        publicKeyFingerprint: 'fp1abc123def456',
        permissions: ['chat'],
        addedAt: '2024-01-01T00:00:00Z',
        lastMessageAt: '2024-01-15T12:00:00Z',
        friendType: 'ai',
        aiName: 'Test Bot',
      },
      {
        id: 'agent-002',
        publicKeyFingerprint: 'fp2def789abc012',
        permissions: ['chat', 'exec'],
        addedAt: '2024-01-02T00:00:00Z',
        lastMessageAt: '2024-01-14T10:00:00Z',
        friendType: 'human',
        aiName: null,
      },
    ],
  },
  friendsRequests: {
    requests: [],
  },
  sessions: {
    sessions: [
      { peerId: 'agent-001', createdAt: '2024-01-10T00:00:00Z', messageCount: 15 },
      { peerId: 'agent-002', createdAt: '2024-01-12T00:00:00Z', messageCount: 5 },
    ],
  },
  agents: {
    agents: [
      {
        name: 'Main Agent',
        id: 'main',
        model: 'claude-opus-4',
        provider: 'anthropic',
        enabled: true,
        systemPrompt: 'You are a helpful assistant.',
      },
    ],
    configSource: 'openclaw.json',
  },
  models: {
    providers: [
      { id: 'openai', name: 'OpenAI', description: 'GPT-4o, GPT-4', configured: true, modelId: 'gpt-4o' },
      { id: 'anthropic', name: 'Anthropic', description: 'Claude 4, Claude 3.5 Sonnet', configured: true, modelId: 'claude-opus-4' },
      { id: 'google', name: 'Google AI', description: 'Gemini Pro, Gemini Flash', configured: false, modelId: null },
      { id: 'ollama', name: 'Ollama', description: 'Local models (Llama, Mistral, etc.)', configured: false, modelId: null },
    ],
    currentModels: [
      { provider: 'Anthropic', providerId: 'anthropic', modelId: 'claude-opus-4', hasApiKey: true },
    ],
  },
  config: {
    configPath: '~/.openclaw/openclaw.json',
    configSize: 1024,
    configModified: '2024-01-15T00:00:00Z',
  },
};

// ══════════════════════════════════════════════════════════════
// HTTP Request Handler
// ══════════════════════════════════════════════════════════════

function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  // Log the request
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${timestamp}] ${method} ${pathname}`);

  // ── Serve the management UI HTML at root ──
  if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(finalHTML);
    return;
  }

  // ── JSON response helper ──
  function json(data, statusCode = 200) {
    const body = JSON.stringify(data, null, 2);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(body);
  }

  // ── Handle CORS preflight ──
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // ── Mock API Endpoints ──

  // GET /api/status
  if (method === 'GET' && pathname === '/api/status') {
    return json(mockData.status);
  }

  // GET /api/identity
  if (method === 'GET' && pathname === '/api/identity') {
    return json(mockData.identity);
  }

  // GET /api/friends
  if (method === 'GET' && pathname === '/api/friends') {
    return json(mockData.friends);
  }

  // POST /api/friends (add friend)
  if (method === 'POST' && pathname === '/api/friends') {
    return json({ success: true, message: 'Friend request sent!' });
  }

  // DELETE /api/friends/:id (remove friend)
  if (method === 'DELETE' && pathname.startsWith('/api/friends/')) {
    const friendId = decodeURIComponent(pathname.replace('/api/friends/', ''));
    // Don't match sub-routes like /api/friends/requests or /api/friends/:id/permissions
    if (friendId.includes('/') || friendId === 'requests') {
      return json({ error: 'Not found' }, 404);
    }
    console.log(`  → Mock: remove friend "${friendId}"`);
    return json({ success: true, message: `Friend "${friendId}" removed` });
  }

  // PUT /api/friends/:id/permissions
  if (method === 'PUT' && pathname.match(/^\/api\/friends\/[^/]+\/permissions$/)) {
    const friendId = decodeURIComponent(pathname.split('/')[3]);
    console.log(`  → Mock: update permissions for "${friendId}"`);
    return json({ success: true, message: 'Permissions updated' });
  }

  // GET /api/friends/requests
  if (method === 'GET' && pathname === '/api/friends/requests') {
    return json(mockData.friendsRequests);
  }

  // POST /api/friends/requests/:id/accept
  if (method === 'POST' && pathname.match(/^\/api\/friends\/requests\/[^/]+\/accept$/)) {
    const reqId = decodeURIComponent(pathname.split('/')[4]);
    console.log(`  → Mock: accept friend request "${reqId}"`);
    return json({ success: true, message: 'Friend request accepted' });
  }

  // POST /api/friends/requests/:id/reject
  if (method === 'POST' && pathname.match(/^\/api\/friends\/requests\/[^/]+\/reject$/)) {
    const reqId = decodeURIComponent(pathname.split('/')[4]);
    console.log(`  → Mock: reject friend request "${reqId}"`);
    return json({ success: true, message: 'Friend request rejected' });
  }

  // GET /api/sessions
  if (method === 'GET' && pathname === '/api/sessions') {
    return json(mockData.sessions);
  }

  // GET /api/agents
  if (method === 'GET' && pathname === '/api/agents') {
    return json(mockData.agents);
  }

  // DELETE /api/agents/:index
  if (method === 'DELETE' && pathname.match(/^\/api\/agents\/\d+$/)) {
    const index = pathname.split('/')[3];
    console.log(`  → Mock: delete agent at index ${index}`);
    return json({ success: true, message: `Agent at index ${index} deleted` });
  }

  // GET /api/models
  if (method === 'GET' && pathname === '/api/models') {
    return json(mockData.models);
  }

  // PUT /api/models/:providerId
  if (method === 'PUT' && pathname.match(/^\/api\/models\/[^/]+$/)) {
    const providerId = decodeURIComponent(pathname.split('/')[3]);
    console.log(`  → Mock: update model config for "${providerId}"`);
    return json({ success: true, message: `Model configuration for "${providerId}" saved` });
  }

  // GET /api/config
  if (method === 'GET' && pathname === '/api/config') {
    return json(mockData.config);
  }

  // ── 404 fallback ──
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', path: pathname }));
}

// ══════════════════════════════════════════════════════════════
// Start the server
// ══════════════════════════════════════════════════════════════

const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   AICQ Management UI — Test Server              ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║   URL:  http://localhost:${PORT}                   ║`);
  console.log('║   Mode: Mock API (no real backend)               ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║   API Endpoints:                                ║');
  console.log('║     GET  /api/status       → Connection status  ║');
  console.log('║     GET  /api/identity     → Agent identity     ║');
  console.log('║     GET  /api/friends      → Friends list       ║');
  console.log('║     GET  /api/friends/requests → Pending reqs  ║');
  console.log('║     GET  /api/sessions     → Active sessions    ║');
  console.log('║     GET  /api/agents       → Agent configs      ║');
  console.log('║     GET  /api/models       → Model providers    ║');
  console.log('║     GET  /api/config       → Config info        ║');
  console.log('║     *    /api/*            → Mutation stubs     ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log('Press Ctrl+C to stop.');
  console.log('');
});
