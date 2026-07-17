import { createHash, randomUUID } from 'node:crypto';
import { db } from '../db';
import { IntegrationStore } from '../integrations/store';
import {
  CanonChangeProposalRecord,
  DraftChangeRecord,
  GenerationJobRecord,
  IntegrationPrincipal,
  IntegrationScope,
  JsonValue
} from '../integrations/types';
import { authorizeIntegrationPrincipal, redactSecrets } from '../integrations/auth';
import { Asset, Character, Location, Project, Prop, Scene, StoryBible } from '../../src/types';

export class McpDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = 'McpDomainError';
  }
}

type JsonObject = { [key: string]: JsonValue };
type ContinuitySceneRecord = Pick<
  Scene,
  'id' | 'projectId' | 'locationId' | 'charactersPresentIds' | 'costumesUsedIds' | 'propsIds'
>;

function publicGenerationJob(job: GenerationJobRecord) {
  const { requestedByTokenId: _requestedByTokenId, error, ...publicJob } = clone(job);
  const progressPercent =
    job.status === 'Completed'
      ? 100
      : ['AwaitingConfirmation', 'Queued'].includes(job.status)
        ? 0
        : null;
  return {
    ...publicJob,
    estimatedCost: {
      amountMicros: job.estimatedCostMicros,
      currency: 'USD'
    },
    progress: {
      state: job.status,
      percent: progressPercent
    },
    error: redactSecrets(error)
  };
}

const FORBIDDEN_PATCH_KEYS = new Set([
  'id',
  'projectId',
  'version',
  'status',
  'canonStatus',
  'isLocked',
  '__proto__',
  'prototype',
  'constructor'
]);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toJsonValue(value: unknown): JsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new McpDomainError('INVALID_JSON', 'The supplied value is not JSON serializable.');
  }
  return JSON.parse(serialized) as JsonValue;
}

function canonicalJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    const output: JsonObject = {};
    for (const key of Object.keys(value).sort()) {
      output[key] = canonicalJson((value as JsonObject)[key]);
    }
    return output;
  }
  return value;
}

function digestJson(value: JsonValue): string {
  return createHash('sha256').update(JSON.stringify(canonicalJson(value))).digest('hex');
}

function asObject(value: JsonValue): JsonObject {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new McpDomainError('INVALID_RECORD', 'Expected a JSON object record.');
  }
  return value as JsonObject;
}

function sceneDraftForContinuity(draft: DraftChangeRecord): ContinuitySceneRecord {
  const payload = asObject(draft.payload);
  const optionalString = (field: string) => {
    const value = payload[field];
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') {
      throw new McpDomainError('INVALID_RECORD', `Scene draft field ${field} must be a string.`);
    }
    return value;
  };
  const optionalStringArray = (field: string): string[] => {
    const value = payload[field];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
      throw new McpDomainError('INVALID_RECORD', `Scene draft field ${field} must be an array of strings.`);
    }
    return value.filter((item): item is string => typeof item === 'string');
  };

  return {
    id: draft.entityId,
    projectId: draft.projectId,
    locationId: optionalString('locationId'),
    charactersPresentIds: optionalStringArray('charactersPresentIds'),
    costumesUsedIds: optionalStringArray('costumesUsedIds'),
    propsIds: optionalStringArray('propsIds')
  };
}

function assertSafePatch(patch: Record<string, unknown>) {
  for (const key of Object.keys(patch)) {
    if (FORBIDDEN_PATCH_KEYS.has(key)) {
      throw new McpDomainError('IMMUTABLE_FIELD', `External patches cannot change ${key}.`);
    }
  }
}

function mergeJson(base: JsonValue, patch: JsonValue): JsonValue {
  if (
    !base ||
    !patch ||
    Array.isArray(base) ||
    Array.isArray(patch) ||
    typeof base !== 'object' ||
    typeof patch !== 'object'
  ) {
    return clone(patch);
  }

  const output: JsonObject = { ...(base as JsonObject) };
  for (const [key, value] of Object.entries(patch as JsonObject)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) {
      throw new McpDomainError('INVALID_PATCH', `Unsafe patch key ${key}.`);
    }
    output[key] = key in output ? mergeJson(output[key], value) : clone(value);
  }
  return output;
}

function promoteCanonPayload(entityType: string, value: JsonValue): JsonValue {
  const promoted = clone(asObject(value));
  if (['character', 'location', 'prop'].includes(entityType)) {
    promoted.isLocked = true;
    promoted.canonStatus = 'Canon Locked';
  } else if (entityType === 'scene') {
    promoted.status = 'Canon Locked';
  } else if (entityType === 'asset') {
    const metadata = promoted.metadata && typeof promoted.metadata === 'object' && !Array.isArray(promoted.metadata)
      ? { ...(promoted.metadata as JsonObject) }
      : {};
    metadata.approvalStatus = 'Canon Locked';
    promoted.metadata = metadata;
  }
  return promoted;
}

function statusOf(value: { status?: string; canonStatus?: string; isLocked?: boolean }) {
  return value.status || value.canonStatus || (value.isLocked ? 'Canon Locked' : 'Unversioned');
}

function isLockedCanon(value: { status?: string; canonStatus?: string; isLocked?: boolean }) {
  return value.status === 'Canon Locked' || value.canonStatus === 'Canon Locked' || value.isLocked === true;
}

function requireRecord<T>(value: T | undefined, type: string, id: string): T {
  if (!value) throw new McpDomainError('NOT_FOUND', `${type} ${id} was not found.`, 404);
  return value;
}

function normalizePromptLine(label: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return `${label}: ${String(value).trim()}`;
}

export class AnimeMcpDomainService {
  constructor(private readonly integrations: IntegrationStore) {}

  private authorize(
    principal: IntegrationPrincipal,
    scope: IntegrationScope,
    projectId?: string,
    write = false
  ) {
    authorizeIntegrationPrincipal(principal, { projectId, scope, write });
  }

  private state() {
    return db.getDatabaseState();
  }

  private findDraftForGrantedProjects(
    principal: IntegrationPrincipal,
    entityType: string,
    entityId: string
  ): DraftChangeRecord | null {
    const matches = principal.projectIds
      .map(projectId => this.integrations.getLatestDraftChange(projectId, entityType, entityId))
      .filter((value): value is DraftChangeRecord => Boolean(value));
    if (matches.length > 1) {
      throw new McpDomainError('AMBIGUOUS_ID', `${entityType} ID ${entityId} exists in more than one granted project.`);
    }
    return matches[0] || null;
  }

  listProjects(principal: IntegrationPrincipal) {
    this.authorize(principal, 'projects:read');
    return this.state().projects
      .filter(project => principal.projectIds.includes(project.id))
      .map(project => ({
        id: project.id,
        title: project.title,
        currentStage: project.currentStage,
        warningCount: project.recentWarningsCount,
        createdAt: project.createdAt
      }));
  }

  getProject(principal: IntegrationPrincipal, projectId: string) {
    this.authorize(principal, 'projects:read', projectId);
    const state = this.state();
    const project = requireRecord(state.projects.find(item => item.id === projectId), 'Project', projectId);
    const characters = state.characters.filter(item => item.projectId === projectId);
    const scenes = state.scenes.filter(item => item.projectId === projectId);
    const locations = state.locations.filter(item => item.projectId === projectId);
    const props = state.props.filter(item => item.projectId === projectId);
    const warnings = [
      'Legacy canon records do not yet carry immutable version or approval-provenance metadata.',
      ...(project.recentWarningsCount > 0
        ? [`The project reports ${project.recentWarningsCount} existing continuity warning(s).`]
        : [])
    ];

    return {
      project: clone(project),
      productionStage: project.currentStage,
      warnings,
      canonicalSummary: {
        characters: {
          total: characters.length,
          locked: characters.filter(isLockedCanon).length,
          draft: characters.filter(item => item.canonStatus === 'Draft').length
        },
        scenes: {
          total: scenes.length,
          locked: scenes.filter(isLockedCanon).length,
          draft: scenes.filter(item => item.status === 'Draft').length
        },
        locations: { total: locations.length, locked: locations.filter(isLockedCanon).length },
        props: { total: props.length, locked: props.filter(isLockedCanon).length }
      }
    };
  }

  getStoryBible(principal: IntegrationPrincipal, projectId: string) {
    this.authorize(principal, 'canon:read', projectId);
    const state = this.state();
    requireRecord(state.projects.find(item => item.id === projectId), 'Project', projectId);
    const bible = state.bibles.find(item => item.projectId === projectId);

    return {
      projectId,
      approvedAndLocked: {},
      draft: bible ? { unversionedLegacyBible: clone(bible) } : {},
      disputed: {},
      warnings: bible
        ? ['The legacy StoryBible record has no field-level status, version, lock, or approval identity; it is not represented as locked canon.']
        : ['No StoryBible record exists for this project.']
    };
  }

  getTimeline(principal: IntegrationPrincipal, projectId: string) {
    this.authorize(principal, 'canon:read', projectId);
    requireRecord(this.state().projects.find(item => item.id === projectId), 'Project', projectId);
    const timeline = this.state().timelines.find(item => item.projectId === projectId);
    return timeline
      ? clone(timeline)
      : {
          projectId,
          tracks: { video: [], dialogue: [], music: [], soundEffects: [] },
          warning: 'No persisted timeline record exists; this empty view was returned without mutating canon.'
        };
  }

  getContinuityReport(principal: IntegrationPrincipal, projectId: string) {
    this.authorize(principal, 'continuity:read', projectId);
    requireRecord(this.state().projects.find(item => item.id === projectId), 'Project', projectId);
    return {
      projectId,
      storedLegacyReviews: clone(this.state().continuityResults.filter(item => item.projectId === projectId)),
      warning: 'Stored legacy reviews may lack immutable evidence/version provenance; use run_continuity_review for a current read-only record check.'
    };
  }

  listCharacters(principal: IntegrationPrincipal, projectId: string) {
    this.authorize(principal, 'characters:read', projectId);
    const state = this.state();
    requireRecord(state.projects.find(item => item.id === projectId), 'Project', projectId);
    const canonical = state.characters
      .filter(item => item.projectId === projectId)
      .map(character => ({
        id: character.id,
        name: character.name,
        currentVersion: null,
        approvalState: character.canonStatus,
        isLocked: character.isLocked,
        formsOrCostumes: state.costumes
          .filter(costume => costume.characterId === character.id)
          .map(costume => ({ id: costume.id, name: costume.name, type: costume.type, isLocked: costume.isLocked }))
      }));
    const drafts = this.integrations.listLatestDraftChanges(projectId, 'character').map(draft => ({
      id: draft.entityId,
      name: String(asObject(draft.payload).name || 'Untitled Character Draft'),
      currentVersion: draft.version,
      approvalState: 'Draft',
      isLocked: false,
      formsOrCostumes: []
    }));
    return [...canonical, ...drafts];
  }

  getCharacter(principal: IntegrationPrincipal, characterId: string, timelineStateId?: string) {
    this.authorize(principal, 'characters:read');
    if (timelineStateId) {
      throw new McpDomainError(
        'TIMELINE_STATE_NOT_FOUND',
        `Timeline state ${timelineStateId} is not present in the current data model; no identity changes were inferred.`,
        404
      );
    }

    const state = this.state();
    const character = state.characters.find(
      item => item.id === characterId && principal.projectIds.includes(item.projectId)
    );
    if (character) {
      this.authorize(principal, 'characters:read', character.projectId);
      const visualAnchors = state.assets.filter(
        asset => asset.projectId === character.projectId && asset.metadata.associatedId === character.id
      );
      return {
        id: character.id,
        projectId: character.projectId,
        name: character.name,
        approvalState: character.canonStatus,
        isLocked: character.isLocked,
        physicalIdentity: clone(character.appearance),
        costume: clone(character.wardrobe),
        personality: clone(character.performance),
        relationships: character.performance.relationships,
        visualAnchors: clone(visualAnchors),
        formsOrCostumes: clone(state.costumes.filter(item => item.characterId === character.id)),
        continuityConstraints: {
          proportionRules: character.appearance.proportionRules,
          silhouette: character.appearance.silhouette,
          damageStates: character.wardrobe.damageStates
        },
        doNotChange: character.isLocked
          ? ['physicalIdentity', 'costume', 'proportions', 'silhouette', 'age', 'species']
          : [],
        version: null,
        provenanceWarning: 'Legacy character records are unversioned.'
      };
    }

    const draft = this.findDraftForGrantedProjects(principal, 'character', characterId);
    if (!draft) throw new McpDomainError('NOT_FOUND', `Character ${characterId} was not found.`, 404);
    this.authorize(principal, 'characters:read', draft.projectId);
    return {
      ...clone(asObject(draft.payload)),
      approvalState: 'Draft',
      version: draft.version,
      sourceNote: draft.sourceNote
    };
  }

  listScenes(principal: IntegrationPrincipal, projectId: string, episodeId?: string, status?: string) {
    this.authorize(principal, 'scenes:read', projectId);
    const state = this.state();
    requireRecord(state.projects.find(item => item.id === projectId), 'Project', projectId);
    const canonical = state.scenes
      .filter(scene => scene.projectId === projectId)
      .filter(scene => !episodeId || scene.episodeNumber === episodeId)
      .filter(scene => !status || scene.status === status)
      .map(scene => ({
        id: scene.id,
        episodeId: scene.episodeNumber,
        sceneNumber: scene.sceneNumber,
        title: scene.title,
        purpose: scene.purpose,
        status: scene.status,
        continuityState: {
          previous: scene.continuityPrevious,
          setupLater: scene.requiredSetupLater
        },
        version: null
      }));
    const drafts = this.integrations.listLatestDraftChanges(projectId, 'scene')
      .filter(draft => {
        const payload = asObject(draft.payload);
        return (!episodeId || payload.episodeNumber === episodeId) && (!status || status === 'Draft');
      })
      .map(draft => {
        const payload = asObject(draft.payload);
        return {
          id: draft.entityId,
          episodeId: String(payload.episodeNumber || ''),
          sceneNumber: String(payload.sceneNumber || ''),
          title: String(payload.title || 'Untitled Scene Draft'),
          purpose: String(payload.purpose || ''),
          status: 'Draft',
          continuityState: {
            previous: String(payload.continuityPrevious || ''),
            setupLater: String(payload.requiredSetupLater || '')
          },
          version: draft.version
        };
      });
    return [...canonical, ...drafts];
  }

  getScene(principal: IntegrationPrincipal, sceneId: string) {
    this.authorize(principal, 'scenes:read');
    const state = this.state();
    const scene = state.scenes.find(
      item => item.id === sceneId && principal.projectIds.includes(item.projectId)
    );
    if (scene) {
      this.authorize(principal, 'scenes:read', scene.projectId);
      const projectCharacterIds = new Set(
        state.characters.filter(item => item.projectId === scene.projectId).map(item => item.id)
      );
      return {
        scene: clone(scene),
        version: null,
        screenplay: { dialogue: scene.dialogue, action: scene.action },
        beats: clone(scene.approvedBeats),
        characters: clone(state.characters.filter(
          item => item.projectId === scene.projectId && scene.charactersPresentIds.includes(item.id)
        )),
        costumes: clone(state.costumes.filter(
          item => projectCharacterIds.has(item.characterId) && scene.costumesUsedIds.includes(item.id)
        )),
        props: clone(state.props.filter(
          item => item.projectId === scene.projectId && scene.propsIds.includes(item.id)
        )),
        location: clone(state.locations.find(
          item => item.id === scene.locationId && item.projectId === scene.projectId
        ) || null),
        timelinePosition: {
          episodeNumber: scene.episodeNumber,
          sceneNumber: scene.sceneNumber,
          previous: scene.continuityPrevious,
          requiredSetupLater: scene.requiredSetupLater
        },
        continuityRequirements: {
          emotionalStart: scene.emotionalStart,
          emotionalEnd: scene.emotionalEnd,
          timeOfDay: scene.timeOfDay,
          weather: scene.weather
        },
        provenanceWarning: 'Legacy scene records are unversioned.'
      };
    }

    const draft = this.findDraftForGrantedProjects(principal, 'scene', sceneId);
    if (!draft) throw new McpDomainError('NOT_FOUND', `Scene ${sceneId} was not found.`, 404);
    this.authorize(principal, 'scenes:read', draft.projectId);
    return {
      scene: clone(asObject(draft.payload)),
      version: draft.version,
      status: 'Draft',
      sourceNote: draft.sourceNote,
      reason: draft.reason
    };
  }

  createSceneDraft(
    principal: IntegrationPrincipal,
    input: { projectId: string; episodeId: string; title: string; sceneData: Record<string, unknown>; sourceNote: string }
  ) {
    this.authorize(principal, 'drafts:write', input.projectId, true);
    requireRecord(this.state().projects.find(item => item.id === input.projectId), 'Project', input.projectId);
    const entityId = `scene-draft-${randomUUID()}`;
    const payload = toJsonValue({
      ...input.sceneData,
      id: entityId,
      projectId: input.projectId,
      episodeNumber: input.episodeId,
      title: input.title,
      status: 'Draft'
    });
    return this.integrations.createDraftChange({
      projectId: input.projectId,
      entityType: 'scene',
      entityId,
      payload,
      sourceNote: input.sourceNote,
      reason: 'Created through MCP as a draft.',
      createdByTokenId: principal.tokenId
    });
  }

  updateSceneDraft(
    principal: IntegrationPrincipal,
    input: { sceneId: string; expectedVersion: number; patch: Record<string, unknown>; reason: string }
  ) {
    this.authorize(principal, 'drafts:write', undefined, true);
    assertSafePatch(input.patch);
    const current = this.findDraftForGrantedProjects(principal, 'scene', input.sceneId);
    if (!current) throw new McpDomainError('NOT_FOUND', `Scene draft ${input.sceneId} was not found.`, 404);
    this.authorize(principal, 'drafts:write', current.projectId, true);
    return this.integrations.updateDraftChange({
      projectId: current.projectId,
      entityType: 'scene',
      entityId: input.sceneId,
      expectedVersion: input.expectedVersion,
      patch: input.patch,
      reason: input.reason,
      createdByTokenId: principal.tokenId
    });
  }

  createCharacterDraft(
    principal: IntegrationPrincipal,
    input: { projectId: string; name: string; characterData: Record<string, unknown>; sourceNote: string }
  ) {
    this.authorize(principal, 'drafts:write', input.projectId, true);
    requireRecord(this.state().projects.find(item => item.id === input.projectId), 'Project', input.projectId);
    const entityId = `character-draft-${randomUUID()}`;
    const payload = toJsonValue({
      ...input.characterData,
      id: entityId,
      projectId: input.projectId,
      name: input.name,
      isLocked: false,
      canonStatus: 'Draft'
    });
    return this.integrations.createDraftChange({
      projectId: input.projectId,
      entityType: 'character',
      entityId,
      payload,
      sourceNote: input.sourceNote,
      reason: 'Created through MCP as a draft.',
      createdByTokenId: principal.tokenId
    });
  }

  runContinuityReview(
    principal: IntegrationPrincipal,
    input: { projectId: string; sceneId?: string; storyboardId?: string; assetId?: string; generationJobId?: string }
  ) {
    this.authorize(principal, 'continuity:read', input.projectId);
    const state = this.state();
    const findings: Array<Record<string, unknown>> = [];
    const evidence = (type: string, id: string, field: string, value: unknown) => ({ type, id, field, value });
    const add = (
      severity: 'critical' | 'warning' | 'info',
      code: string,
      message: string,
      relatedEvidence: unknown[],
      relatedCanonIds: string[],
      suggestedCorrection: string
    ) => findings.push({ severity, code, message, evidence: relatedEvidence, relatedCanonIds, suggestedCorrection });

    let scene: ContinuitySceneRecord | undefined;
    let reviewedTarget: { type: string; id: string };

    if (input.sceneId) {
      scene = state.scenes.find(item => item.id === input.sceneId && item.projectId === input.projectId);
      if (!scene) {
        const draft = this.integrations.getLatestDraftChange(input.projectId, 'scene', input.sceneId);
        if (!draft) throw new McpDomainError('NOT_FOUND', `Scene ${input.sceneId} was not found.`, 404);
        scene = sceneDraftForContinuity(draft);
      }
      reviewedTarget = { type: 'scene', id: input.sceneId };
    } else if (input.storyboardId) {
      const panel = state.storyboardPanels.find(item => item.id === input.storyboardId);
      if (!panel) throw new McpDomainError('NOT_FOUND', `Storyboard ${input.storyboardId} was not found.`, 404);
      scene = state.scenes.find(item => item.id === panel.sceneId && item.projectId === input.projectId);
      if (!scene) throw new McpDomainError('NOT_FOUND', `Storyboard ${input.storyboardId} was not found.`, 404);
      reviewedTarget = { type: 'storyboard', id: input.storyboardId };
      for (const assetId of panel.referenceAssetsIds) {
        if (!state.assets.some(asset => asset.id === assetId && asset.projectId === input.projectId)) {
          add(
            'critical',
            'MISSING_STORYBOARD_REFERENCE',
            `Storyboard panel references missing or unauthorized asset ${assetId}.`,
            [evidence('storyboard', panel.id, 'referenceAssetsIds', assetId)],
            [panel.id],
            'Attach an approved project asset or remove the unresolved reference before generation.'
          );
        }
      }
    } else if (input.assetId) {
      const asset = state.assets.find(item => item.id === input.assetId && item.projectId === input.projectId);
      if (!asset) throw new McpDomainError('NOT_FOUND', `Asset ${input.assetId} was not found.`, 404);
      reviewedTarget = { type: 'asset', id: input.assetId };
      if (asset.metadata.approvalStatus === 'Draft') {
        add(
          'warning',
          'DRAFT_ASSET',
          'The reviewed asset is a draft and must not be treated as locked visual canon.',
          [evidence('asset', asset.id, 'approvalStatus', asset.metadata.approvalStatus)],
          [asset.id],
          'Keep downstream work in Draft status until the asset is explicitly approved.'
        );
      }
      if (asset.metadata.associatedId) {
        scene = state.scenes.find(
          item => item.id === asset.metadata.associatedId && item.projectId === input.projectId
        );
      }
    } else if (input.generationJobId) {
      const storedJob = this.integrations.getGenerationJob(input.generationJobId);
      const job = requireRecord(
        storedJob?.projectId === input.projectId ? storedJob : undefined,
        'Generation job',
        input.generationJobId
      );
      reviewedTarget = { type: 'generation_job', id: input.generationJobId };
      const shot = state.shotBuilders.find(item => item.id === job.shotId && item.projectId === input.projectId);
      if (!shot) {
        add(
          'critical',
          'MISSING_SHOT',
          `Generation job references missing shot ${job.shotId}.`,
          [evidence('generation_job', job.id, 'shotId', job.shotId)],
          [],
          'Restore the exact approved shot record before confirming or reviewing this job.'
        );
      }
    } else {
      throw new McpDomainError('INVALID_TARGET', 'Exactly one review target is required.');
    }

    if (scene) {
      const projectCharacterIds = new Set(
        state.characters.filter(item => item.projectId === input.projectId).map(item => item.id)
      );
      if (scene.locationId && !state.locations.some(item => item.id === scene!.locationId && item.projectId === input.projectId)) {
        add(
          'critical',
          'MISSING_LOCATION',
          `Scene references missing project location ${scene.locationId}.`,
          [evidence('scene', scene.id, 'locationId', scene.locationId)],
          [scene.id],
          'Select an existing approved location before storyboarding or generation.'
        );
      }
      for (const characterId of scene.charactersPresentIds) {
        const character = state.characters.find(item => item.id === characterId && item.projectId === input.projectId);
        if (!character) {
          add(
            'critical',
            'MISSING_CHARACTER',
            `Scene references missing project character ${characterId}.`,
            [evidence('scene', scene.id, 'charactersPresentIds', characterId)],
            [scene.id],
            'Restore the character reference or remove it from the scene before generation.'
          );
        } else if (!isLockedCanon(character)) {
          add(
            'warning',
            'UNLOCKED_CHARACTER_REFERENCE',
            `${character.name} is not locked visual canon.`,
            [evidence('character', character.id, 'canonStatus', character.canonStatus)],
            [scene.id, character.id],
            'Keep the scene and its generated assets in Draft status until the character is approved and locked.'
          );
        }
      }
      for (const costumeId of scene.costumesUsedIds) {
        if (!state.costumes.some(item => item.id === costumeId && projectCharacterIds.has(item.characterId))) {
          add(
            'critical',
            'MISSING_COSTUME_STATE',
            `Scene references missing costume or form ${costumeId}.`,
            [evidence('scene', scene.id, 'costumesUsedIds', costumeId)],
            [scene.id],
            'Select a defined character costume/form that is valid for this timeline position.'
          );
        }
      }
      for (const propId of scene.propsIds) {
        if (!state.props.some(item => item.id === propId && item.projectId === input.projectId)) {
          add(
            'critical',
            'MISSING_PROP',
            `Scene references missing project prop ${propId}.`,
            [evidence('scene', scene.id, 'propsIds', propId)],
            [scene.id],
            'Attach the correct approved prop record or remove the unresolved prop reference.'
          );
        }
      }
    }

    return {
      projectId: input.projectId,
      target: reviewedTarget!,
      reviewedAt: new Date().toISOString(),
      analyticalMode: 'deterministic-record-review',
      findings,
      summary: {
        critical: findings.filter(item => item.severity === 'critical').length,
        warning: findings.filter(item => item.severity === 'warning').length,
        info: findings.filter(item => item.severity === 'info').length
      }
    };
  }

  compileShotPrompt(principal: IntegrationPrincipal, shotId: string) {
    this.authorize(principal, 'prompts:read');
    const state = this.state();
    const shot = requireRecord(
      state.shotBuilders.find(item => item.id === shotId && principal.projectIds.includes(item.projectId)),
      'Shot',
      shotId
    );
    this.authorize(principal, 'prompts:read', shot.projectId);
    const project = requireRecord(state.projects.find(item => item.id === shot.projectId), 'Project', shot.projectId);
    const bible = state.bibles.find(item => item.projectId === shot.projectId);
    const bibleVersion = this.integrations.getCurrentCanonVersion(
      shot.projectId,
      'story_bible',
      shot.projectId
    );
    const characters = shot.referenceCharactersIds.map(id =>
      requireRecord(state.characters.find(item => item.id === id && item.projectId === shot.projectId), 'Character', id)
    );
    const location = shot.referenceLocationId
      ? requireRecord(
          state.locations.find(item => item.id === shot.referenceLocationId && item.projectId === shot.projectId),
          'Location',
          shot.referenceLocationId
        )
      : null;
    const props = shot.referencePropsIds.map(id =>
      requireRecord(state.props.find(item => item.id === id && item.projectId === shot.projectId), 'Prop', id)
    );
    const blockedReasons: string[] = [];
    if (!bible) blockedReasons.push('No StoryBible record exists for the project.');
    else if (!bibleVersion || bibleVersion.applicationStatus !== 'Applied') {
      blockedReasons.push('The StoryBible has no applied, explicitly approved canon version.');
    }
    for (const character of characters) {
      if (!isLockedCanon(character)) blockedReasons.push(`Character ${character.id} is not locked canon.`);
    }
    if (location && !isLockedCanon(location)) blockedReasons.push(`Location ${location.id} is not locked canon.`);
    for (const prop of props) {
      if (!isLockedCanon(prop)) blockedReasons.push(`Prop ${prop.id} is not locked canon.`);
    }

    const characterLines = characters.map(character =>
      [
        `${character.name} (${character.id})`,
        normalizePromptLine('physical identity', [
          character.age,
          character.species,
          character.appearance.height,
          character.appearance.bodyType,
          character.appearance.faceShape,
          character.appearance.eyeShapeColor,
          character.appearance.hairStyleColor,
          character.appearance.silhouette,
          character.appearance.proportionRules
        ].filter(Boolean).join('; ')),
        normalizePromptLine('costume', character.wardrobe.defaultCostume),
        normalizePromptLine('costume palette', character.wardrobe.palette),
        normalizePromptLine('materials', character.wardrobe.materials)
      ].filter(Boolean).join(' — ')
    );
    const lines = [
      `PROJECT: ${project.title}`,
      normalizePromptLine('VISUAL STYLE', bible?.renderStyle),
      normalizePromptLine('VISUAL LANGUAGE', bible?.visualLanguage),
      normalizePromptLine('COLOR SCRIPT', bible?.colorScript),
      normalizePromptLine('CINEMATOGRAPHY RULES', bible?.cinematographyRules),
      `SHOT: ${shot.name}`,
      normalizePromptLine('STARTING FRAME', shot.startingFrame),
      normalizePromptLine('ENDING FRAME', shot.endingFrame),
      ...characterLines.map(line => `CHARACTER LOCK: ${line}`),
      location
        ? `LOCATION LOCK: ${location.name} (${location.id}) — ${location.description}; ${location.visualPrompt}; ${location.timeOfDay}; ${location.weather}`
        : null,
      ...props.map(prop => `PROP LOCK: ${prop.name} (${prop.id}) — ${prop.description}; ${prop.visualPrompt}; ${prop.materials}`),
      normalizePromptLine('CAMERA POSITION', shot.cameraPosition),
      normalizePromptLine('CAMERA MOVEMENT', shot.cameraMovement),
      normalizePromptLine('SUBJECT MOVEMENT', shot.subjectMovement),
      normalizePromptLine('ENVIRONMENTAL MOVEMENT', shot.environmentalMovement),
      normalizePromptLine('LIGHTING', shot.lighting),
      normalizePromptLine('COMPOSITION', shot.composition),
      normalizePromptLine('DIALOGUE', shot.dialogue),
      normalizePromptLine('SOUND', shot.sound),
      `DURATION: ${shot.durationSeconds}s`,
      `ASPECT RATIO: ${shot.aspectRatio}`,
      `FRAME RATE: ${shot.frameRate}fps`,
      normalizePromptLine('CONTINUITY CONSTRAINTS', shot.continuityConstraints),
      normalizePromptLine('NEGATIVE CONSTRAINTS', shot.negativeConstraints)
    ].filter((line): line is string => Boolean(line));
    const candidatePrompt = lines.join('\n');
    const sourceRecords = [
      { type: 'project', id: project.id, status: 'Legacy unversioned' },
      ...(bible ? [{
        type: 'story_bible',
        id: bible.projectId,
        status: bibleVersion?.applicationStatus === 'Applied'
          ? `Canon version ${bibleVersion.version}`
          : 'Legacy unversioned'
      }] : []),
      ...characters.map(item => ({ type: 'character', id: item.id, status: statusOf(item) })),
      ...(location ? [{ type: 'location', id: location.id, status: statusOf(location) }] : []),
      ...props.map(item => ({ type: 'prop', id: item.id, status: statusOf(item) })),
      { type: 'shot', id: shot.id, status: 'Legacy unversioned' }
    ];

    return {
      ready: blockedReasons.length === 0,
      finalPrompt: blockedReasons.length === 0 ? candidatePrompt : null,
      candidatePrompt,
      blockedReasons,
      sourceRecords
    };
  }

  createGenerationJob(
    principal: IntegrationPrincipal,
    input: {
      shotId: string;
      provider: string;
      model: string;
      resolution: string;
      duration: number;
      variationCount: number;
    }
  ) {
    this.authorize(principal, 'generations:write', undefined, true);
    const state = this.state();
    const shot = requireRecord(state.shotBuilders.find(item => item.id === input.shotId), 'Shot', input.shotId);
    this.authorize(principal, 'generations:write', shot.projectId, true);
    const compiled = this.compileShotPrompt(principal, shot.id);
    if (!compiled.ready || !compiled.finalPrompt) {
      throw new McpDomainError(
        'PROMPT_NOT_READY',
        `Generation is blocked until prompt sources are locked: ${compiled.blockedReasons.join(' ')}`,
        409
      );
    }

    const pricing = this.readPricing();
    const priceKey = `${input.provider}:${input.model}:${input.resolution}`;
    const rateMicros = pricing[priceKey];
    if (rateMicros === undefined) {
      throw new McpDomainError(
        'PRICING_UNAVAILABLE',
        `No trusted price is configured for ${priceKey}; no generation job was created.`,
        409
      );
    }
    const configuredRecentLimit = Number.parseInt(process.env.MCP_GENERATION_RATE_LIMIT || '10', 10);
    const recentLimit = Number.isFinite(configuredRecentLimit) && configuredRecentLimit > 0
      ? configuredRecentLimit
      : 10;
    const cutoff = Date.now() - 60_000;
    const recentCount = this.integrations
      .listAuditEvents({ tokenId: principal.tokenId, operation: 'generation-job.create', limit: Math.max(recentLimit + 1, 20) })
      .filter(event => Date.parse(event.occurredAt) >= cutoff).length;
    if (recentCount >= recentLimit) {
      throw new McpDomainError('RATE_LIMITED', 'Generation request rate limit exceeded.', 429);
    }

    const estimatedCostMicros = Math.ceil(rateMicros * input.duration * input.variationCount);
    const project = requireRecord(state.projects.find(item => item.id === shot.projectId), 'Project', shot.projectId);
    const budgetLimitMicros = Math.floor(Math.max(project.budgetLimit, 0) * 1_000_000);
    const budgetSpentSnapshotMicros = Math.floor(Math.max(project.budgetSpent, 0) * 1_000_000);
    const remainingMicros = Math.max(budgetLimitMicros - budgetSpentSnapshotMicros, 0);
    if (estimatedCostMicros > remainingMicros) {
      throw new McpDomainError('BUDGET_EXCEEDED', 'Estimated cost exceeds the project budget remaining.', 409);
    }

    const confirmationExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const created = this.integrations.createGenerationJob({
      projectId: shot.projectId,
      shotId: shot.id,
      provider: input.provider,
      model: input.model,
      resolution: input.resolution,
      durationSeconds: input.duration,
      variationCount: input.variationCount,
      estimatedCostMicros,
      budgetLimitMicros,
      budgetSpentSnapshotMicros,
      parameters: toJsonValue({
        prompt: compiled.finalPrompt,
        sourceRecords: compiled.sourceRecords,
        aspectRatio: shot.aspectRatio,
        frameRate: shot.frameRate
      }),
      requestedByTokenId: principal.tokenId,
      confirmationExpiresAt
    });

    return {
      job: publicGenerationJob(created.job),
      estimatedCost: { amountMicros: estimatedCostMicros, currency: 'USD' },
      confirmationToken: created.confirmationToken,
      confirmationExpiresAt: created.confirmationExpiresAt,
      status: 'AwaitingConfirmation',
      note: 'No external generation has started. The confirmation token is one-use and is returned only in this response.'
    };
  }

  confirmGenerationJob(principal: IntegrationPrincipal, jobId: string, confirmationToken: string) {
    this.authorize(principal, 'generations:write', undefined, true);
    const storedJob = this.integrations.getGenerationJob(jobId);
    const job = requireRecord(
      storedJob && principal.projectIds.includes(storedJob.projectId) ? storedJob : undefined,
      'Generation job',
      jobId
    );
    this.authorize(principal, 'generations:write', job.projectId, true);
    const project = requireRecord(this.state().projects.find(item => item.id === job.projectId), 'Project', job.projectId);
    const confirmed = this.integrations.confirmGenerationJob(
      jobId,
      confirmationToken,
      principal.tokenId,
      {
        limitMicros: Math.floor(Math.max(project.budgetLimit, 0) * 1_000_000),
        spentMicros: Math.floor(Math.max(project.budgetSpent, 0) * 1_000_000)
      }
    );
    return {
      ...publicGenerationJob(confirmed),
      dispatchState: 'Queued',
      note: 'The job is durably queued. A separately deployed provider worker must claim it before paid generation executes; no provider credential is exposed through MCP.'
    };
  }

  getGenerationJob(principal: IntegrationPrincipal, jobId: string) {
    this.authorize(principal, 'generations:read');
    const storedJob = this.integrations.getGenerationJob(jobId);
    const job = requireRecord(
      storedJob && principal.projectIds.includes(storedJob.projectId) ? storedJob : undefined,
      'Generation job',
      jobId
    );
    this.authorize(principal, 'generations:read', job.projectId);
    return publicGenerationJob(job);
  }

  proposeCanonChange(
    principal: IntegrationPrincipal,
    input: {
      projectId: string;
      targetType: 'project' | 'story_bible' | 'character' | 'scene' | 'location' | 'prop' | 'asset';
      targetId: string;
      proposedPatch: Record<string, unknown>;
      reason: string;
      affectedAssetIds: string[];
      continuityImpact: string;
    }
  ) {
    this.authorize(principal, 'canon:propose', input.projectId, true);
    assertSafePatch(input.proposedPatch);
    const target = this.getCanonTarget(input.targetType, input.targetId, input.projectId);
    if (target.projectId !== input.projectId) {
      throw new McpDomainError('PROJECT_MISMATCH', 'Canon target does not belong to the requested project.', 403);
    }
    const currentVersion = this.integrations.getCurrentCanonVersion(
      input.projectId,
      input.targetType,
      input.targetId
    );
    if (currentVersion && currentVersion.applicationStatus !== 'Applied') {
      throw new McpDomainError(
        'CANON_APPLICATION_PENDING',
        'A prior approved canon version must finish applying before another proposal can be created.',
        409
      );
    }
    const oldValue = toJsonValue(target.value);
    const proposedValue = promoteCanonPayload(
      input.targetType,
      mergeJson(oldValue, toJsonValue(input.proposedPatch))
    );
    return this.integrations.createCanonChangeProposal({
      projectId: input.projectId,
      entityType: input.targetType,
      entityId: input.targetId,
      baseVersion: currentVersion?.version ?? 0,
      baseDigest: digestJson(oldValue),
      oldValue,
      proposedValue,
      reason: input.reason,
      affectedAssetIds: input.affectedAssetIds,
      continuityImpact: toJsonValue({ summary: input.continuityImpact }),
      createdByTokenId: principal.tokenId
    });
  }

  approveCanonChange(principal: IntegrationPrincipal, proposalId: string, confirmed: boolean) {
    this.authorize(principal, 'canon:approve', undefined, true);
    const storedProposal = this.integrations.getCanonChangeProposal(proposalId);
    const proposal = requireRecord(
      storedProposal && principal.projectIds.includes(storedProposal.projectId) ? storedProposal : undefined,
      'Canon proposal',
      proposalId
    );
    this.authorize(principal, 'canon:approve', proposal.projectId, true);
    if (!confirmed) throw new McpDomainError('CONFIRMATION_REQUIRED', 'Explicit canon approval confirmation is required.');
    let approved = proposal;
    if (proposal.status === 'Pending') {
      const liveValue = toJsonValue(
        this.getCanonTarget(proposal.entityType, proposal.entityId, proposal.projectId).value
      );
      if (digestJson(liveValue) !== proposal.baseDigest) {
        throw new McpDomainError(
          'VERSION_CONFLICT',
          'Canon changed after this proposal was created. Create a new proposal from the current record.',
          409
        );
      }
      approved = this.integrations.approveCanonChangeProposal({
        proposalId,
        approvedByTokenId: principal.tokenId,
        confirmed: true
      });
    } else if (proposal.status === 'Approved') {
      if (proposal.applicationStatus === 'Applied') return proposal;
      const currentVersion = this.integrations.getCurrentCanonVersion(
        proposal.projectId,
        proposal.entityType,
        proposal.entityId
      );
      if (!currentVersion || currentVersion.proposalId !== proposal.id) {
        throw new McpDomainError(
          'VERSION_CONFLICT',
          'This approved proposal is no longer the current canon application.',
          409
        );
      }
    } else {
      throw new McpDomainError('PROPOSAL_NOT_PENDING', `Canon proposal is already ${proposal.status}.`, 409);
    }
    try {
      this.applyCanonProposal(approved);
      return this.integrations.markCanonChangeApplied(approved.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown canon application error.';
      try {
        this.integrations.markCanonChangeApplyFailed(approved.id, message);
      } catch {
        // The original application failure remains the primary error; audit persistence is best effort here.
      }
      throw new McpDomainError(
        'CANON_APPLICATION_FAILED',
        'The proposal is approved but its version could not be applied. Review the audit log, correct storage, then repeat the explicit approval to retry.',
        500
      );
    }
  }

  private readPricing(): Record<string, number> {
    const raw = process.env.GENERATION_PRICING_JSON || '';
    if (!raw) return {};
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new McpDomainError('PRICING_CONFIGURATION_ERROR', 'GENERATION_PRICING_JSON is not valid JSON.', 500);
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new McpDomainError('PRICING_CONFIGURATION_ERROR', 'GENERATION_PRICING_JSON must be an object.', 500);
    }
    const output: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new McpDomainError('PRICING_CONFIGURATION_ERROR', `Invalid micro-dollar rate for ${key}.`, 500);
      }
      output[key] = value;
    }
    return output;
  }

  private getCanonTarget(type: string, id: string, expectedProjectId?: string): { projectId: string; value: unknown } {
    const state = this.state();
    switch (type) {
      case 'project': {
        const value = requireRecord(
          state.projects.find(item => item.id === id && (!expectedProjectId || item.id === expectedProjectId)),
          'Project',
          id
        );
        return { projectId: value.id, value };
      }
      case 'story_bible': {
        const value = requireRecord(
          state.bibles.find(item => item.projectId === id && (!expectedProjectId || item.projectId === expectedProjectId)),
          'Story Bible',
          id
        );
        return { projectId: value.projectId, value };
      }
      case 'character': {
        const value = requireRecord(
          state.characters.find(item => item.id === id && (!expectedProjectId || item.projectId === expectedProjectId)),
          'Character',
          id
        );
        return { projectId: value.projectId, value };
      }
      case 'scene': {
        const value = requireRecord(
          state.scenes.find(item => item.id === id && (!expectedProjectId || item.projectId === expectedProjectId)),
          'Scene',
          id
        );
        return { projectId: value.projectId, value };
      }
      case 'location': {
        const value = requireRecord(
          state.locations.find(item => item.id === id && (!expectedProjectId || item.projectId === expectedProjectId)),
          'Location',
          id
        );
        return { projectId: value.projectId, value };
      }
      case 'prop': {
        const value = requireRecord(
          state.props.find(item => item.id === id && (!expectedProjectId || item.projectId === expectedProjectId)),
          'Prop',
          id
        );
        return { projectId: value.projectId, value };
      }
      case 'asset': {
        const value = requireRecord(
          state.assets.find(item => item.id === id && (!expectedProjectId || item.projectId === expectedProjectId)),
          'Asset',
          id
        );
        return { projectId: value.projectId, value };
      }
      default:
        throw new McpDomainError('UNSUPPORTED_TARGET', `Unsupported canon target type ${type}.`);
    }
  }

  private applyCanonProposal(proposal: CanonChangeProposalRecord) {
    const proposed = asObject(proposal.proposedValue);
    switch (proposal.entityType) {
      case 'project': {
        const current = requireRecord(
          this.state().projects.find(item => item.id === proposal.entityId && item.id === proposal.projectId),
          'Project',
          proposal.entityId
        );
        db.saveProject({ ...(proposed as unknown as Project), id: current.id });
        return;
      }
      case 'story_bible': {
        const current = requireRecord(
          this.state().bibles.find(item => item.projectId === proposal.entityId && item.projectId === proposal.projectId),
          'Story Bible',
          proposal.entityId
        );
        db.saveBible({ ...(proposed as unknown as StoryBible), projectId: current.projectId });
        return;
      }
      case 'character': {
        const current = requireRecord(
          this.state().characters.find(item => item.id === proposal.entityId && item.projectId === proposal.projectId),
          'Character',
          proposal.entityId
        );
        db.saveCharacter({
          ...(proposed as unknown as Character),
          id: current.id,
          projectId: current.projectId,
          isLocked: true,
          canonStatus: 'Canon Locked'
        });
        return;
      }
      case 'scene': {
        const current = requireRecord(
          this.state().scenes.find(item => item.id === proposal.entityId && item.projectId === proposal.projectId),
          'Scene',
          proposal.entityId
        );
        db.saveScene({
          ...(proposed as unknown as Scene),
          id: current.id,
          projectId: current.projectId,
          status: 'Canon Locked'
        });
        return;
      }
      case 'location': {
        const current = requireRecord(
          this.state().locations.find(item => item.id === proposal.entityId && item.projectId === proposal.projectId),
          'Location',
          proposal.entityId
        );
        db.saveLocation({
          ...(proposed as unknown as Location),
          id: current.id,
          projectId: current.projectId,
          isLocked: true,
          canonStatus: 'Canon Locked'
        });
        return;
      }
      case 'prop': {
        const current = requireRecord(
          this.state().props.find(item => item.id === proposal.entityId && item.projectId === proposal.projectId),
          'Prop',
          proposal.entityId
        );
        db.saveProp({
          ...(proposed as unknown as Prop),
          id: current.id,
          projectId: current.projectId,
          isLocked: true,
          canonStatus: 'Canon Locked'
        });
        return;
      }
      case 'asset': {
        const current = requireRecord(
          this.state().assets.find(item => item.id === proposal.entityId && item.projectId === proposal.projectId),
          'Asset',
          proposal.entityId
        );
        const nextVersion = Math.max(current.metadata.version || 0, 0) + 1;
        const newAsset: Asset = {
          ...(proposed as unknown as Asset),
          id: `asset-canon-${proposal.id}`,
          projectId: current.projectId,
          metadata: {
            ...(proposed.metadata as unknown as Asset['metadata']),
            version: nextVersion,
            parentId: current.id,
            approvalStatus: 'Canon Locked'
          },
          createdAt: new Date().toISOString()
        };
        db.saveAsset(newAsset);
        return;
      }
      default:
        throw new McpDomainError('UNSUPPORTED_TARGET', `Unsupported canon target type ${proposal.entityType}.`);
    }
  }
}

export function projectIdForAudit(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const record = result as Record<string, unknown>;
  if (typeof record.projectId === 'string') return record.projectId;
  if (record.project && typeof record.project === 'object' && record.project && 'id' in record.project) {
    return String((record.project as Record<string, unknown>).id);
  }
  if (record.job && typeof record.job === 'object' && record.job && 'projectId' in record.job) {
    return String((record.job as Record<string, unknown>).projectId);
  }
  return null;
}

export function generationProjectId(job: GenerationJobRecord | null) {
  return job?.projectId || null;
}
