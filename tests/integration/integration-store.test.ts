import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { IntegrationStore } from '../../server/integrations/store';
import {
  IntegrationStoreError,
  OptimisticConcurrencyError,
} from '../../server/integrations/types';
import { AnimeMcpDomainService } from '../../server/mcp/domain';

const TEST_PEPPER = 'vitest-only-pepper-with-at-least-16-bytes';

const stores: IntegrationStore[] = [];
const temporaryRoots: string[] = [];

function createStore() {
  const root = mkdtempSync(join(tmpdir(), 'anime-orchestrator-integration-'));
  const databasePath = join(root, 'integrations.sqlite');
  const store = new IntegrationStore({ databasePath, pepper: TEST_PEPPER });
  temporaryRoots.push(root);
  stores.push(store);
  return { store, databasePath };
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of temporaryRoots.splice(0)) {
    const absoluteRoot = resolve(root);
    if (!absoluteRoot.startsWith(resolve(tmpdir()))) {
      throw new Error(`Refusing to remove unexpected test directory: ${absoluteRoot}`);
    }
    rmSync(absoluteRoot, { recursive: true, force: true });
  }
});

describe('IntegrationStore security boundaries', () => {
  it('returns bearer plaintext once while persisting only its cryptographic hash', () => {
    const { store, databasePath } = createStore();
    const created = store.createIntegrationToken({
      name: 'Codex read access',
      permission: 'read-only',
      scopes: ['projects:read'],
      projectIds: ['crimson-sword'],
    });

    expect(created.bearerToken).toMatch(/^ao_[0-9a-f-]+\.[A-Za-z0-9_-]+$/);
    expect(store.authenticateIntegrationToken(created.bearerToken)).toMatchObject({
      tokenId: created.id,
      projectIds: ['crimson-sword'],
      permission: 'read-only',
    });

    const listed = store.listIntegrationTokens();
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty('bearerToken');
    expect(JSON.stringify(listed)).not.toContain(created.bearerToken);

    store.close();
    const database = new DatabaseSync(databasePath, { readOnly: true });
    const row = database
      .prepare('SELECT token_hash FROM integration_tokens WHERE id = ?')
      .get(created.id) as { token_hash: string };
    database.close();

    expect(row.token_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(row.token_hash).not.toBe(created.bearerToken);
    expect(row.token_hash).not.toContain(created.bearerToken);
  });

  it('denies draft writes to a read-only principal', () => {
    const { store } = createStore();
    const token = store.createIntegrationToken({
      name: 'Review only',
      permission: 'read-only',
      scopes: ['projects:read', 'scenes:read'],
      projectIds: ['crimson-sword'],
    });
    const principal = store.authenticateIntegrationToken(token.bearerToken);
    expect(principal).not.toBeNull();

    const domain = new AnimeMcpDomainService(store);
    let thrown: unknown;
    try {
      domain.createSceneDraft(principal!, {
        projectId: 'crimson-sword',
        episodeId: 'episode-1',
        title: 'Unauthorized draft',
        sceneData: {},
        sourceNote: 'This must be denied.',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(IntegrationStoreError);
    expect(thrown).toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect(store.listLatestDraftChanges('crimson-sword', 'scene')).toEqual([]);
  });

  it('does not let one project grant read another project', () => {
    const { store } = createStore();
    const token = store.createIntegrationToken({
      name: 'Crimson Sword only',
      permission: 'read-only',
      scopes: ['projects:read'],
      projectIds: ['crimson-sword'],
    });
    const principal = store.authenticateIntegrationToken(token.bearerToken);
    expect(principal).not.toBeNull();

    const domain = new AnimeMcpDomainService(store);
    let thrown: unknown;
    try {
      domain.getProject(principal!, 'another-project');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(IntegrationStoreError);
    expect(thrown).toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  });

  it('keeps approved canon unchanged when an external agent creates a scene proposal', () => {
    const { store } = createStore();
    const token = store.createIntegrationToken({
      name: 'Draft scene author',
      permission: 'read-write',
      scopes: ['scenes:read', 'drafts:write'],
      projectIds: ['crimson-sword'],
    });
    const principal = store.authenticateIntegrationToken(token.bearerToken);
    expect(principal).not.toBeNull();

    const domain = new AnimeMcpDomainService(store);
    const before = domain.getScene(principal!, 'scene-1');
    expect(before).toMatchObject({ scene: { id: 'scene-1', status: 'Approved' } });

    const draft = domain.createSceneDraft(principal!, {
      projectId: 'crimson-sword',
      episodeId: 'episode-1',
      title: 'Proposed replacement title',
      sceneData: { sourceSceneId: 'scene-1' },
      sourceNote: 'External proposal must remain separate from approved canon.',
    });

    expect(draft.entityId).not.toBe('scene-1');
    expect(draft.payload).toMatchObject({
      id: draft.entityId,
      projectId: 'crimson-sword',
      status: 'Draft',
    });
    expect(domain.getScene(principal!, 'scene-1')).toEqual(before);
  });

  it('rejects a stale draft update without changing the current version', () => {
    const { store } = createStore();
    const first = store.createDraftChange({
      projectId: 'crimson-sword',
      entityType: 'scene',
      entityId: 'scene-draft-test',
      payload: { title: 'Version one', status: 'Draft' },
      sourceNote: 'Vitest draft',
    });
    const second = store.updateDraftChange({
      projectId: 'crimson-sword',
      entityType: 'scene',
      entityId: 'scene-draft-test',
      expectedVersion: first.version,
      patch: { title: 'Version two' },
      reason: 'Authorized revision',
    });

    expect(second.version).toBe(2);
    expect(second.payload).toMatchObject({ title: 'Version two', status: 'Draft' });

    let thrown: unknown;
    try {
      store.updateDraftChange({
        projectId: 'crimson-sword',
        entityType: 'scene',
        entityId: 'scene-draft-test',
        expectedVersion: first.version,
        patch: { title: 'Stale overwrite' },
        reason: 'Stale revision',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OptimisticConcurrencyError);
    expect(thrown).toMatchObject({
      code: 'VERSION_CONFLICT',
      expectedVersion: 1,
      actualVersion: 2,
    });
    expect(
      store.getLatestDraftChange('crimson-sword', 'scene', 'scene-draft-test'),
    ).toMatchObject({
      version: 2,
      payload: { title: 'Version two', status: 'Draft' },
    });
  });

  it('consumes a generation confirmation token exactly once', () => {
    const { store } = createStore();
    const token = store.createIntegrationToken({
      name: 'Generation operator',
      permission: 'read-write',
      scopes: ['generations:write'],
      projectIds: ['crimson-sword'],
    });
    const created = store.createGenerationJob({
      projectId: 'crimson-sword',
      shotId: 'shot-test',
      provider: 'test-provider',
      model: 'test-model',
      resolution: '1920x1080',
      durationSeconds: 5,
      variationCount: 1,
      estimatedCostMicros: 250_000,
      budgetLimitMicros: 10_000_000,
      budgetSpentSnapshotMicros: 0,
      requestedByTokenId: token.id,
    });

    const queued = store.confirmGenerationJob(
      created.job.id,
      created.confirmationToken,
      token.id,
    );
    expect(queued.status).toBe('Queued');
    expect(queued.confirmedAt).not.toBeNull();

    let thrown: unknown;
    try {
      store.confirmGenerationJob(created.job.id, created.confirmationToken, token.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(IntegrationStoreError);
    expect(thrown).toMatchObject({ code: 'CONFIRMATION_USED' });
    expect(store.getGenerationJob(created.job.id)?.status).toBe('Queued');
  });

  it('records approved canon as an immutable pending version before marking it applied', () => {
    const { store } = createStore();
    const token = store.createIntegrationToken({
      name: 'Canon approver',
      permission: 'read-write',
      scopes: ['canon:approve'],
      projectIds: ['crimson-sword'],
    });
    const proposal = store.createCanonChangeProposal({
      projectId: 'crimson-sword',
      entityType: 'character',
      entityId: 'aria',
      baseVersion: 0,
      baseDigest: 'a'.repeat(64),
      oldValue: { name: 'Aria' },
      proposedValue: { name: 'Aria', canonStatus: 'Canon Locked' },
      reason: 'Approve a reviewed identity correction.',
      continuityImpact: { summary: 'No downstream conflict.' },
      createdByTokenId: token.id,
    });

    const approved = store.approveCanonChangeProposal({
      proposalId: proposal.id,
      approvedByTokenId: token.id,
      confirmed: true,
    });
    expect(approved.applicationStatus).toBe('PendingApply');
    expect(approved.newVersion).toBe(1);
    expect(store.getCurrentCanonVersion('crimson-sword', 'character', 'aria')).toMatchObject({
      version: 1,
      applicationStatus: 'PendingApply',
    });

    const applied = store.markCanonChangeApplied(proposal.id);
    expect(applied.applicationStatus).toBe('Applied');
    expect(store.getCurrentCanonVersion('crimson-sword', 'character', 'aria')).toMatchObject({
      version: 1,
      applicationStatus: 'Applied',
    });
  });

  it('atomically rejects generation confirmations that exceed active budget reservations', () => {
    const { store } = createStore();
    const token = store.createIntegrationToken({
      name: 'Budgeted generator',
      permission: 'read-write',
      scopes: ['generations:write'],
      projectIds: ['crimson-sword'],
    });
    const createJob = (shotId: string) => store.createGenerationJob({
      projectId: 'crimson-sword',
      shotId,
      provider: 'test-provider',
      model: 'test-model',
      resolution: '1920x1080',
      durationSeconds: 5,
      variationCount: 1,
      estimatedCostMicros: 300_000,
      budgetLimitMicros: 500_000,
      budgetSpentSnapshotMicros: 0,
      requestedByTokenId: token.id,
    });
    const first = createJob('shot-budget-1');
    const second = createJob('shot-budget-2');

    expect(store.confirmGenerationJob(first.job.id, first.confirmationToken, token.id).status).toBe('Queued');
    let thrown: unknown;
    try {
      store.confirmGenerationJob(second.job.id, second.confirmationToken, token.id);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: 'BUDGET_EXCEEDED' });
    expect(store.getGenerationJob(second.job.id)?.status).toBe('AwaitingConfirmation');
  });
});
