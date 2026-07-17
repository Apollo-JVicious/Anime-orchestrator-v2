import { createHash, timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db';
import { MCP_SERVER_VERSION } from '../mcp/metadata';
import { EMERGENCY_DISABLE_SETTING_KEY, IntegrationStore } from './store';
import {
  AdminSessionRecord,
  INTEGRATION_SCOPES,
  IntegrationStoreError,
  IntegrationTokenRecord,
} from './types';
import { getIntegrationConfigurationError, getIntegrationStore } from './runtime';

export const ADMIN_SESSION_COOKIE = 'anime_orchestrator_admin';

const adminSessionSchema = z.object({
  adminKey: z.string().min(16).max(512),
}).strict();

const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(120),
  permission: z.enum(['read-only', 'read-write']),
  scopes: z.array(z.enum(INTEGRATION_SCOPES)).min(1).max(INTEGRATION_SCOPES.length),
  projectIds: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();

const reasonSchema = z.object({
  reason: z.string().trim().min(3).max(2_000),
}).strict();

const statusSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().min(3).max(2_000),
  confirmation: z.enum(['ENABLE MCP', 'DISABLE MCP']),
}).strict();

function parseCookie(request: Request, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function secureEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest();
  const rightHash = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function publicBaseUrl(): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;
  return `http://localhost:${Number.parseInt(process.env.PORT || '3000', 10)}`;
}

function configTemplate(endpoint: string): string {
  return [
    '[mcp_servers.anime_orchestrator]',
    'enabled = true',
    'required = true',
    `url = "${endpoint.replace(/[\r\n"]/g, '')}"`,
    'bearer_token_env_var = "ANIME_ORCHESTRATOR_TOKEN"',
    'startup_timeout_sec = 20',
    'tool_timeout_sec = 120',
  ].join('\n');
}

function serverState(store: IntegrationStore | null) {
  const endpoint = `${publicBaseUrl()}/mcp`;
  const configurationError = getIntegrationConfigurationError();
  const insecureProductionEndpoint = process.env.NODE_ENV === 'production' && !endpoint.startsWith('https://');
  const emergencyDisabled = store
    ? store.getIntegrationSetting<boolean>(EMERGENCY_DISABLE_SETTING_KEY)?.value === true
    : false;
  const enabled = Boolean(store && !emergencyDisabled && !insecureProductionEndpoint);
  return {
    server: {
      enabled,
      status: configurationError
        ? 'Misconfigured'
        : insecureProductionEndpoint
          ? 'HTTPS required'
          : emergencyDisabled
            ? 'Disabled'
            : 'Ready',
      endpoint,
      transport: 'Streamable HTTP',
      version: MCP_SERVER_VERSION,
      adminAuthRequired: true,
    },
    configTemplate: configTemplate(endpoint),
  };
}

function validationError(response: Response, error: z.ZodError) {
  return response.status(400).json({
    error: 'Invalid request.',
    issues: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
  });
}

function errorStatus(error: unknown): number {
  if (!(error instanceof IntegrationStoreError)) return 500;
  if (error.code === 'AUTHENTICATION_FAILED') return 401;
  if (error.code === 'AUTHORIZATION_DENIED') return 403;
  if (error.code === 'NOT_FOUND') return 404;
  if (error.code === 'VERSION_CONFLICT') return 409;
  if (error.code === 'CONFIGURATION_ERROR') return 503;
  return 400;
}

function sendError(response: Response, error: unknown) {
  const status = errorStatus(error);
  const message = error instanceof Error ? error.message : 'Integration request failed.';
  return response.status(status).json({ error: status === 500 ? 'Integration request failed.' : message });
}

function requireStore(response: Response): IntegrationStore | null {
  const store = getIntegrationStore();
  if (store) return store;
  const configurationError = getIntegrationConfigurationError();
  response.status(503).json({
    error: configurationError?.message || 'Integration service is not configured.',
  });
  return null;
}

function adminSessionForRequest(request: Request, store: IntegrationStore): AdminSessionRecord | null {
  const sessionToken = parseCookie(request, ADMIN_SESSION_COOKIE);
  return sessionToken ? store.authenticateAdminSession(sessionToken) : null;
}

export function requireIntegrationAdmin(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const store = requireStore(response);
  if (!store) return;
  const session = adminSessionForRequest(request, store);
  if (!session) {
    response.status(401).json({ error: 'An active integrations administrator session is required.' });
    return;
  }
  response.locals.integrationAdminSession = session;
  next();
}

function adminSession(response: Response): AdminSessionRecord {
  return response.locals.integrationAdminSession as AdminSessionRecord;
}

function tokenSummary(token: IntegrationTokenRecord) {
  return {
    ...token,
    tokenPrefix: token.prefix,
    status: token.revokedAt
      ? 'revoked'
      : token.expiresAt && Date.parse(token.expiresAt) <= Date.now()
        ? 'expired'
        : 'active',
  };
}

function activity(store: IntegrationStore) {
  const tokenNames = new Map(store.listIntegrationTokens().map(token => [token.id, token.name]));
  return store.listAuditEvents({ limit: 100 }).map(event => ({
    ...event,
    timestamp: event.occurredAt,
    action: event.operation,
    tokenName: event.tokenId ? tokenNames.get(event.tokenId) : undefined,
    summary: [
      event.targetType && event.targetId ? `${event.targetType}:${event.targetId}` : event.targetType,
      event.projectId ? `project ${event.projectId}` : null,
    ].filter(Boolean).join(' · ') || 'Redacted integration activity.',
  }));
}

const bootstrapLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: Math.max(3, Number.parseInt(process.env.MCP_AUTH_FAILURE_LIMIT || '10', 10) || 10),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many failed administrator authentication attempts. Try again later.' },
});

export function createIntegrationRouter(): Router {
  const router = Router();

  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store, private');
    response.setHeader('Pragma', 'no-cache');
    next();
  });

  router.get('/status', (_request, response) => {
    response.json(serverState(getIntegrationStore()));
  });

  router.post('/admin/session', bootstrapLimiter, (request, response) => {
    const parsed = adminSessionSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);
    const store = requireStore(response);
    if (!store) return;
    const configuredAdminToken = process.env.INTEGRATIONS_ADMIN_TOKEN || '';
    if (configuredAdminToken.length < 16) {
      response.status(503).json({ error: 'INTEGRATIONS_ADMIN_TOKEN is not configured securely.' });
      return;
    }
    if (!secureEqual(parsed.data.adminKey, configuredAdminToken)) {
      store.appendAuditEvent({
        operation: 'integration.admin-session.authenticate',
        result: 'denied',
        requestId: response.locals.requestId,
        metadata: { reason: 'invalid bootstrap credential' },
      });
      response.status(401).json({ error: 'Administrator authentication failed.' });
      return;
    }
    try {
      const session = store.createAdminSession({ subject: 'codex-integrations-ui' });
      response.cookie(ADMIN_SESSION_COOKIE, session.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api',
        maxAge: Math.max(0, Date.parse(session.expiresAt) - Date.now()),
      });
      response.status(201).json({ ok: true, expiresAt: session.expiresAt });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.use(requireIntegrationAdmin);

  router.get('/overview', (_request, response) => {
    const store = getIntegrationStore()!;
    response.json({
      ...serverState(store),
      tokens: store.listIntegrationTokens().map(tokenSummary),
      projects: db.getProjects().map(project => ({ id: project.id, title: project.title })),
      activity: activity(store),
    });
  });

  router.post('/tokens', (request, response) => {
    const parsed = createTokenSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);
    const knownProjectIds = new Set(db.getProjects().map(project => project.id));
    const unknownProjectId = parsed.data.projectIds.find(projectId => !knownProjectIds.has(projectId));
    if (unknownProjectId) {
      response.status(400).json({ error: `Unknown project grant: ${unknownProjectId}` });
      return;
    }
    const store = getIntegrationStore()!;
    try {
      const created = store.createIntegrationToken({
        name: parsed.data.name!,
        permission: parsed.data.permission!,
        scopes: parsed.data.scopes!,
        projectIds: parsed.data.projectIds!,
        expiresAt: parsed.data.expiresAt,
        createdByAdminSessionId: adminSession(response).id,
      });
      const { bearerToken, ...token } = created;
      response.status(201).json({
        token: tokenSummary(token),
        plaintextToken: bearerToken,
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/tokens/:tokenId/revoke', (request, response) => {
    const parsed = reasonSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);
    const store = getIntegrationStore()!;
    try {
      if (!store.revokeIntegrationToken(request.params.tokenId)) {
        response.status(404).json({ error: 'Active integration token not found.' });
        return;
      }
      store.appendAuditEvent({
        operation: 'integration.token.revoke.confirmed',
        result: 'success',
        adminSessionId: adminSession(response).id,
        targetType: 'integration-token',
        targetId: request.params.tokenId,
        requestId: response.locals.requestId,
        metadata: { reason: parsed.data.reason },
      });
      response.json({ ok: true });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/test', (_request, response) => {
    const startedAt = performance.now();
    const store = getIntegrationStore()!;
    const state = serverState(store);
    response.json({
      ok: state.server.enabled,
      checkedAt: new Date().toISOString(),
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      serverVersion: MCP_SERVER_VERSION,
      capabilities: ['tools', 'resources', 'streamable-http', 'bearer-auth'],
      message: state.server.enabled ? 'Integration storage and MCP routing are ready.' : state.server.status,
    });
  });

  router.patch('/status', (request, response) => {
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);
    const requiredConfirmation = parsed.data.enabled ? 'ENABLE MCP' : 'DISABLE MCP';
    if (parsed.data.confirmation !== requiredConfirmation) {
      response.status(400).json({ error: `Type ${requiredConfirmation} to confirm this operation.` });
      return;
    }
    const store = getIntegrationStore()!;
    const session = adminSession(response);
    try {
      store.setIntegrationSetting(
        EMERGENCY_DISABLE_SETTING_KEY,
        !parsed.data.enabled,
        session.id,
      );
      store.appendAuditEvent({
        operation: parsed.data.enabled ? 'integration.mcp.enable' : 'integration.mcp.disable',
        result: 'success',
        adminSessionId: session.id,
        requestId: response.locals.requestId,
        metadata: { reason: parsed.data.reason, explicitConfirmation: true },
      });
      response.json(serverState(store));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get('/activity', (_request, response) => {
    response.json({ activity: activity(getIntegrationStore()!) });
  });

  return router;
}

function insecureLocalModeEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_INSECURE_LOCAL_API === 'true';
}

function legacyWritesRequireAuthentication(): boolean {
  if (insecureLocalModeEnabled()) return false;
  return process.env.REQUIRE_LEGACY_WRITE_AUTH !== 'false';
}

function legacyReadsRequireAuthentication(): boolean {
  if (insecureLocalModeEnabled()) return false;
  if (process.env.REQUIRE_LEGACY_READ_AUTH === 'true') return true;
  return process.env.NODE_ENV === 'production' && process.env.REQUIRE_LEGACY_READ_AUTH !== 'false';
}

export function legacyReadGuard(request: Request, response: Response, next: NextFunction) {
  if (!['GET', 'HEAD'].includes(request.method) || !legacyReadsRequireAuthentication()) {
    next();
    return;
  }
  const store = requireStore(response);
  if (!store) return;
  const session = adminSessionForRequest(request, store);
  if (!session) {
    store.appendAuditEvent({
      operation: 'legacy-rest.read',
      result: 'denied',
      requestId: response.locals.requestId,
      metadata: { method: request.method, path: request.path },
    });
    response.status(401).json({
      error: 'Authenticate in Codex Integrations before reading production data.',
    });
    return;
  }
  next();
}

export function legacyWriteGuard(request: Request, response: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method) || !legacyWritesRequireAuthentication()) {
    next();
    return;
  }
  const store = requireStore(response);
  if (!store) return;
  const session = adminSessionForRequest(request, store);
  if (!session) {
    store.appendAuditEvent({
      operation: 'legacy-rest.write',
      result: 'denied',
      requestId: response.locals.requestId,
      metadata: { method: request.method, path: request.path },
    });
    response.status(401).json({
      error: 'Authenticate in Codex Integrations before using legacy REST write operations.',
    });
    return;
  }
  response.on('finish', () => {
    store.appendAuditEvent({
      operation: 'legacy-rest.write',
      result: response.statusCode < 400 ? 'success' : 'failure',
      adminSessionId: session.id,
      requestId: response.locals.requestId,
      metadata: { method: request.method, path: request.path, statusCode: response.statusCode },
    });
  });
  next();
}
