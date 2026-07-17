import express, { NextFunction, Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { extractBearerToken } from '../integrations/auth';
import { getIntegrationStore } from '../integrations/runtime';
import { EMERGENCY_DISABLE_SETTING_KEY } from '../integrations/store';
import { IntegrationPrincipal } from '../integrations/types';
import { createAnimeMcpServer } from './server';

function jsonRpcError(response: Response, status: number, code: number, message: string) {
  response.status(status).json({
    jsonrpc: '2.0',
    id: null,
    error: { code, message },
  });
}

function allowedHosts(): Set<string> {
  const hosts = new Set(['localhost', '127.0.0.1', '::1']);
  const configuredUrl = process.env.PUBLIC_BASE_URL?.trim();
  if (configuredUrl) {
    try {
      hosts.add(new URL(configuredUrl).hostname.toLowerCase());
    } catch {
      // The public status endpoint reports configuration errors separately.
    }
  }
  for (const host of (process.env.MCP_ALLOWED_HOSTS || '').split(',')) {
    const normalized = host.trim().toLowerCase();
    if (normalized) hosts.add(normalized);
  }
  return hosts;
}

function validateHost(request: Request, response: Response, next: NextFunction) {
  if (allowedHosts().has(request.hostname.toLowerCase())) {
    next();
    return;
  }
  jsonRpcError(response, 421, -32000, 'The request host is not allowed for this MCP server.');
}

type AuthenticatedMcpRequest = Request & { integrationPrincipal?: IntegrationPrincipal };

const authenticationFailureLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: Math.max(3, Number.parseInt(process.env.MCP_AUTH_FAILURE_LIMIT || '10', 10) || 10),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip(request) {
    const store = getIntegrationStore();
    if (!store || store.getIntegrationSetting<boolean>(EMERGENCY_DISABLE_SETTING_KEY)?.value === true) {
      return true;
    }
    const bearer = extractBearerToken(request.header('authorization'));
    const principal = bearer ? store.authenticateIntegrationToken(bearer) : null;
    if (!principal) return false;
    (request as AuthenticatedMcpRequest).integrationPrincipal = principal;
    return true;
  },
  message: {
    jsonrpc: '2.0',
    id: null,
    error: { code: -32001, message: 'Too many failed MCP authentication attempts.' },
  },
});

function authenticateMcp(request: Request, response: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'production' && !process.env.PUBLIC_BASE_URL?.startsWith('https://')) {
    jsonRpcError(response, 503, -32000, 'The MCP service is unavailable.');
    return;
  }
  const store = getIntegrationStore();
  if (!store) {
    jsonRpcError(response, 503, -32000, 'The MCP service is unavailable.');
    return;
  }
  if (store.getIntegrationSetting<boolean>(EMERGENCY_DISABLE_SETTING_KEY)?.value === true) {
    jsonRpcError(response, 503, -32000, 'MCP access is disabled by an administrator.');
    return;
  }
  const cachedPrincipal = (request as AuthenticatedMcpRequest).integrationPrincipal;
  const bearer = extractBearerToken(request.header('authorization'));
  const principal = cachedPrincipal || (bearer ? store.authenticateIntegrationToken(bearer) : null);
  if (!principal) {
    store.appendAuditEvent({
      operation: 'mcp.authenticate',
      result: 'denied',
      requestId: response.locals.requestId,
      metadata: { reason: bearer ? 'invalid bearer token' : 'missing bearer token' },
    });
    response.setHeader('WWW-Authenticate', 'Bearer realm="anime-orchestrator"');
    jsonRpcError(response, 401, -32001, 'A valid scoped bearer token is required.');
    return;
  }
  response.locals.integrationStore = store;
  response.locals.integrationPrincipal = principal;
  next();
}

export function createMcpRouter(): Router {
  const router = Router();
  router.use(validateHost);
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store, private');
    next();
  });

  router.get('/', (_request, response) => {
    response.setHeader('Allow', 'POST');
    jsonRpcError(response, 405, -32000, 'This stateless MCP endpoint accepts POST requests only.');
  });

  router.delete('/', (_request, response) => {
    response.setHeader('Allow', 'POST');
    jsonRpcError(response, 405, -32000, 'This stateless MCP endpoint does not maintain deletable sessions.');
  });

  router.post(
    '/',
    authenticationFailureLimiter,
    authenticateMcp,
    express.json({ limit: '256kb', type: ['application/json', 'application/*+json'] }),
    async (request, response) => {
    const store = response.locals.integrationStore;
    const principal = response.locals.integrationPrincipal;

    const server = createAnimeMcpServer(principal, store, response.locals.requestId);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      await Promise.allSettled([transport.close(), server.close()]);
    };
    response.once('close', () => void close());

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      store.appendAuditEvent({
        operation: 'mcp.transport',
        result: 'failure',
        tokenId: principal.tokenId,
        requestId: response.locals.requestId,
        metadata: { error: error instanceof Error ? error.message : 'Unknown MCP transport error.' },
      });
      if (!response.headersSent) {
        jsonRpcError(response, 500, -32603, 'The MCP request could not be completed.');
      }
      await close();
    }
    },
  );

  router.use((_request, response) => {
    jsonRpcError(response, 404, -32601, 'MCP endpoint not found.');
  });

  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    const bodyError = error as { type?: string; status?: number };
    if (bodyError.type === 'entity.too.large' || bodyError.status === 413) {
      jsonRpcError(response, 413, -32600, 'The MCP request body exceeds the 256 KB limit.');
      return;
    }
    if (error instanceof SyntaxError) {
      jsonRpcError(response, 400, -32700, 'Invalid JSON request body.');
      return;
    }
    next(error);
  });

  return router;
}
