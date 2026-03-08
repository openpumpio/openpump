/**
 * OpenPump MCP Server -- Streamable HTTP transport entry point.
 *
 * Exposes three endpoints under /mcp:
 *   POST   /mcp  -- Initialize new session (no mcp-session-id) or send messages to existing session
 *   GET    /mcp  -- Open SSE stream for server-to-client notifications
 *   DELETE /mcp  -- Terminate session and clean up in-memory state
 *
 * All /mcp routes require a valid API key via Authorization: Bearer or x-api-key header.
 *
 * Session lifecycle:
 *   - Sessions are created on POST /mcp without an mcp-session-id header
 *   - Sessions are stored in-memory with a configurable idle TTL (default: 4 hours)
 *   - Sessions are explicitly deleted on DELETE /mcp
 *   - If a POST arrives for an unknown session ID (e.g. after server restart), the
 *     server auto-recovers by recreating the session with the same ID.
 *
 * Environment variables:
 *   OPENPUMP_API_URL        - Required. Base URL of the OpenPump API (e.g. "https://openpump.io")
 *   PORT                    - Optional. HTTP port (default: 3001)
 *   MCP_SESSION_TTL_HOURS   - Optional. Session idle TTL in hours (default: 4)
 */
import express from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';
import { createApiKeyMiddleware } from './middleware/api-key-auth.js';
import type { UserContext } from './lib/context.js';

const API_BASE_URL = process.env['OPENPUMP_API_URL'] ?? 'https://openpump.io';

// -- Express app and session store ------------------------------------------

const app = express();
app.use(express.json());

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
}

// In-memory session store: sessionId -> { transport, lastActivity }
const sessions = new Map<string, SessionEntry>();

// Session idle TTL -- defaults to 4 hours so sessions survive long agent runs.
// Each request refreshes lastActivity, so active sessions never expire.
const SESSION_TTL_HOURS = Number(process.env['MCP_SESSION_TTL_HOURS'] ?? 4);
const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) {
    if (session.lastActivity < cutoff) {
      sessions.delete(id);
    }
  }
}, 60_000).unref();

// -- Balance enrichment -----------------------------------------------------
//
// Called once at session creation to populate live SOL balances on the
// userContext wallet list. Uses the REST API (which has a 30s Redis cache)
// so this is fast and doesn't spam the RPC on every tool call.

async function enrichWalletBalances(userContext: UserContext): Promise<UserContext> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/wallets`, {
      headers: { Authorization: `Bearer ${userContext.apiKey}` },
    });
    if (!res.ok) return userContext;

    const body = (await res.json()) as {
      data?: Array<{ id: string; solBalance?: number | null }>;
    };
    const list = body.data ?? [];
    const balanceMap = new Map(
      list
        .filter((w) => w.solBalance != null)
        .map((w) => [w.id, w.solBalance as number]),
    );

    if (balanceMap.size === 0) return userContext;

    return {
      ...userContext,
      wallets: userContext.wallets.map((w) => ({
        ...w,
        solBalance: balanceMap.get(w.id) ?? w.solBalance,
      })),
    };
  } catch {
    // Non-fatal -- continue with whatever balances we already have
    return userContext;
  }
}

// -- Auth middleware for all /mcp routes ------------------------------------

// eslint-disable-next-line @typescript-eslint/no-misused-promises
app.use('/mcp', createApiKeyMiddleware(API_BASE_URL));

// -- MCP request handler ---------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-misused-promises
app.all('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const sessionIdStr = typeof sessionId === 'string' ? sessionId : undefined;

  // userContext is attached by createApiKeyMiddleware
  const userContext = (req as express.Request & { userContext?: UserContext }).userContext;

  if (!userContext) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (req.method === 'POST' && !sessionIdStr) {
    // Enrich userContext with live SOL balances once at session creation.
    const enrichedContext = await enrichWalletBalances(userContext);

    // Pre-generate the session ID so we can store it before handleRequest runs.
    const newSessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      enableDnsRebindingProtection: false,
    });

    const mcpServer = createMcpServer(enrichedContext, API_BASE_URL);
    await mcpServer.connect(transport);

    sessions.set(newSessionId, { transport, lastActivity: Date.now() });

    await transport.handleRequest(req, res, req.body as Record<string, unknown>);
    return;
  }

  if (!sessionIdStr) {
    res.status(400).json({ error: 'Missing mcp-session-id header' });
    return;
  }

  let session = sessions.get(sessionIdStr);

  if (!session) {
    // Session not found -- most likely the server restarted and cleared in-memory state.
    //
    // For DELETE/GET: nothing to do without live state, return 404.
    // For POST: auto-recover by rebuilding the session with the SAME session ID.
    if (req.method !== 'POST') {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }

    const enrichedContext = await enrichWalletBalances(userContext);
    const recoveredTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionIdStr,
      enableDnsRebindingProtection: false,
    });

    const recoveredServer = createMcpServer(enrichedContext, API_BASE_URL);
    await recoveredServer.connect(recoveredTransport);

    // Only synthesize initialize when the real request is NOT already initialize.
    const incomingMethod = (req.body as { method?: string } | undefined)?.method;

    if (incomingMethod !== 'initialize') {
      const syntheticInitBody = {
        jsonrpc: '2.0',
        id: '__recover__',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'session-recover', version: '1.0' },
        },
      };

      // Minimal no-op sink -- satisfies the Node/Express response contract used by
      // StreamableHTTPServerTransport without writing anything to the real socket.
      const noopSink = {
        statusCode: 200,
        headersSent: false,
        setHeader: () => noopSink,
        getHeader: () => undefined,
        removeHeader: () => noopSink,
        writeHead: () => { noopSink.headersSent = true; return noopSink; },
        write: () => true,
        end: () => { noopSink.headersSent = true; return noopSink; },
        status: () => noopSink,
        json: () => noopSink,
        send: () => noopSink,
        on: () => noopSink,
        once: () => noopSink,
        off: () => noopSink,
        emit: () => true,
        flushHeaders: () => {},
      };

      try {
        await recoveredTransport.handleRequest(
          req,
          noopSink as unknown as import('express').Response,
          syntheticInitBody,
        );
      } catch {
        // Synthetic init failed -- proceed anyway; the real request will surface
        // a proper error if the SDK state machine is still unhappy.
      }
    }

    session = { transport: recoveredTransport, lastActivity: Date.now() };
    sessions.set(sessionIdStr, session);

    await recoveredTransport.handleRequest(req, res, req.body as Record<string, unknown>);
    return;
  }

  session.lastActivity = Date.now();

  if (req.method === 'DELETE') {
    sessions.delete(sessionIdStr);
    res.status(200).end();
    return;
  }

  // POST (continuation) or GET (SSE stream)
  await session.transport.handleRequest(req, res, req.body as Record<string, unknown>);
});

// -- Server startup ---------------------------------------------------------

const PORT = Number(process.env['PORT'] ?? 3001);

app.listen(PORT, () => {
  console.error(`OpenPump MCP server running on http://localhost:${PORT.toString()}/mcp`);
  console.error(`API base URL: ${API_BASE_URL}`);
});
