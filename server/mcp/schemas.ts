import * as z from 'zod/v4';

export const toolOutputSchema = {
  result: z.union([
    z.record(z.string(), z.unknown()),
    z.array(z.unknown())
  ])
};

export const projectIdSchema = z.string().trim().min(1).max(128);
export const entityIdSchema = z.string().trim().min(1).max(160);

export const listProjectsSchema = {};

export const getProjectSchema = {
  projectId: projectIdSchema
};

export const getStoryBibleSchema = getProjectSchema;

export const listCharactersSchema = getProjectSchema;

export const getCharacterSchema = {
  characterId: entityIdSchema,
  timelineStateId: entityIdSchema.optional()
};

export const listScenesSchema = {
  projectId: projectIdSchema,
  episodeId: z.string().trim().min(1).max(128).optional(),
  status: z.enum(['Draft', 'Approved', 'Canon Locked']).optional()
};

export const getSceneSchema = {
  sceneId: entityIdSchema
};

export const createSceneDraftSchema = {
  projectId: projectIdSchema,
  episodeId: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(240),
  sceneData: z.record(z.string(), z.unknown()),
  sourceNote: z.string().trim().min(1).max(2_000)
};

export const updateSceneDraftSchema = {
  sceneId: entityIdSchema,
  expectedVersion: z.number().int().positive(),
  patch: z.record(z.string(), z.unknown()),
  reason: z.string().trim().min(1).max(2_000)
};

export const createCharacterDraftSchema = {
  projectId: projectIdSchema,
  name: z.string().trim().min(1).max(160),
  characterData: z.record(z.string(), z.unknown()),
  sourceNote: z.string().trim().min(1).max(2_000)
};

export const runContinuityReviewSchema = {
  projectId: projectIdSchema,
  sceneId: entityIdSchema.optional(),
  storyboardId: entityIdSchema.optional(),
  assetId: entityIdSchema.optional(),
  generationJobId: entityIdSchema.optional()
};

export const compileShotPromptSchema = {
  shotId: entityIdSchema
};

export const createGenerationJobSchema = {
  shotId: entityIdSchema,
  provider: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(160),
  resolution: z.string().trim().min(1).max(40),
  duration: z.number().positive().max(120),
  variationCount: z.number().int().min(1).max(8)
};

export const confirmGenerationJobSchema = {
  jobId: entityIdSchema,
  confirmationToken: z.string().trim().min(16).max(512)
};

export const getGenerationJobSchema = {
  jobId: entityIdSchema
};

export const proposeCanonChangeSchema = {
  projectId: projectIdSchema,
  targetType: z.enum(['project', 'story_bible', 'character', 'scene', 'location', 'prop', 'asset']),
  targetId: entityIdSchema,
  proposedPatch: z.record(z.string(), z.unknown()),
  reason: z.string().trim().min(1).max(4_000),
  affectedAssetIds: z.array(entityIdSchema).max(200).default([]),
  continuityImpact: z.string().trim().min(1).max(4_000)
};

export const approveCanonChangeSchema = {
  proposalId: entityIdSchema,
  confirmation: z.literal('APPROVE CANON CHANGE')
};

export function hasExactlyOneReviewTarget(input: {
  sceneId?: string;
  storyboardId?: string;
  assetId?: string;
  generationJobId?: string;
}) {
  const targets = [input.sceneId, input.storyboardId, input.assetId, input.generationJobId].filter(Boolean);
  return targets.length === 1;
}

export { z };
