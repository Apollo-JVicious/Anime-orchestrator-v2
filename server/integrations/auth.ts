import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  INTEGRATION_SCOPES,
  IntegrationPermission,
  IntegrationPrincipal,
  IntegrationScope,
  IntegrationStoreError,
  JsonValue,
  AuthorizationRequirement,
  WRITE_INTEGRATION_SCOPES,
} from './types';

export type CredentialKind = 'integration' | 'admin' | 'confirmation';

export interface GeneratedCredential {
  id: string;
  prefix: string;
  bearer: string;
}

const CREDENTIAL_MARKERS: Record<CredentialKind, string> = {
  integration: 'ao',
  admin: 'aoa',
  confirmation: 'aoc',
};

const KNOWN_SCOPES = new Set<string>(INTEGRATION_SCOPES);
const REDACTED = '[REDACTED]';
const SECRET_KEY_PATTERN =
  /authorization|bearer|secret|password|cookie|api[-_]?key|token[_-]?hash|session[_-]?hash|confirmation[_-]?token|session[_-]?token|access[_-]?token|refresh[_-]?token|plaintext/i;
const CREDENTIAL_VALUE_PATTERN = /\bao(?:a|c)?_[0-9a-f-]{8,}\.[A-Za-z0-9_-]{20,}\b/gi;
const BEARER_VALUE_PATTERN = /\bBearer\s+[^\s,;]+/gi;

export function resolveIntegrationPepper(explicitPepper?: string): string {
  const pepper = explicitPepper ?? process.env.INTEGRATION_TOKEN_PEPPER ?? '';
  if (Buffer.byteLength(pepper, 'utf8') < 16) {
    throw new IntegrationStoreError(
      'CONFIGURATION_ERROR',
      'INTEGRATION_TOKEN_PEPPER must be configured with at least 16 bytes.',
    );
  }
  return pepper;
}

/** Generate a 256-bit one-time secret embedded in an identifiable bearer. */
export function generateCredential(kind: CredentialKind, id = randomUUID()): GeneratedCredential {
  const marker = CREDENTIAL_MARKERS[kind];
  const secret = randomBytes(32).toString('base64url');
  const bearer = `${marker}_${id}.${secret}`;
  return {
    id,
    prefix: `${marker}_${id.slice(0, 8)}`,
    bearer,
  };
}

/** HMAC-SHA-256 keeps the pepper secret and stores no recoverable credential. */
export function hashCredential(bearer: string, pepper: string): string {
  return `sha256:${createHmac('sha256', pepper).update(bearer, 'utf8').digest('hex')}`;
}

export function credentialHashMatches(
  bearer: string,
  storedHash: string,
  pepper: string,
): boolean {
  const candidate = Buffer.from(hashCredential(bearer, pepper), 'utf8');
  const stored = Buffer.from(storedHash, 'utf8');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

export function parseCredentialId(bearer: string, kind: CredentialKind): string | null {
  const marker = CREDENTIAL_MARKERS[kind];
  const separator = bearer.indexOf('.');
  if (separator <= marker.length + 1) return null;

  const identifierPart = bearer.slice(0, separator);
  if (!identifierPart.startsWith(`${marker}_`)) return null;
  const id = identifierPart.slice(marker.length + 1);
  const encodedSecret = bearer.slice(separator + 1);
  if (!/^[0-9a-f-]{8,}$/i.test(id) || !/^[A-Za-z0-9_-]+$/.test(encodedSecret)) return null;

  try {
    if (Buffer.from(encodedSecret, 'base64url').byteLength !== 32) return null;
  } catch {
    return null;
  }
  return id;
}

export function extractBearerToken(authorizationHeader?: string | null): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorizationHeader.trim());
  return match?.[1] ?? null;
}

export function normalizeIntegrationScopes(scopes: readonly string[]): IntegrationScope[] {
  const normalized = [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))];
  const unknown = normalized.find((scope) => !KNOWN_SCOPES.has(scope));
  if (unknown) {
    throw new IntegrationStoreError('VALIDATION_ERROR', `Unknown integration scope: ${unknown}`);
  }
  return normalized as IntegrationScope[];
}

export function assertPermissionSupportsScopes(
  permission: IntegrationPermission,
  scopes: readonly IntegrationScope[],
): void {
  if (permission === 'read-only' && scopes.some((scope) => WRITE_INTEGRATION_SCOPES.has(scope))) {
    throw new IntegrationStoreError(
      'VALIDATION_ERROR',
      'Read-only integration tokens cannot be assigned write or canon-approval scopes.',
    );
  }
}

export function authorizeIntegrationPrincipal(
  principal: IntegrationPrincipal,
  requirement: AuthorizationRequirement,
): void {
  if (requirement.write && principal.permission !== 'read-write') {
    throw new IntegrationStoreError(
      'AUTHORIZATION_DENIED',
      'This operation requires a read-write integration token.',
    );
  }
  if (requirement.scope && !principal.scopes.includes(requirement.scope)) {
    throw new IntegrationStoreError(
      'AUTHORIZATION_DENIED',
      `Integration token lacks required scope ${requirement.scope}.`,
    );
  }
  if (requirement.projectId && !principal.projectIds.includes(requirement.projectId)) {
    throw new IntegrationStoreError(
      'AUTHORIZATION_DENIED',
      'Integration token is not granted access to this project.',
    );
  }
}

export function isExpired(expiresAt: string | null, now = new Date()): boolean {
  return expiresAt !== null && Date.parse(expiresAt) <= now.getTime();
}

/**
 * Convert arbitrary metadata into bounded, JSON-safe data while removing
 * credential-like keys and values. Audit callers should still avoid passing
 * raw request headers or full request bodies.
 */
export function redactSecrets(value: unknown): JsonValue {
  const seen = new WeakSet<object>();

  const visit = (current: unknown, depth: number): JsonValue => {
    if (depth > 10) return '[MAX_DEPTH]';
    if (current === null) return null;
    if (typeof current === 'boolean') return current;
    if (typeof current === 'number') return Number.isFinite(current) ? current : String(current);
    if (typeof current === 'bigint') return current.toString();
    if (typeof current === 'string') {
      return current
        .replace(CREDENTIAL_VALUE_PATTERN, REDACTED)
        .replace(BEARER_VALUE_PATTERN, `Bearer ${REDACTED}`);
    }
    if (typeof current === 'undefined') return null;
    if (current instanceof Date) return current.toISOString();
    if (current instanceof Error) {
      return { name: current.name, message: visit(current.message, depth + 1) };
    }
    if (Array.isArray(current)) return current.slice(0, 500).map((item) => visit(item, depth + 1));
    if (typeof current === 'object') {
      if (seen.has(current)) return '[CIRCULAR]';
      seen.add(current);
      const output: { [key: string]: JsonValue } = {};
      for (const [key, nested] of Object.entries(current).slice(0, 500)) {
        output[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : visit(nested, depth + 1);
      }
      return output;
    }
    return String(current);
  };

  return visit(value, 0);
}
