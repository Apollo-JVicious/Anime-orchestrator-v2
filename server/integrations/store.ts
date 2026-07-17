import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  AppendAuditEventInput,
  ApproveCanonChangeProposalInput,
  CanonChangeProposalRecord,
  CanonVersionState,
  CreateAdminSessionInput,
  CreateCanonChangeProposalInput,
  CreateDraftChangeInput,
  CreatedAdminSession,
  CreatedGenerationJob,
  CreatedIntegrationToken,
  CreateGenerationJobInput,
  CreateIntegrationTokenInput,
  DraftChangeRecord,
  GenerationJobRecord,
  IntegrationPrincipal,
  IntegrationSettingRecord,
  IntegrationStoreError,
  IntegrationStoreOptions,
  IntegrationTokenRecord,
  JsonValue,
  ListAuditEventsFilter,
  McpAuditEventRecord,
  OptimisticConcurrencyError,
  UpdateDraftChangeInput,
  AdminSessionRecord,
} from './types';
import {
  assertPermissionSupportsScopes,
  credentialHashMatches,
  generateCredential,
  hashCredential,
  isExpired,
  normalizeIntegrationScopes,
  parseCredentialId,
  redactSecrets,
  resolveIntegrationPepper,
} from './auth';
import { runIntegrationMigrations } from './migrations';

type SqlRow = Record<string, unknown>;
type SqlParameter = string | number | bigint | null;

export const EMERGENCY_DISABLE_SETTING_KEY = 'emergencyDisabled';
const DANGEROUS_JSON_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_JSON_DEPTH = 24;
const MAX_JSON_NODES = 20_000;
const MAX_JSON_COLLECTION_ITEMS = 2_000;
const MAX_JSON_BYTES = 1_000_000;

function requiredString(value: unknown, name: string, maxLength = 500): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new IntegrationStoreError('VALIDATION_ERROR', `${name} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new IntegrationStoreError(
      'VALIDATION_ERROR',
      `${name} must be ${maxLength} characters or fewer.`,
    );
  }
  return normalized;
}

function optionalString(value: unknown, name: string, maxLength = 2_000): string | null {
  if (value === null || typeof value === 'undefined' || value === '') return null;
  return requiredString(value, name, maxLength);
}

function normalizeIsoTimestamp(value: string, name: string): string {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) {
    throw new IntegrationStoreError('VALIDATION_ERROR', `${name} must be an ISO date.`);
  }
  return new Date(epoch).toISOString();
}

function normalizeFutureTimestamp(value: string, name: string, now: Date): string {
  const normalized = normalizeIsoTimestamp(value, name);
  if (Date.parse(normalized) <= now.getTime()) {
    throw new IntegrationStoreError('VALIDATION_ERROR', `${name} must be in the future.`);
  }
  return normalized;
}

function uniqueStrings(values: readonly string[], name: string): string[] {
  if (!Array.isArray(values)) {
    throw new IntegrationStoreError('VALIDATION_ERROR', `${name} must be an array.`);
  }
  const normalized = [...new Set(values.map((value) => requiredString(value, name, 200)))];
  if (normalized.length === 0) {
    throw new IntegrationStoreError('VALIDATION_ERROR', `${name} must not be empty.`);
  }
  return normalized;
}

function ensureJsonValue(value: unknown, name: string): JsonValue {
  let nodes = 0;
  const visit = (current: unknown, seen: WeakSet<object>, depth: number): JsonValue => {
    nodes += 1;
    if (nodes > MAX_JSON_NODES) {
      throw new IntegrationStoreError('VALIDATION_ERROR', `${name} is too complex.`);
    }
    if (depth > MAX_JSON_DEPTH) {
      throw new IntegrationStoreError('VALIDATION_ERROR', `${name} exceeds the maximum nesting depth.`);
    }
    if (current === null) return null;
    if (typeof current === 'string' || typeof current === 'boolean') return current;
    if (typeof current === 'number' && Number.isFinite(current)) return current;
    if (Array.isArray(current)) {
      if (current.length > MAX_JSON_COLLECTION_ITEMS) {
        throw new IntegrationStoreError('VALIDATION_ERROR', `${name} contains an oversized array.`);
      }
      return current.map((item) => visit(item, seen, depth + 1));
    }
    if (typeof current === 'object') {
      if (seen.has(current)) {
        throw new IntegrationStoreError('VALIDATION_ERROR', `${name} must not be circular.`);
      }
      seen.add(current);
      const entries = Object.entries(current);
      if (entries.length > MAX_JSON_COLLECTION_ITEMS) {
        throw new IntegrationStoreError('VALIDATION_ERROR', `${name} contains too many object keys.`);
      }
      const output: { [key: string]: JsonValue } = {};
      for (const [key, nested] of entries) {
        if (DANGEROUS_JSON_KEYS.has(key)) {
          throw new IntegrationStoreError('VALIDATION_ERROR', `${name} contains an unsafe object key.`);
        }
        if (typeof nested === 'undefined' || typeof nested === 'function' || typeof nested === 'symbol') {
          throw new IntegrationStoreError(
            'VALIDATION_ERROR',
            `${name} contains a value that cannot be stored as JSON.`,
          );
        }
        output[key] = visit(nested, seen, depth + 1);
      }
      seen.delete(current);
      return output;
    }
    throw new IntegrationStoreError(
      'VALIDATION_ERROR',
      `${name} contains a value that cannot be stored as JSON.`,
    );
  };

  const normalized = visit(value, new WeakSet<object>(), 0);
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_JSON_BYTES) {
    throw new IntegrationStoreError('VALIDATION_ERROR', `${name} exceeds the maximum serialized size.`);
  }
  return normalized;
}

function jsonString(value: unknown, name: string): string {
  return JSON.stringify(ensureJsonValue(value, name));
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stringColumn(row: SqlRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error(`Invalid database value for ${key}.`);
  return value;
}

function nullableStringColumn(row: SqlRow, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' ? value : null;
}

function numberColumn(row: SqlRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' && typeof value !== 'bigint') {
    throw new Error(`Invalid database value for ${key}.`);
  }
  return Number(value);
}

function nullableNumberColumn(row: SqlRow, key: string): number | null {
  const value = row[key];
  if (value === null || typeof value === 'undefined') return null;
  return numberColumn(row, key);
}

function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** RFC 7396-style merge patch: null removes an object key. */
function mergeJsonPatch(target: JsonValue, patch: Record<string, unknown>): JsonValue {
  const output: { [key: string]: JsonValue } = isJsonObject(target) ? { ...target } : {};
  for (const [key, rawValue] of Object.entries(patch)) {
    if (DANGEROUS_JSON_KEYS.has(key)) {
      throw new IntegrationStoreError('VALIDATION_ERROR', 'patch contains an unsafe object key.');
    }
    if (rawValue === null) {
      delete output[key];
      continue;
    }
    if (typeof rawValue === 'object' && rawValue !== null && !Array.isArray(rawValue)) {
      output[key] = mergeJsonPatch(output[key] ?? {}, rawValue as Record<string, unknown>);
      continue;
    }
    output[key] = ensureJsonValue(rawValue, `patch.${key}`);
  }
  return output;
}

export class IntegrationStore {
  private readonly database: DatabaseSync;
  private readonly pepper: string;
  private readonly now: () => Date;
  public readonly databasePath: string;
  private closed = false;

  constructor(options: IntegrationStoreOptions = {}) {
    this.databasePath =
      options.databasePath ??
      process.env.INTEGRATIONS_DB_PATH ??
      path.join(process.cwd(), 'data', 'integrations.sqlite');
    this.pepper = resolveIntegrationPepper(options.pepper);
    this.now = options.now ?? (() => new Date());

    if (this.databasePath !== ':memory:') {
      fs.mkdirSync(path.dirname(path.resolve(this.databasePath)), { recursive: true });
    }

    this.database = new DatabaseSync(this.databasePath);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (this.databasePath !== ':memory:') {
      this.database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    }
    runIntegrationMigrations(this.database);
  }

  close(): void {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  getIntegrationSetting<T extends JsonValue = JsonValue>(
    key: string,
  ): IntegrationSettingRecord<T> | null {
    const normalizedKey = requiredString(key, 'setting key', 100);
    const row = this.database
      .prepare(
        `SELECT key, value_json, updated_at, updated_by_admin_session_id
         FROM integration_settings WHERE key = ?`,
      )
      .get(normalizedKey) as SqlRow | undefined;
    if (!row) return null;
    return {
      key: stringColumn(row, 'key'),
      value: parseJson<T>(row.value_json, null as T),
      updatedAt: stringColumn(row, 'updated_at'),
      updatedByAdminSessionId: nullableStringColumn(row, 'updated_by_admin_session_id'),
    };
  }

  listIntegrationSettings(): IntegrationSettingRecord[] {
    return this.database
      .prepare(
        `SELECT key, value_json, updated_at, updated_by_admin_session_id
         FROM integration_settings ORDER BY key`,
      )
      .all()
      .map((rawRow) => {
        const row = rawRow as SqlRow;
        return {
          key: stringColumn(row, 'key'),
          value: parseJson<JsonValue>(row.value_json, null),
          updatedAt: stringColumn(row, 'updated_at'),
          updatedByAdminSessionId: nullableStringColumn(row, 'updated_by_admin_session_id'),
        };
      });
  }

  setIntegrationSetting<T extends JsonValue>(
    key: string,
    value: T,
    updatedByAdminSessionId: string | null = null,
  ): IntegrationSettingRecord<T> {
    const normalizedKey = requiredString(key, 'setting key', 100);
    const normalizedValue = ensureJsonValue(value, 'setting value') as T;
    const updatedAt = this.nowIso();
    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO integration_settings
             (key, value_json, updated_at, updated_by_admin_session_id)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             value_json = excluded.value_json,
             updated_at = excluded.updated_at,
             updated_by_admin_session_id = excluded.updated_by_admin_session_id`,
        )
        .run(normalizedKey, JSON.stringify(normalizedValue), updatedAt, updatedByAdminSessionId);
      this.appendAuditEventInternal({
        operation: 'integration.setting.update',
        result: 'success',
        adminSessionId: updatedByAdminSessionId,
        targetType: 'integration-setting',
        targetId: normalizedKey,
        metadata: { key: normalizedKey },
        occurredAt: updatedAt,
      });
    });
    return {
      key: normalizedKey,
      value: normalizedValue,
      updatedAt,
      updatedByAdminSessionId,
    };
  }

  // -------------------------------------------------------------------------
  // Integration tokens
  // -------------------------------------------------------------------------

  createIntegrationToken(input: CreateIntegrationTokenInput): CreatedIntegrationToken {
    const name = requiredString(input.name, 'token name', 120);
    if (input.permission !== 'read-only' && input.permission !== 'read-write') {
      throw new IntegrationStoreError('VALIDATION_ERROR', 'Invalid integration permission.');
    }
    const scopes = normalizeIntegrationScopes(input.scopes);
    if (scopes.length === 0) {
      throw new IntegrationStoreError('VALIDATION_ERROR', 'At least one scope is required.');
    }
    assertPermissionSupportsScopes(input.permission, scopes);
    const projectIds = uniqueStrings(input.projectIds, 'projectIds');
    const now = this.now();
    const createdAt = now.toISOString();
    const expiresAt = input.expiresAt
      ? normalizeFutureTimestamp(input.expiresAt, 'expiresAt', now)
      : null;
    const createdByAdminSessionId = input.createdByAdminSessionId ?? null;
    const credential = generateCredential('integration');
    const tokenHash = hashCredential(credential.bearer, this.pepper);

    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO integration_tokens
             (id, token_prefix, token_hash, name, permission, scopes_json, expires_at,
              revoked_at, created_at, created_by_admin_session_id, last_used_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
        )
        .run(
          credential.id,
          credential.prefix,
          tokenHash,
          name,
          input.permission,
          JSON.stringify(scopes),
          expiresAt,
          createdAt,
          createdByAdminSessionId,
        );
      const grantStatement = this.database.prepare(
        `INSERT INTO integration_token_projects (token_id, project_id, created_at)
         VALUES (?, ?, ?)`,
      );
      for (const projectId of projectIds) {
        grantStatement.run(credential.id, projectId, createdAt);
      }
      this.appendAuditEventInternal({
        operation: 'integration.token.create',
        result: 'success',
        adminSessionId: createdByAdminSessionId,
        targetType: 'integration-token',
        targetId: credential.id,
        metadata: { prefix: credential.prefix, permission: input.permission, scopes, projectIds },
        occurredAt: createdAt,
      });
    });

    return {
      id: credential.id,
      prefix: credential.prefix,
      name,
      permission: input.permission,
      scopes,
      projectIds,
      expiresAt,
      revokedAt: null,
      createdAt,
      createdByAdminSessionId,
      lastUsedAt: null,
      bearerToken: credential.bearer,
    };
  }

  listIntegrationTokens(): IntegrationTokenRecord[] {
    return this.database
      .prepare(
        `SELECT id, token_prefix, name, permission, scopes_json, expires_at, revoked_at,
                created_at, created_by_admin_session_id, last_used_at
         FROM integration_tokens ORDER BY created_at DESC`,
      )
      .all()
      .map((row) => this.integrationTokenFromRow(row as SqlRow));
  }

  revokeIntegrationToken(tokenId: string, revokedAt = this.nowIso()): boolean {
    const id = requiredString(tokenId, 'tokenId', 100);
    const normalizedRevokedAt = normalizeIsoTimestamp(revokedAt, 'revokedAt');
    return this.transaction(() => {
      const result = this.database
        .prepare(
          `UPDATE integration_tokens SET revoked_at = ?
           WHERE id = ? AND revoked_at IS NULL`,
        )
        .run(normalizedRevokedAt, id);
      if (Number(result.changes) === 0) return false;
      this.appendAuditEventInternal({
        operation: 'integration.token.revoke',
        result: 'success',
        targetType: 'integration-token',
        targetId: id,
        metadata: { revokedAt: normalizedRevokedAt },
        occurredAt: normalizedRevokedAt,
      });
      return true;
    });
  }

  authenticateIntegrationToken(bearer: string): IntegrationPrincipal | null {
    if (this.getIntegrationSetting<boolean>(EMERGENCY_DISABLE_SETTING_KEY)?.value === true) {
      return null;
    }
    const tokenId = parseCredentialId(bearer, 'integration');
    if (!tokenId) return null;
    const row = this.database
      .prepare(
        `SELECT id, token_prefix, token_hash, name, permission, scopes_json, expires_at, revoked_at
         FROM integration_tokens WHERE id = ?`,
      )
      .get(tokenId) as SqlRow | undefined;
    if (!row || !credentialHashMatches(bearer, stringColumn(row, 'token_hash'), this.pepper)) {
      return null;
    }
    const expiresAt = nullableStringColumn(row, 'expires_at');
    if (nullableStringColumn(row, 'revoked_at') || isExpired(expiresAt, this.now())) return null;

    const scopes = normalizeIntegrationScopes(
      parseJson<string[]>(row.scopes_json, []),
    );
    const permission = stringColumn(row, 'permission');
    if (permission !== 'read-only' && permission !== 'read-write') return null;
    assertPermissionSupportsScopes(permission, scopes);
    const projectIds = this.projectGrantsForToken(tokenId);
    const usedAt = this.nowIso();
    this.database
      .prepare('UPDATE integration_tokens SET last_used_at = ? WHERE id = ?')
      .run(usedAt, tokenId);

    return {
      kind: 'integration-token',
      tokenId,
      tokenPrefix: stringColumn(row, 'token_prefix'),
      tokenName: stringColumn(row, 'name'),
      permission,
      scopes,
      projectIds,
      expiresAt,
    };
  }

  private integrationTokenFromRow(row: SqlRow): IntegrationTokenRecord {
    const id = stringColumn(row, 'id');
    const permission = stringColumn(row, 'permission');
    if (permission !== 'read-only' && permission !== 'read-write') {
      throw new Error('Invalid stored token permission.');
    }
    return {
      id,
      prefix: stringColumn(row, 'token_prefix'),
      name: stringColumn(row, 'name'),
      permission,
      scopes: normalizeIntegrationScopes(parseJson<string[]>(row.scopes_json, [])),
      projectIds: this.projectGrantsForToken(id),
      expiresAt: nullableStringColumn(row, 'expires_at'),
      revokedAt: nullableStringColumn(row, 'revoked_at'),
      createdAt: stringColumn(row, 'created_at'),
      createdByAdminSessionId: nullableStringColumn(row, 'created_by_admin_session_id'),
      lastUsedAt: nullableStringColumn(row, 'last_used_at'),
    };
  }

  private projectGrantsForToken(tokenId: string): string[] {
    return this.database
      .prepare(
        `SELECT project_id FROM integration_token_projects
         WHERE token_id = ? ORDER BY project_id`,
      )
      .all(tokenId)
      .map((row) => stringColumn(row as SqlRow, 'project_id'));
  }

  // -------------------------------------------------------------------------
  // Admin sessions
  // -------------------------------------------------------------------------

  createAdminSession(input: CreateAdminSessionInput): CreatedAdminSession {
    const subject = requiredString(input.subject, 'subject', 200);
    const now = this.now();
    const createdAt = now.toISOString();
    const defaultExpiry = new Date(now.getTime() + 8 * 60 * 60 * 1_000).toISOString();
    const expiresAt = normalizeFutureTimestamp(
      input.expiresAt ?? defaultExpiry,
      'expiresAt',
      now,
    );
    const credential = generateCredential('admin');
    const sessionHash = hashCredential(credential.bearer, this.pepper);
    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO admin_sessions
             (id, session_prefix, session_hash, subject, created_at, expires_at, revoked_at, last_used_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
        )
        .run(
          credential.id,
          credential.prefix,
          sessionHash,
          subject,
          createdAt,
          expiresAt,
        );
      this.appendAuditEventInternal({
        operation: 'integration.admin-session.create',
        result: 'success',
        adminSessionId: credential.id,
        targetType: 'admin-session',
        targetId: credential.id,
        metadata: { prefix: credential.prefix, subject, expiresAt },
        occurredAt: createdAt,
      });
    });
    return {
      id: credential.id,
      prefix: credential.prefix,
      subject,
      createdAt,
      expiresAt,
      revokedAt: null,
      lastUsedAt: null,
      sessionToken: credential.bearer,
    };
  }

  authenticateAdminSession(bearer: string): AdminSessionRecord | null {
    const sessionId = parseCredentialId(bearer, 'admin');
    if (!sessionId) return null;
    const row = this.database
      .prepare(
        `SELECT id, session_prefix, session_hash, subject, created_at, expires_at,
                revoked_at, last_used_at
         FROM admin_sessions WHERE id = ?`,
      )
      .get(sessionId) as SqlRow | undefined;
    if (!row || !credentialHashMatches(bearer, stringColumn(row, 'session_hash'), this.pepper)) {
      return null;
    }
    if (
      nullableStringColumn(row, 'revoked_at') ||
      isExpired(stringColumn(row, 'expires_at'), this.now())
    ) {
      return null;
    }
    const lastUsedAt = this.nowIso();
    this.database
      .prepare('UPDATE admin_sessions SET last_used_at = ? WHERE id = ?')
      .run(lastUsedAt, sessionId);
    return this.adminSessionFromRow({ ...row, last_used_at: lastUsedAt });
  }

  revokeAdminSession(sessionId: string): boolean {
    const id = requiredString(sessionId, 'sessionId', 100);
    const revokedAt = this.nowIso();
    return this.transaction(() => {
      const result = this.database
        .prepare('UPDATE admin_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
        .run(revokedAt, id);
      if (Number(result.changes) === 0) return false;
      this.appendAuditEventInternal({
        operation: 'integration.admin-session.revoke',
        result: 'success',
        adminSessionId: id,
        targetType: 'admin-session',
        targetId: id,
        metadata: { revokedAt },
        occurredAt: revokedAt,
      });
      return true;
    });
  }

  private adminSessionFromRow(row: SqlRow): AdminSessionRecord {
    return {
      id: stringColumn(row, 'id'),
      prefix: stringColumn(row, 'session_prefix'),
      subject: stringColumn(row, 'subject'),
      createdAt: stringColumn(row, 'created_at'),
      expiresAt: stringColumn(row, 'expires_at'),
      revokedAt: nullableStringColumn(row, 'revoked_at'),
      lastUsedAt: nullableStringColumn(row, 'last_used_at'),
    };
  }

  private isActiveAdminSessionId(sessionId: string): boolean {
    const row = this.database
      .prepare('SELECT expires_at, revoked_at FROM admin_sessions WHERE id = ?')
      .get(sessionId) as SqlRow | undefined;
    return Boolean(
      row &&
        !nullableStringColumn(row, 'revoked_at') &&
        !isExpired(stringColumn(row, 'expires_at'), this.now()),
    );
  }

  // -------------------------------------------------------------------------
  // Audit events
  // -------------------------------------------------------------------------

  appendAuditEvent(input: AppendAuditEventInput): McpAuditEventRecord {
    return this.appendAuditEventInternal(input);
  }

  private appendAuditEventInternal(input: AppendAuditEventInput): McpAuditEventRecord {
    const record: McpAuditEventRecord = {
      id: randomUUID(),
      occurredAt: input.occurredAt
        ? normalizeIsoTimestamp(input.occurredAt, 'occurredAt')
        : this.nowIso(),
      operation: requiredString(input.operation, 'operation', 200),
      result: input.result,
      tokenId: input.tokenId ?? null,
      adminSessionId: input.adminSessionId ?? null,
      projectId: optionalString(input.projectId, 'projectId', 200),
      targetType: optionalString(input.targetType, 'targetType', 100),
      targetId: optionalString(input.targetId, 'targetId', 200),
      requestId: optionalString(input.requestId, 'requestId', 200),
      metadata: redactSecrets(input.metadata ?? {}),
    };
    if (!['success', 'denied', 'failure'].includes(record.result)) {
      throw new IntegrationStoreError('VALIDATION_ERROR', 'Invalid audit result.');
    }
    this.database
      .prepare(
        `INSERT INTO mcp_audit_events
           (id, occurred_at, operation, result, token_id, admin_session_id, project_id,
            target_type, target_id, request_id, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.occurredAt,
        record.operation,
        record.result,
        record.tokenId,
        record.adminSessionId,
        record.projectId,
        record.targetType,
        record.targetId,
        record.requestId,
        JSON.stringify(record.metadata),
      );
    return record;
  }

  listAuditEvents(filter: ListAuditEventsFilter = {}): McpAuditEventRecord[] {
    const where: string[] = [];
    const parameters: SqlParameter[] = [];
    if (filter.projectId) {
      where.push('project_id = ?');
      parameters.push(filter.projectId);
    }
    if (filter.tokenId) {
      where.push('token_id = ?');
      parameters.push(filter.tokenId);
    }
    if (filter.operation) {
      where.push('operation = ?');
      parameters.push(filter.operation);
    }
    if (filter.before) {
      where.push('occurred_at < ?');
      parameters.push(normalizeIsoTimestamp(filter.before, 'before'));
    }
    const limit = Math.max(1, Math.min(filter.limit ?? 100, 500));
    parameters.push(limit);
    const rows = this.database
      .prepare(
        `SELECT id, occurred_at, operation, result, token_id, admin_session_id,
                project_id, target_type, target_id, request_id, metadata_json
         FROM mcp_audit_events
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY occurred_at DESC LIMIT ?`,
      )
      .all(...parameters);
    return rows.map((row) => this.auditEventFromRow(row as SqlRow));
  }

  private auditEventFromRow(row: SqlRow): McpAuditEventRecord {
    const result = stringColumn(row, 'result');
    if (result !== 'success' && result !== 'denied' && result !== 'failure') {
      throw new Error('Invalid stored audit result.');
    }
    return {
      id: stringColumn(row, 'id'),
      occurredAt: stringColumn(row, 'occurred_at'),
      operation: stringColumn(row, 'operation'),
      result,
      tokenId: nullableStringColumn(row, 'token_id'),
      adminSessionId: nullableStringColumn(row, 'admin_session_id'),
      projectId: nullableStringColumn(row, 'project_id'),
      targetType: nullableStringColumn(row, 'target_type'),
      targetId: nullableStringColumn(row, 'target_id'),
      requestId: nullableStringColumn(row, 'request_id'),
      metadata: parseJson<JsonValue>(row.metadata_json, {}),
    };
  }

  // -------------------------------------------------------------------------
  // Versioned drafts
  // -------------------------------------------------------------------------

  createDraftChange(input: CreateDraftChangeInput): DraftChangeRecord {
    const projectId = requiredString(input.projectId, 'projectId', 200);
    const entityType = requiredString(input.entityType, 'entityType', 100);
    const entityId = requiredString(input.entityId, 'entityId', 200);
    const payload = ensureJsonValue(input.payload, 'payload');
    const sourceNote = requiredString(input.sourceNote, 'sourceNote', 2_000);
    const reason = optionalString(input.reason, 'reason', 2_000);
    const createdAt = this.nowIso();

    return this.transaction(() => {
      const existing = this.latestDraftRow(projectId, entityType, entityId);
      if (existing) {
        throw new OptimisticConcurrencyError(0, numberColumn(existing, 'version'));
      }
      const record: DraftChangeRecord = {
        id: randomUUID(),
        projectId,
        entityType,
        entityId,
        version: 1,
        payload,
        sourceNote,
        reason,
        createdByTokenId: input.createdByTokenId ?? null,
        createdAt,
      };
      this.insertDraft(record);
      this.appendAuditEventInternal({
        operation: 'draft.create',
        result: 'success',
        tokenId: record.createdByTokenId,
        projectId,
        targetType: entityType,
        targetId: entityId,
        metadata: { draftId: record.id, version: record.version, sourceNote },
        occurredAt: createdAt,
      });
      return record;
    });
  }

  getLatestDraftChange(
    projectId: string,
    entityType: string,
    entityId: string,
  ): DraftChangeRecord | null {
    const row = this.database
      .prepare(
        `SELECT * FROM draft_changes
         WHERE project_id = ? AND entity_type = ? AND entity_id = ?
         ORDER BY version DESC LIMIT 1`,
      )
      .get(projectId, entityType, entityId) as SqlRow | undefined;
    return row ? this.draftFromRow(row) : null;
  }

  listLatestDraftChanges(projectId: string, entityType?: string): DraftChangeRecord[] {
    const normalizedProjectId = requiredString(projectId, 'projectId', 200);
    const normalizedEntityType = entityType
      ? requiredString(entityType, 'entityType', 100)
      : null;
    const rows = this.database
      .prepare(
        `SELECT draft.*
         FROM draft_changes AS draft
         INNER JOIN (
           SELECT entity_type, entity_id, MAX(version) AS latest_version
           FROM draft_changes
           WHERE project_id = ? AND (? IS NULL OR entity_type = ?)
           GROUP BY entity_type, entity_id
         ) AS latest
           ON latest.entity_type = draft.entity_type
          AND latest.entity_id = draft.entity_id
          AND latest.latest_version = draft.version
         WHERE draft.project_id = ?
         ORDER BY draft.entity_type, draft.entity_id`,
      )
      .all(
        normalizedProjectId,
        normalizedEntityType,
        normalizedEntityType,
        normalizedProjectId,
      );
    return rows.map((row) => this.draftFromRow(row as SqlRow));
  }

  updateDraftChange(input: UpdateDraftChangeInput): DraftChangeRecord {
    const projectId = requiredString(input.projectId, 'projectId', 200);
    const entityType = requiredString(input.entityType, 'entityType', 100);
    const entityId = requiredString(input.entityId, 'entityId', 200);
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new IntegrationStoreError('VALIDATION_ERROR', 'expectedVersion must be positive.');
    }
    if (!input.patch || typeof input.patch !== 'object' || Array.isArray(input.patch)) {
      throw new IntegrationStoreError('VALIDATION_ERROR', 'patch must be an object.');
    }
    const reason = requiredString(input.reason, 'reason', 2_000);
    const createdAt = this.nowIso();

    return this.transaction(() => {
      const latestRow = this.latestDraftRow(projectId, entityType, entityId);
      const actualVersion = latestRow ? numberColumn(latestRow, 'version') : null;
      if (!latestRow || actualVersion !== input.expectedVersion) {
        throw new OptimisticConcurrencyError(input.expectedVersion, actualVersion);
      }
      if (stringColumn(latestRow, 'project_id') !== projectId) {
        throw new IntegrationStoreError('AUTHORIZATION_DENIED', 'Draft belongs to another project.');
      }
      const latest = this.draftFromRow(latestRow);
      const record: DraftChangeRecord = {
        id: randomUUID(),
        projectId,
        entityType,
        entityId,
        version: latest.version + 1,
        payload: mergeJsonPatch(latest.payload, input.patch),
        sourceNote: input.sourceNote
          ? requiredString(input.sourceNote, 'sourceNote', 2_000)
          : latest.sourceNote,
        reason,
        createdByTokenId: input.createdByTokenId ?? null,
        createdAt,
      };
      this.insertDraft(record);
      this.appendAuditEventInternal({
        operation: 'draft.update',
        result: 'success',
        tokenId: record.createdByTokenId,
        projectId,
        targetType: entityType,
        targetId: entityId,
        metadata: {
          draftId: record.id,
          previousVersion: latest.version,
          version: record.version,
          reason,
        },
        occurredAt: createdAt,
      });
      return record;
    });
  }

  private latestDraftRow(
    projectId: string,
    entityType: string,
    entityId: string,
  ): SqlRow | undefined {
    return this.database
      .prepare(
        `SELECT * FROM draft_changes
         WHERE project_id = ? AND entity_type = ? AND entity_id = ?
         ORDER BY version DESC LIMIT 1`,
      )
      .get(projectId, entityType, entityId) as SqlRow | undefined;
  }

  private insertDraft(record: DraftChangeRecord): void {
    this.database
      .prepare(
        `INSERT INTO draft_changes
           (id, project_id, entity_type, entity_id, version, payload_json, source_note,
            reason, created_by_token_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.projectId,
        record.entityType,
        record.entityId,
        record.version,
        JSON.stringify(record.payload),
        record.sourceNote,
        record.reason,
        record.createdByTokenId,
        record.createdAt,
      );
  }

  private draftFromRow(row: SqlRow): DraftChangeRecord {
    return {
      id: stringColumn(row, 'id'),
      projectId: stringColumn(row, 'project_id'),
      entityType: stringColumn(row, 'entity_type'),
      entityId: stringColumn(row, 'entity_id'),
      version: numberColumn(row, 'version'),
      payload: parseJson<JsonValue>(row.payload_json, {}),
      sourceNote: stringColumn(row, 'source_note'),
      reason: nullableStringColumn(row, 'reason'),
      createdByTokenId: nullableStringColumn(row, 'created_by_token_id'),
      createdAt: stringColumn(row, 'created_at'),
    };
  }

  // -------------------------------------------------------------------------
  // Canon-change proposals
  // -------------------------------------------------------------------------

  createCanonChangeProposal(
    input: CreateCanonChangeProposalInput,
  ): CanonChangeProposalRecord {
    const createdAt = this.nowIso();
    if (!Number.isSafeInteger(input.baseVersion) || input.baseVersion < 0) {
      throw new IntegrationStoreError('VALIDATION_ERROR', 'baseVersion must be a non-negative integer.');
    }
    const baseDigest = requiredString(input.baseDigest, 'baseDigest', 128);
    if (!/^[a-f0-9]{64}$/i.test(baseDigest)) {
      throw new IntegrationStoreError('VALIDATION_ERROR', 'baseDigest must be a SHA-256 hex digest.');
    }
    const record: CanonChangeProposalRecord = {
      id: randomUUID(),
      projectId: requiredString(input.projectId, 'projectId', 200),
      entityType: requiredString(input.entityType, 'entityType', 100),
      entityId: requiredString(input.entityId, 'entityId', 200),
      baseVersion: input.baseVersion,
      baseDigest: baseDigest.toLowerCase(),
      oldValue: ensureJsonValue(input.oldValue, 'oldValue'),
      proposedValue: ensureJsonValue(input.proposedValue, 'proposedValue'),
      reason: requiredString(input.reason, 'reason', 4_000),
      affectedAssetIds: input.affectedAssetIds
        ? [...new Set(input.affectedAssetIds.map((id) => requiredString(id, 'affectedAssetIds', 200)))]
        : [],
      continuityImpact: ensureJsonValue(input.continuityImpact ?? {}, 'continuityImpact'),
      status: 'Pending',
      createdByTokenId: input.createdByTokenId ?? null,
      createdAt,
      approvedByTokenId: null,
      approvedByAdminSessionId: null,
      approvedAt: null,
      applicationStatus: 'NotApproved',
      applicationError: null,
      appliedAt: null,
      newVersion: null,
    };
    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO canon_change_proposals
             (id, project_id, entity_type, entity_id, base_version, base_digest,
              old_value_json, proposed_value_json,
              reason, affected_assets_json, continuity_impact_json, status,
              created_by_token_id, created_at, approved_by_token_id,
              approved_by_admin_session_id, approved_at, application_status,
              application_error, applied_at, new_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, NULL)`,
        )
        .run(
          record.id,
          record.projectId,
          record.entityType,
          record.entityId,
          record.baseVersion,
          record.baseDigest,
          JSON.stringify(record.oldValue),
          JSON.stringify(record.proposedValue),
          record.reason,
          JSON.stringify(record.affectedAssetIds),
          JSON.stringify(record.continuityImpact),
          record.status,
          record.createdByTokenId,
          record.createdAt,
          record.applicationStatus,
        );
      this.appendAuditEventInternal({
        operation: 'canon-change.propose',
        result: 'success',
        tokenId: record.createdByTokenId,
        projectId: record.projectId,
        targetType: record.entityType,
        targetId: record.entityId,
        metadata: { proposalId: record.id, affectedAssetIds: record.affectedAssetIds },
        occurredAt: createdAt,
      });
    });
    return record;
  }

  getCanonChangeProposal(proposalId: string): CanonChangeProposalRecord | null {
    const row = this.database
      .prepare('SELECT * FROM canon_change_proposals WHERE id = ?')
      .get(proposalId) as SqlRow | undefined;
    return row ? this.canonProposalFromRow(row) : null;
  }

  getCurrentCanonVersion(
    projectId: string,
    entityType: string,
    entityId: string,
  ): CanonVersionState | null {
    const row = this.database
      .prepare(
        `SELECT project_id, entity_type, entity_id, version, proposal_id,
                application_status, updated_at
         FROM canon_current_versions
         WHERE project_id = ? AND entity_type = ? AND entity_id = ?`,
      )
      .get(projectId, entityType, entityId) as SqlRow | undefined;
    if (!row) return null;
    const applicationStatus = stringColumn(row, 'application_status');
    if (!['PendingApply', 'Applied', 'ApplyFailed'].includes(applicationStatus)) {
      throw new Error('Invalid canon application status.');
    }
    return {
      projectId: stringColumn(row, 'project_id'),
      entityType: stringColumn(row, 'entity_type'),
      entityId: stringColumn(row, 'entity_id'),
      version: numberColumn(row, 'version'),
      proposalId: stringColumn(row, 'proposal_id'),
      applicationStatus: applicationStatus as CanonVersionState['applicationStatus'],
      updatedAt: stringColumn(row, 'updated_at'),
    };
  }

  approveCanonChangeProposal(
    input: ApproveCanonChangeProposalInput,
  ): CanonChangeProposalRecord {
    if (input.confirmed !== true) {
      throw new IntegrationStoreError(
        'CONFIRMATION_REQUIRED',
        'Explicit confirmation is required to approve a canon change.',
      );
    }
    const tokenId = input.approvedByTokenId ?? null;
    const adminSessionId = input.approvedByAdminSessionId ?? null;
    if (Boolean(tokenId) === Boolean(adminSessionId)) {
      throw new IntegrationStoreError(
        'VALIDATION_ERROR',
        'Exactly one approval actor is required.',
      );
    }
    const approvedAt = this.nowIso();

    return this.transaction(() => {
      const row = this.database
        .prepare('SELECT * FROM canon_change_proposals WHERE id = ?')
        .get(input.proposalId) as SqlRow | undefined;
      if (!row) throw new IntegrationStoreError('NOT_FOUND', 'Canon-change proposal not found.');
      const current = this.canonProposalFromRow(row);
      if (current.status !== 'Pending') {
        throw new IntegrationStoreError(
          'VERSION_CONFLICT',
          `Canon-change proposal is already ${current.status.toLowerCase()}.`,
        );
      }
      if (adminSessionId && !this.isActiveAdminSessionId(adminSessionId)) {
        throw new IntegrationStoreError('AUTHENTICATION_FAILED', 'Admin session is not active.');
      }
      if (tokenId && !this.isElevatedTokenId(tokenId, current.projectId, 'canon:approve')) {
        throw new IntegrationStoreError(
          'AUTHORIZATION_DENIED',
          'Integration token is not authorized to approve canon for this project.',
        );
      }
      const currentVersion = this.getCurrentCanonVersion(
        current.projectId,
        current.entityType,
        current.entityId,
      );
      const actualBaseVersion = currentVersion?.version ?? 0;
      if (actualBaseVersion !== current.baseVersion) {
        throw new OptimisticConcurrencyError(current.baseVersion, actualBaseVersion);
      }
      if (currentVersion && currentVersion.applicationStatus !== 'Applied') {
        throw new IntegrationStoreError(
          'VERSION_CONFLICT',
          'A prior approved canon version has not finished applying.',
        );
      }
      const newVersion = current.baseVersion + 1;
      const result = this.database
        .prepare(
          `UPDATE canon_change_proposals
           SET status = 'Approved', approved_by_token_id = ?,
               approved_by_admin_session_id = ?, approved_at = ?,
               application_status = 'PendingApply', application_error = NULL,
               applied_at = NULL, new_version = ?
           WHERE id = ? AND status = 'Pending'`,
        )
        .run(tokenId, adminSessionId, approvedAt, newVersion, current.id);
      if (Number(result.changes) !== 1) {
        throw new IntegrationStoreError('VERSION_CONFLICT', 'Canon-change proposal changed.');
      }
      this.database
        .prepare(
          `INSERT INTO canon_record_versions
             (project_id, entity_type, entity_id, version, proposal_id, payload_json,
              application_status, approved_by_token_id, approved_by_admin_session_id,
              approved_at, applied_at, application_error)
           VALUES (?, ?, ?, ?, ?, ?, 'PendingApply', ?, ?, ?, NULL, NULL)`,
        )
        .run(
          current.projectId,
          current.entityType,
          current.entityId,
          newVersion,
          current.id,
          JSON.stringify(current.proposedValue),
          tokenId,
          adminSessionId,
          approvedAt,
        );
      this.database
        .prepare(
          `INSERT INTO canon_current_versions
             (project_id, entity_type, entity_id, version, proposal_id, application_status, updated_at)
           VALUES (?, ?, ?, ?, ?, 'PendingApply', ?)
           ON CONFLICT(project_id, entity_type, entity_id) DO UPDATE SET
             version = excluded.version,
             proposal_id = excluded.proposal_id,
             application_status = excluded.application_status,
             updated_at = excluded.updated_at`,
        )
        .run(
          current.projectId,
          current.entityType,
          current.entityId,
          newVersion,
          current.id,
          approvedAt,
        );
      this.appendAuditEventInternal({
        operation: 'canon-change.approve',
        result: 'success',
        tokenId,
        adminSessionId,
        projectId: current.projectId,
        targetType: current.entityType,
        targetId: current.entityId,
        metadata: { proposalId: current.id, explicitConfirmation: true },
        occurredAt: approvedAt,
      });
      return {
        ...current,
        status: 'Approved',
        approvedByTokenId: tokenId,
        approvedByAdminSessionId: adminSessionId,
        approvedAt,
        applicationStatus: 'PendingApply',
        applicationError: null,
        appliedAt: null,
        newVersion,
      };
    });
  }

  markCanonChangeApplied(proposalId: string): CanonChangeProposalRecord {
    const appliedAt = this.nowIso();
    return this.transaction(() => {
      const row = this.database
        .prepare('SELECT * FROM canon_change_proposals WHERE id = ?')
        .get(proposalId) as SqlRow | undefined;
      if (!row) throw new IntegrationStoreError('NOT_FOUND', 'Canon-change proposal not found.');
      const proposal = this.canonProposalFromRow(row);
      if (proposal.status !== 'Approved' || proposal.newVersion === null) {
        throw new IntegrationStoreError('VERSION_CONFLICT', 'Canon-change proposal is not approved.');
      }
      if (proposal.applicationStatus === 'Applied') return proposal;
      this.database
        .prepare(
          `UPDATE canon_change_proposals
           SET application_status = 'Applied', application_error = NULL, applied_at = ?
           WHERE id = ? AND status = 'Approved'`,
        )
        .run(appliedAt, proposal.id);
      this.database
        .prepare(
          `UPDATE canon_record_versions
           SET application_status = 'Applied', application_error = NULL, applied_at = ?
           WHERE proposal_id = ?`,
        )
        .run(appliedAt, proposal.id);
      this.database
        .prepare(
          `UPDATE canon_current_versions
           SET application_status = 'Applied', updated_at = ?
           WHERE proposal_id = ?`,
        )
        .run(appliedAt, proposal.id);
      this.appendAuditEventInternal({
        operation: 'canon-change.apply',
        result: 'success',
        tokenId: proposal.approvedByTokenId,
        adminSessionId: proposal.approvedByAdminSessionId,
        projectId: proposal.projectId,
        targetType: proposal.entityType,
        targetId: proposal.entityId,
        metadata: { proposalId: proposal.id, version: proposal.newVersion },
        occurredAt: appliedAt,
      });
      return {
        ...proposal,
        applicationStatus: 'Applied',
        applicationError: null,
        appliedAt,
      };
    });
  }

  markCanonChangeApplyFailed(proposalId: string, errorMessage: string): CanonChangeProposalRecord {
    const failedAt = this.nowIso();
    const redactedError = redactSecrets(errorMessage);
    const applicationError = requiredString(
      typeof redactedError === 'string' ? redactedError : 'Canon application failed.',
      'applicationError',
      2_000,
    );
    return this.transaction(() => {
      const row = this.database
        .prepare('SELECT * FROM canon_change_proposals WHERE id = ?')
        .get(proposalId) as SqlRow | undefined;
      if (!row) throw new IntegrationStoreError('NOT_FOUND', 'Canon-change proposal not found.');
      const proposal = this.canonProposalFromRow(row);
      if (proposal.status !== 'Approved' || proposal.newVersion === null) {
        throw new IntegrationStoreError('VERSION_CONFLICT', 'Canon-change proposal is not approved.');
      }
      this.database
        .prepare(
          `UPDATE canon_change_proposals
           SET application_status = 'ApplyFailed', application_error = ?, applied_at = NULL
           WHERE id = ? AND status = 'Approved'`,
        )
        .run(applicationError, proposal.id);
      this.database
        .prepare(
          `UPDATE canon_record_versions
           SET application_status = 'ApplyFailed', application_error = ?, applied_at = NULL
           WHERE proposal_id = ?`,
        )
        .run(applicationError, proposal.id);
      this.database
        .prepare(
          `UPDATE canon_current_versions
           SET application_status = 'ApplyFailed', updated_at = ?
           WHERE proposal_id = ?`,
        )
        .run(failedAt, proposal.id);
      this.appendAuditEventInternal({
        operation: 'canon-change.apply',
        result: 'failure',
        tokenId: proposal.approvedByTokenId,
        adminSessionId: proposal.approvedByAdminSessionId,
        projectId: proposal.projectId,
        targetType: proposal.entityType,
        targetId: proposal.entityId,
        metadata: { proposalId: proposal.id, version: proposal.newVersion, error: applicationError },
        occurredAt: failedAt,
      });
      return {
        ...proposal,
        applicationStatus: 'ApplyFailed',
        applicationError,
        appliedAt: null,
      };
    });
  }

  private isElevatedTokenId(tokenId: string, projectId: string, scope: string): boolean {
    const row = this.database
      .prepare(
        `SELECT permission, scopes_json, expires_at, revoked_at
         FROM integration_tokens WHERE id = ?`,
      )
      .get(tokenId) as SqlRow | undefined;
    if (!row || stringColumn(row, 'permission') !== 'read-write') return false;
    if (nullableStringColumn(row, 'revoked_at')) return false;
    if (isExpired(nullableStringColumn(row, 'expires_at'), this.now())) return false;
    const scopes = parseJson<string[]>(row.scopes_json, []);
    if (!scopes.includes(scope)) return false;
    return this.projectGrantsForToken(tokenId).includes(projectId);
  }

  private canonProposalFromRow(row: SqlRow): CanonChangeProposalRecord {
    const status = stringColumn(row, 'status');
    if (status !== 'Pending' && status !== 'Approved' && status !== 'Rejected') {
      throw new Error('Invalid stored canon proposal status.');
    }
    const applicationStatus = stringColumn(row, 'application_status');
    if (!['NotApproved', 'PendingApply', 'Applied', 'ApplyFailed'].includes(applicationStatus)) {
      throw new Error('Invalid stored canon application status.');
    }
    return {
      id: stringColumn(row, 'id'),
      projectId: stringColumn(row, 'project_id'),
      entityType: stringColumn(row, 'entity_type'),
      entityId: stringColumn(row, 'entity_id'),
      baseVersion: numberColumn(row, 'base_version'),
      baseDigest: stringColumn(row, 'base_digest'),
      oldValue: parseJson<JsonValue>(row.old_value_json, {}),
      proposedValue: parseJson<JsonValue>(row.proposed_value_json, {}),
      reason: stringColumn(row, 'reason'),
      affectedAssetIds: parseJson<string[]>(row.affected_assets_json, []),
      continuityImpact: parseJson<JsonValue>(row.continuity_impact_json, {}),
      status,
      createdByTokenId: nullableStringColumn(row, 'created_by_token_id'),
      createdAt: stringColumn(row, 'created_at'),
      approvedByTokenId: nullableStringColumn(row, 'approved_by_token_id'),
      approvedByAdminSessionId: nullableStringColumn(row, 'approved_by_admin_session_id'),
      approvedAt: nullableStringColumn(row, 'approved_at'),
      applicationStatus: applicationStatus as CanonChangeProposalRecord['applicationStatus'],
      applicationError: nullableStringColumn(row, 'application_error'),
      appliedAt: nullableStringColumn(row, 'applied_at'),
      newVersion: nullableNumberColumn(row, 'new_version'),
    };
  }

  // -------------------------------------------------------------------------
  // Two-step generation jobs
  // -------------------------------------------------------------------------

  createGenerationJob(input: CreateGenerationJobInput): CreatedGenerationJob {
    const now = this.now();
    const createdAt = now.toISOString();
    if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0 || input.durationSeconds > 600) {
      throw new IntegrationStoreError(
        'VALIDATION_ERROR',
        'durationSeconds must be greater than zero and no more than 600.',
      );
    }
    if (!Number.isInteger(input.variationCount) || input.variationCount < 1 || input.variationCount > 16) {
      throw new IntegrationStoreError(
        'VALIDATION_ERROR',
        'variationCount must be an integer between 1 and 16.',
      );
    }
    if (
      !Number.isSafeInteger(input.estimatedCostMicros) ||
      input.estimatedCostMicros < 0
    ) {
      throw new IntegrationStoreError(
        'VALIDATION_ERROR',
        'estimatedCostMicros must be a non-negative safe integer.',
      );
    }
    for (const [name, value] of [
      ['budgetLimitMicros', input.budgetLimitMicros],
      ['budgetSpentSnapshotMicros', input.budgetSpentSnapshotMicros],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new IntegrationStoreError(
          'VALIDATION_ERROR',
          `${name} must be a non-negative safe integer.`,
        );
      }
    }
    const jobId = randomUUID();
    const credential = generateCredential('confirmation', jobId);
    const confirmationExpiresAt = normalizeFutureTimestamp(
      input.confirmationExpiresAt ?? new Date(now.getTime() + 15 * 60 * 1_000).toISOString(),
      'confirmationExpiresAt',
      now,
    );
    const parameters = ensureJsonValue(input.parameters ?? {}, 'parameters');
    const record: GenerationJobRecord = {
      id: jobId,
      projectId: requiredString(input.projectId, 'projectId', 200),
      shotId: requiredString(input.shotId, 'shotId', 200),
      provider: requiredString(input.provider, 'provider', 100),
      model: requiredString(input.model, 'model', 200),
      resolution: requiredString(input.resolution, 'resolution', 50),
      durationSeconds: input.durationSeconds,
      variationCount: input.variationCount,
      estimatedCostMicros: input.estimatedCostMicros,
      budgetLimitMicros: input.budgetLimitMicros,
      budgetSpentSnapshotMicros: input.budgetSpentSnapshotMicros,
      parameters,
      status: 'AwaitingConfirmation',
      requestedByTokenId: input.requestedByTokenId ?? null,
      createdAt,
      updatedAt: createdAt,
      confirmedAt: null,
      outputAssets: [],
      error: null,
    };
    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO generation_jobs
             (id, project_id, shot_id, provider, model, resolution, duration_seconds,
              variation_count, estimated_cost_micros, parameters_json, status,
              budget_limit_micros, budget_spent_snapshot_micros,
              requested_by_token_id, created_at, updated_at, confirmed_at,
              output_assets_json, error_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', 'null')`,
        )
        .run(
          record.id,
          record.projectId,
          record.shotId,
          record.provider,
          record.model,
          record.resolution,
          record.durationSeconds,
          record.variationCount,
          record.estimatedCostMicros,
          JSON.stringify(record.parameters),
          record.status,
          record.budgetLimitMicros,
          record.budgetSpentSnapshotMicros,
          record.requestedByTokenId,
          record.createdAt,
          record.updatedAt,
        );
      this.database
        .prepare(
          `INSERT INTO generation_confirmations
             (job_id, token_prefix, token_hash, created_at, expires_at, used_at)
           VALUES (?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          record.id,
          credential.prefix,
          hashCredential(credential.bearer, this.pepper),
          createdAt,
          confirmationExpiresAt,
        );
      this.appendAuditEventInternal({
        operation: 'generation-job.create',
        result: 'success',
        tokenId: record.requestedByTokenId,
        projectId: record.projectId,
        targetType: 'generation-job',
        targetId: record.id,
        metadata: {
          shotId: record.shotId,
          provider: record.provider,
          model: record.model,
          estimatedCostMicros: record.estimatedCostMicros,
          confirmationExpiresAt,
        },
        occurredAt: createdAt,
      });
    });
    return {
      job: record,
      confirmationToken: credential.bearer,
      confirmationExpiresAt,
    };
  }

  getGenerationJob(jobId: string): GenerationJobRecord | null {
    const row = this.database
      .prepare('SELECT * FROM generation_jobs WHERE id = ?')
      .get(jobId) as SqlRow | undefined;
    return row ? this.generationJobFromRow(row) : null;
  }

  confirmGenerationJob(
    jobId: string,
    confirmationToken: string,
    confirmedByTokenId: string,
    liveBudget?: { limitMicros: number; spentMicros: number },
  ): GenerationJobRecord {
    const parsedJobId = parseCredentialId(confirmationToken, 'confirmation');
    if (!parsedJobId || parsedJobId !== jobId) {
      throw new IntegrationStoreError('CONFIRMATION_INVALID', 'Invalid generation confirmation.');
    }
    const confirmedAt = this.nowIso();
    return this.transaction(() => {
      const row = this.database
        .prepare(
          `SELECT job.*, confirmation.token_hash, confirmation.expires_at AS confirmation_expires_at,
                  confirmation.used_at AS confirmation_used_at
           FROM generation_jobs AS job
           INNER JOIN generation_confirmations AS confirmation ON confirmation.job_id = job.id
           WHERE job.id = ?`,
        )
        .get(jobId) as SqlRow | undefined;
      if (!row) throw new IntegrationStoreError('NOT_FOUND', 'Generation job not found.');
      if (!credentialHashMatches(confirmationToken, stringColumn(row, 'token_hash'), this.pepper)) {
        throw new IntegrationStoreError('CONFIRMATION_INVALID', 'Invalid generation confirmation.');
      }
      if (nullableStringColumn(row, 'confirmation_used_at')) {
        throw new IntegrationStoreError('CONFIRMATION_USED', 'Generation confirmation was already used.');
      }
      if (isExpired(stringColumn(row, 'confirmation_expires_at'), this.now())) {
        throw new IntegrationStoreError('CONFIRMATION_EXPIRED', 'Generation confirmation expired.');
      }
      const current = this.generationJobFromRow(row);
      if (current.status !== 'AwaitingConfirmation') {
        throw new IntegrationStoreError(
          'VERSION_CONFLICT',
          `Generation job is already ${current.status}.`,
        );
      }
      if (
        !this.isElevatedTokenId(
          confirmedByTokenId,
          current.projectId,
          'generations:write',
        )
      ) {
        throw new IntegrationStoreError(
          'AUTHORIZATION_DENIED',
          'Confirming token is not authorized to start this generation.',
        );
      }
      if (
        current.requestedByTokenId &&
        !this.isElevatedTokenId(
          current.requestedByTokenId,
          current.projectId,
          'generations:write',
        )
      ) {
        throw new IntegrationStoreError(
          'AUTHORIZATION_DENIED',
          'Requesting token is no longer authorized to start this generation.',
        );
      }
      const budgetLimitMicros = liveBudget?.limitMicros ?? current.budgetLimitMicros;
      const budgetSpentMicros = liveBudget?.spentMicros ?? current.budgetSpentSnapshotMicros;
      if (
        !Number.isSafeInteger(budgetLimitMicros) ||
        !Number.isSafeInteger(budgetSpentMicros) ||
        budgetLimitMicros < 0 ||
        budgetSpentMicros < 0
      ) {
        throw new IntegrationStoreError('VALIDATION_ERROR', 'Invalid live project budget snapshot.');
      }
      const reservationRow = this.database
        .prepare(
          `SELECT COALESCE(SUM(estimated_cost_micros), 0) AS reserved_micros
           FROM generation_jobs
           WHERE project_id = ? AND confirmed_at IS NOT NULL
             AND status IN ('Queued', 'Running', 'Completed')`,
        )
        .get(current.projectId) as SqlRow;
      const reservedMicros = numberColumn(reservationRow, 'reserved_micros');
      if (budgetSpentMicros + reservedMicros + current.estimatedCostMicros > budgetLimitMicros) {
        throw new IntegrationStoreError(
          'BUDGET_EXCEEDED',
          'Confirming this generation would exceed the project budget after active reservations.',
        );
      }
      const confirmationUpdate = this.database
        .prepare(
          `UPDATE generation_confirmations SET used_at = ?
           WHERE job_id = ? AND used_at IS NULL`,
        )
        .run(confirmedAt, jobId);
      if (Number(confirmationUpdate.changes) !== 1) {
        throw new IntegrationStoreError('CONFIRMATION_USED', 'Generation confirmation was already used.');
      }
      const jobUpdate = this.database
        .prepare(
          `UPDATE generation_jobs
           SET status = 'Queued', confirmed_at = ?, updated_at = ?
           WHERE id = ? AND status = 'AwaitingConfirmation'`,
        )
        .run(confirmedAt, confirmedAt, jobId);
      if (Number(jobUpdate.changes) !== 1) {
        throw new IntegrationStoreError('VERSION_CONFLICT', 'Generation job changed.');
      }
      this.appendAuditEventInternal({
        operation: 'generation-job.confirm',
        result: 'success',
        tokenId: confirmedByTokenId,
        projectId: current.projectId,
        targetType: 'generation-job',
        targetId: current.id,
        metadata: {
          estimatedCostMicros: current.estimatedCostMicros,
          explicitConfirmation: true,
          requestedByTokenId: current.requestedByTokenId,
        },
        occurredAt: confirmedAt,
      });
      return {
        ...current,
        status: 'Queued',
        confirmedAt,
        updatedAt: confirmedAt,
      };
    });
  }

  private generationJobFromRow(row: SqlRow): GenerationJobRecord {
    const status = stringColumn(row, 'status') as GenerationJobRecord['status'];
    if (
      !['AwaitingConfirmation', 'Queued', 'Running', 'Completed', 'Failed', 'Cancelled'].includes(
        status,
      )
    ) {
      throw new Error('Invalid stored generation job status.');
    }
    return {
      id: stringColumn(row, 'id'),
      projectId: stringColumn(row, 'project_id'),
      shotId: stringColumn(row, 'shot_id'),
      provider: stringColumn(row, 'provider'),
      model: stringColumn(row, 'model'),
      resolution: stringColumn(row, 'resolution'),
      durationSeconds: numberColumn(row, 'duration_seconds'),
      variationCount: numberColumn(row, 'variation_count'),
      estimatedCostMicros: numberColumn(row, 'estimated_cost_micros'),
      budgetLimitMicros: numberColumn(row, 'budget_limit_micros'),
      budgetSpentSnapshotMicros: numberColumn(row, 'budget_spent_snapshot_micros'),
      parameters: parseJson<JsonValue>(row.parameters_json, {}),
      status,
      requestedByTokenId: nullableStringColumn(row, 'requested_by_token_id'),
      createdAt: stringColumn(row, 'created_at'),
      updatedAt: stringColumn(row, 'updated_at'),
      confirmedAt: nullableStringColumn(row, 'confirmed_at'),
      outputAssets: parseJson<JsonValue>(row.output_assets_json, []),
      error: parseJson<JsonValue>(row.error_json, null),
    };
  }
}
