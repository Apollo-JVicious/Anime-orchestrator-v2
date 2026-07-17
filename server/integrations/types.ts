/**
 * Durable integration-layer contracts.
 *
 * These records deliberately contain no plaintext bearer, confirmation, or
 * session secrets. Creation result types are the only exception, and callers
 * must display those one-time values without persisting or logging them.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const INTEGRATION_SCOPES = [
  'projects:read',
  'canon:read',
  'characters:read',
  'scenes:read',
  'continuity:read',
  'prompts:read',
  'generations:read',
  'drafts:write',
  'generations:write',
  'canon:propose',
  'canon:approve',
] as const;

export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];
export type IntegrationPermission = 'read-only' | 'read-write';

export const WRITE_INTEGRATION_SCOPES = new Set<IntegrationScope>([
  'drafts:write',
  'generations:write',
  'canon:propose',
  'canon:approve',
]);

export interface IntegrationStoreOptions {
  databasePath?: string;
  pepper?: string;
  now?: () => Date;
}

export interface IntegrationSettingRecord<T extends JsonValue = JsonValue> {
  key: string;
  value: T;
  updatedAt: string;
  updatedByAdminSessionId: string | null;
}

export interface CreateIntegrationTokenInput {
  name: string;
  permission: IntegrationPermission;
  scopes: IntegrationScope[];
  projectIds: string[];
  expiresAt?: string | null;
  createdByAdminSessionId?: string | null;
}

export interface IntegrationTokenRecord {
  id: string;
  prefix: string;
  name: string;
  permission: IntegrationPermission;
  scopes: IntegrationScope[];
  projectIds: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdByAdminSessionId: string | null;
  lastUsedAt: string | null;
}

export interface CreatedIntegrationToken extends IntegrationTokenRecord {
  /** Available exactly once. Never persist or log this value. */
  bearerToken: string;
}

export interface IntegrationPrincipal {
  kind: 'integration-token';
  tokenId: string;
  tokenPrefix: string;
  tokenName: string;
  permission: IntegrationPermission;
  scopes: IntegrationScope[];
  projectIds: string[];
  expiresAt: string | null;
}

export interface AuthorizationRequirement {
  projectId?: string;
  scope?: IntegrationScope;
  write?: boolean;
}

export type AuditResult = 'success' | 'denied' | 'failure';

export interface AppendAuditEventInput {
  operation: string;
  result: AuditResult;
  tokenId?: string | null;
  adminSessionId?: string | null;
  projectId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  requestId?: string | null;
  metadata?: unknown;
  occurredAt?: string;
}

export interface McpAuditEventRecord {
  id: string;
  occurredAt: string;
  operation: string;
  result: AuditResult;
  tokenId: string | null;
  adminSessionId: string | null;
  projectId: string | null;
  targetType: string | null;
  targetId: string | null;
  requestId: string | null;
  metadata: JsonValue;
}

export interface ListAuditEventsFilter {
  projectId?: string;
  tokenId?: string;
  operation?: string;
  before?: string;
  limit?: number;
}

export interface CreateDraftChangeInput {
  projectId: string;
  entityType: string;
  entityId: string;
  payload: JsonValue;
  sourceNote: string;
  reason?: string | null;
  createdByTokenId?: string | null;
}

export interface UpdateDraftChangeInput {
  projectId: string;
  entityType: string;
  entityId: string;
  expectedVersion: number;
  patch: Record<string, unknown>;
  reason: string;
  sourceNote?: string;
  createdByTokenId?: string | null;
}

export interface DraftChangeRecord {
  id: string;
  projectId: string;
  entityType: string;
  entityId: string;
  version: number;
  payload: JsonValue;
  sourceNote: string;
  reason: string | null;
  createdByTokenId: string | null;
  createdAt: string;
}

export type CanonProposalStatus = 'Pending' | 'Approved' | 'Rejected';

export interface CreateCanonChangeProposalInput {
  projectId: string;
  entityType: string;
  entityId: string;
  baseVersion: number;
  baseDigest: string;
  oldValue: JsonValue;
  proposedValue: JsonValue;
  reason: string;
  affectedAssetIds?: string[];
  continuityImpact?: JsonValue;
  createdByTokenId?: string | null;
}

export interface CanonChangeProposalRecord {
  id: string;
  projectId: string;
  entityType: string;
  entityId: string;
  baseVersion: number;
  baseDigest: string;
  oldValue: JsonValue;
  proposedValue: JsonValue;
  reason: string;
  affectedAssetIds: string[];
  continuityImpact: JsonValue;
  status: CanonProposalStatus;
  createdByTokenId: string | null;
  createdAt: string;
  approvedByTokenId: string | null;
  approvedByAdminSessionId: string | null;
  approvedAt: string | null;
  applicationStatus: 'NotApproved' | 'PendingApply' | 'Applied' | 'ApplyFailed';
  applicationError: string | null;
  appliedAt: string | null;
  newVersion: number | null;
}

export interface CanonVersionState {
  projectId: string;
  entityType: string;
  entityId: string;
  version: number;
  proposalId: string;
  applicationStatus: 'PendingApply' | 'Applied' | 'ApplyFailed';
  updatedAt: string;
}

export interface ApproveCanonChangeProposalInput {
  proposalId: string;
  approvedByTokenId?: string | null;
  approvedByAdminSessionId?: string | null;
  /** Must be true; prevents accidental promotion from a generic update path. */
  confirmed: boolean;
}

export type GenerationJobStatus =
  | 'AwaitingConfirmation'
  | 'Queued'
  | 'Running'
  | 'Completed'
  | 'Failed'
  | 'Cancelled';

export interface CreateGenerationJobInput {
  projectId: string;
  shotId: string;
  provider: string;
  model: string;
  resolution: string;
  durationSeconds: number;
  variationCount: number;
  estimatedCostMicros: number;
  budgetLimitMicros: number;
  budgetSpentSnapshotMicros: number;
  parameters?: JsonValue;
  requestedByTokenId?: string | null;
  confirmationExpiresAt?: string;
}

export interface GenerationJobRecord {
  id: string;
  projectId: string;
  shotId: string;
  provider: string;
  model: string;
  resolution: string;
  durationSeconds: number;
  variationCount: number;
  estimatedCostMicros: number;
  budgetLimitMicros: number;
  budgetSpentSnapshotMicros: number;
  parameters: JsonValue;
  status: GenerationJobStatus;
  requestedByTokenId: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  outputAssets: JsonValue;
  error: JsonValue;
}

export interface CreatedGenerationJob {
  job: GenerationJobRecord;
  /** Available exactly once. Never persist or log this value. */
  confirmationToken: string;
  confirmationExpiresAt: string;
}

export interface CreateAdminSessionInput {
  subject: string;
  expiresAt?: string;
}

export interface AdminSessionRecord {
  id: string;
  prefix: string;
  subject: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export interface CreatedAdminSession extends AdminSessionRecord {
  /** Available exactly once. Never persist or log this value. */
  sessionToken: string;
}

export interface WebhookDeliveryRecord {
  id: string;
  projectId: string | null;
  eventType: string;
  endpointUrl: string;
  payload: JsonValue;
  status: 'Pending' | 'Delivered' | 'Failed';
  attemptCount: number;
  nextAttemptAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
  lastError: string | null;
}

export type IntegrationStoreErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'AUTHORIZATION_DENIED'
  | 'BUDGET_EXCEEDED'
  | 'CONFIGURATION_ERROR'
  | 'CONFIRMATION_REQUIRED'
  | 'CONFIRMATION_INVALID'
  | 'CONFIRMATION_EXPIRED'
  | 'CONFIRMATION_USED'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'VALIDATION_ERROR';

export class IntegrationStoreError extends Error {
  constructor(
    public readonly code: IntegrationStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationStoreError';
  }
}

export class OptimisticConcurrencyError extends IntegrationStoreError {
  constructor(
    public readonly expectedVersion: number,
    public readonly actualVersion: number | null,
  ) {
    super(
      'VERSION_CONFLICT',
      `Draft version conflict: expected ${expectedVersion}, current version is ${actualVersion ?? 'missing'}.`,
    );
    this.name = 'OptimisticConcurrencyError';
  }
}
