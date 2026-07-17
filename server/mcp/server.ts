import { randomUUID } from 'node:crypto';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { redactSecrets } from '../integrations/auth';
import { IntegrationStore } from '../integrations/store';
import { IntegrationPrincipal, IntegrationStoreError } from '../integrations/types';
import { AnimeMcpDomainService, McpDomainError, projectIdForAudit } from './domain';
import {
  approveCanonChangeSchema,
  compileShotPromptSchema,
  confirmGenerationJobSchema,
  createCharacterDraftSchema,
  createGenerationJobSchema,
  createSceneDraftSchema,
  getCharacterSchema,
  getGenerationJobSchema,
  getProjectSchema,
  getSceneSchema,
  getStoryBibleSchema,
  listCharactersSchema,
  listProjectsSchema,
  listScenesSchema,
  proposeCanonChangeSchema,
  hasExactlyOneReviewTarget,
  runContinuityReviewSchema,
  toolOutputSchema,
  updateSceneDraftSchema
} from './schemas';
import {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  canonApprovalAnnotations,
  externalGenerationAnnotations,
  generationConfirmationAnnotations,
  localDraftAnnotations,
  localReadAnnotations
} from './metadata';

function successResult(result: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: { result }
  };
}

function errorDetails(error: unknown) {
  if (error instanceof IntegrationStoreError || error instanceof McpDomainError) {
    return { code: error.code, message: error.message };
  }
  return { code: 'INTERNAL_ERROR', message: 'The integration operation failed unexpectedly.' };
}

function diagnosticDetails(error: unknown) {
  if (error instanceof IntegrationStoreError || error instanceof McpDomainError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) return { code: 'INTERNAL_ERROR', name: error.name, message: error.message };
  return { code: 'INTERNAL_ERROR', message: 'Unknown integration error.' };
}

function failureResult(error: unknown) {
  const details = errorDetails(error);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: details }) }],
    structuredContent: { result: { error: details } },
    isError: true
  };
}

function isDenied(error: unknown) {
  return (
    (error instanceof IntegrationStoreError &&
      ['AUTHENTICATION_FAILED', 'AUTHORIZATION_DENIED'].includes(error.code)) ||
    (error instanceof McpDomainError && error.status === 403)
  );
}

export function createAnimeMcpServer(
  principal: IntegrationPrincipal,
  integrations: IntegrationStore,
  requestId = randomUUID()
) {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { capabilities: { logging: {} } }
  );
  const domain = new AnimeMcpDomainService(integrations);

  const invoke = async (
    operation: string,
    input: Record<string, unknown>,
    handler: () => unknown | Promise<unknown>,
    targetType?: string,
    targetId?: string
  ) => {
    try {
      const result = await handler();
      integrations.appendAuditEvent({
        operation,
        result: 'success',
        tokenId: principal.tokenId,
        projectId:
          (typeof input.projectId === 'string' ? input.projectId : null) || projectIdForAudit(result),
        targetType: targetType || null,
        targetId: targetId || null,
        requestId,
        metadata: redactSecrets({ inputKeys: Object.keys(input) })
      });
      return successResult(result);
    } catch (error) {
      const details = errorDetails(error);
      integrations.appendAuditEvent({
        operation,
        result: isDenied(error) ? 'denied' : 'failure',
        tokenId: principal.tokenId,
        projectId: typeof input.projectId === 'string' ? input.projectId : null,
        targetType: targetType || null,
        targetId: targetId || null,
        requestId,
        metadata: redactSecrets({ inputKeys: Object.keys(input), error: diagnosticDetails(error) })
      });
      return failureResult(error);
    }
  };

  server.registerTool(
    'list_projects',
    {
      title: 'List authorized anime projects',
      description:
        'Read only. Use to discover projects granted to the current token. Do not use it to infer or enumerate projects outside those grants.',
      inputSchema: listProjectsSchema,
      outputSchema: toolOutputSchema,
      annotations: localReadAnnotations
    },
    async () => invoke('list_projects', {}, () => domain.listProjects(principal), 'project')
  );

  server.registerTool(
    'get_project',
    {
      title: 'Read project metadata and canon summary',
      description:
        'Read only. Returns project stage, warnings, and record counts. Use before deeper reads; never treat legacy unversioned records as approved solely because they are present.',
      inputSchema: getProjectSchema,
      outputSchema: toolOutputSchema,
      annotations: localReadAnnotations
    },
    async ({ projectId }) =>
      invoke('get_project', { projectId }, () => domain.getProject(principal, projectId), 'project', projectId)
  );

  server.registerTool(
    'get_story_bible',
    {
      title: 'Read separated story-bible canon states',
      description:
        'Read only. Returns approved/locked, draft, and disputed lore separately. Do not promote legacy or draft lore by calling this tool.',
      inputSchema: getStoryBibleSchema,
      outputSchema: toolOutputSchema,
      annotations: localReadAnnotations
    },
    async ({ projectId }) =>
      invoke(
        'get_story_bible',
        { projectId },
        () => domain.getStoryBible(principal, projectId),
        'story_bible',
        projectId
      )
  );

  server.registerTool(
    'list_characters',
    {
      title: 'List project characters and forms',
      description:
        'Read only. Returns IDs, names, approval state, current version where available, and defined forms/costumes. Do not invent missing identities or forms.',
      inputSchema: listCharactersSchema,
      outputSchema: toolOutputSchema,
      annotations: localReadAnnotations
    },
    async ({ projectId }) =>
      invoke(
        'list_characters',
        { projectId },
        () => domain.listCharacters(principal, projectId),
        'character'
      )
  );

  server.registerTool(
    'get_character',
    {
      title: 'Read a character continuity record',
      description:
        'Read only. Returns physical identity, costume, personality, relationships, visual anchors, constraints, and do-not-change attributes. A requested timeline state must exist; the tool never infers one.',
      inputSchema: getCharacterSchema,
      outputSchema: toolOutputSchema,
      annotations: localReadAnnotations
    },
    async ({ characterId, timelineStateId }) =>
      invoke(
        'get_character',
        { characterId, timelineStateId },
        () => domain.getCharacter(principal, characterId, timelineStateId),
        'character',
        characterId
      )
  );

  server.registerTool(
    'list_scenes',
    {
      title: 'List project scenes',
      description:
        'Read only. Lists scene summaries and continuity state, optionally filtered by episode or status. Use get_scene for complete structured content.',
      inputSchema: listScenesSchema,
      outputSchema: toolOutputSchema,
      annotations: localReadAnnotations
    },
    async ({ projectId, episodeId, status }) =>
      invoke(
        'list_scenes',
        { projectId, episodeId, status },
        () => domain.listScenes(principal, projectId, episodeId, status),
        'scene'
      )
  );

  server.registerTool(
    'get_scene',
    {
      title: 'Read a complete scene',
      description:
        'Read only. Returns screenplay, beats, characters, costumes, props, timeline position, and continuity requirements. It never changes scene status.',
      inputSchema: getSceneSchema,
      outputSchema: toolOutputSchema,
      annotations: localReadAnnotations
    },
    async ({ sceneId }) =>
      invoke('get_scene', { sceneId }, () => domain.getScene(principal, sceneId), 'scene', sceneId)
  );

  server.registerTool(
    'create_scene_draft',
    {
      title: 'Create an external scene draft',
      description:
        'Write operation. Creates a new versioned Draft only. Use for proposed scenes; never use it to replace approved or locked scenes.',
      inputSchema: createSceneDraftSchema,
      outputSchema: toolOutputSchema,
      annotations: localDraftAnnotations
    },
    async ({ projectId, episodeId, title, sceneData, sourceNote }) =>
      invoke(
        'create_scene_draft',
        { projectId, episodeId, title, sceneData, sourceNote },
        () => domain.createSceneDraft(principal, { projectId, episodeId, title, sceneData, sourceNote }),
        'scene'
      )
  );

  server.registerTool(
    'update_scene_draft',
    {
      title: 'Update a scene draft with optimistic concurrency',
      description:
        'Write operation. Updates only an MCP-created Draft and rejects stale expectedVersion values. It cannot modify approved or locked records.',
      inputSchema: updateSceneDraftSchema,
      outputSchema: toolOutputSchema,
      annotations: localDraftAnnotations
    },
    async ({ sceneId, expectedVersion, patch, reason }) =>
      invoke(
        'update_scene_draft',
        { sceneId, expectedVersion, patch, reason },
        () => domain.updateSceneDraft(principal, { sceneId, expectedVersion, patch, reason }),
        'scene',
        sceneId
      )
  );

  server.registerTool(
    'create_character_draft',
    {
      title: 'Create a character proposal',
      description:
        'Write operation. Creates a separate Draft character or variation. It never replaces an approved identity or silently changes core traits.',
      inputSchema: createCharacterDraftSchema,
      outputSchema: toolOutputSchema,
      annotations: localDraftAnnotations
    },
    async ({ projectId, name, characterData, sourceNote }) =>
      invoke(
        'create_character_draft',
        { projectId, name, characterData, sourceNote },
        () => domain.createCharacterDraft(principal, { projectId, name, characterData, sourceNote }),
        'character'
      )
  );

  server.registerTool(
    'run_continuity_review',
    {
      title: 'Run an evidence-based continuity review',
      description:
        'Read only analytical operation. Reviews exactly one scene, storyboard panel, asset, or generation job against stored project records and returns evidence-backed findings. It does not save or promote model output.',
      inputSchema: runContinuityReviewSchema,
      outputSchema: toolOutputSchema,
      annotations: localReadAnnotations
    },
    async input =>
      invoke(
        'run_continuity_review',
        input,
        () => {
          if (!hasExactlyOneReviewTarget(input)) {
            throw new McpDomainError(
              'VALIDATION_ERROR',
              'Provide exactly one of sceneId, storyboardId, assetId, or generationJobId.',
              400
            );
          }
          return domain.runContinuityReview(principal, input);
        },
        'continuity_review'
      )
  );

  server.registerTool(
    'compile_shot_prompt',
    {
      title: 'Compile a provenance-backed shot prompt',
      description:
        'Read only. Compiles from stored shot, character, costume, location, prop, and style records and returns every source used. It returns a blocked candidate instead of inventing missing or unlocked canon.',
      inputSchema: compileShotPromptSchema,
      outputSchema: toolOutputSchema,
      annotations: localReadAnnotations
    },
    async ({ shotId }) =>
      invoke(
        'compile_shot_prompt',
        { shotId },
        () => domain.compileShotPrompt(principal, shotId),
        'shot',
        shotId
      )
  );

  server.registerTool(
    'create_generation_job',
    {
      title: 'Prepare a paid generation job',
      description:
        'Write/open-world operation. Seals a locked prompt and returns a trusted cost estimate plus a one-use confirmation token. It never submits paid generation in this call.',
      inputSchema: createGenerationJobSchema,
      outputSchema: toolOutputSchema,
      annotations: externalGenerationAnnotations
    },
    async input =>
      invoke(
        'create_generation_job',
        input,
        () => domain.createGenerationJob(principal, input),
        'generation_job'
      )
  );

  server.registerTool(
    'confirm_generation_job',
    {
      title: 'Confirm and queue a reviewed generation job',
      description:
        'Write/open-world operation. Consumes the one-use confirmation token and queues the exact previously reviewed job. Do not call before the user explicitly approves cost and parameters.',
      inputSchema: confirmGenerationJobSchema,
      outputSchema: toolOutputSchema,
      annotations: generationConfirmationAnnotations
    },
    async ({ jobId, confirmationToken }) =>
      invoke(
        'confirm_generation_job',
        { jobId, confirmationToken },
        () => domain.confirmGenerationJob(principal, jobId, confirmationToken),
        'generation_job',
        jobId
      )
  );

  server.registerTool(
    'get_generation_job',
    {
      title: 'Read generation job state',
      description:
        'Read only. Returns queue state, provider, estimated cost, output assets, and redacted errors for an authorized project job.',
      inputSchema: getGenerationJobSchema,
      outputSchema: toolOutputSchema,
      annotations: localReadAnnotations
    },
    async ({ jobId }) =>
      invoke(
        'get_generation_job',
        { jobId },
        () => domain.getGenerationJob(principal, jobId),
        'generation_job',
        jobId
      )
  );

  server.registerTool(
    'propose_canon_change',
    {
      title: 'Propose a reviewed canon change',
      description:
        'Write operation. Records old and proposed values, reason, affected assets, and continuity impact without applying the change. Use this instead of directly editing approved or locked canon.',
      inputSchema: proposeCanonChangeSchema,
      outputSchema: toolOutputSchema,
      annotations: localDraftAnnotations
    },
    async input =>
      invoke(
        'propose_canon_change',
        input,
        () => domain.proposeCanonChange(principal, input),
        input.targetType,
        input.targetId
      )
  );

  server.registerTool(
    'approve_canon_change',
    {
      title: 'Approve and apply a canon change',
      description:
        'Destructive/high-impact operation. Requires a read-write token with elevated canon:approve scope and the exact explicit confirmation phrase. Never call for routine draft editing.',
      inputSchema: approveCanonChangeSchema,
      outputSchema: toolOutputSchema,
      annotations: canonApprovalAnnotations
    },
    async ({ proposalId, confirmation }) =>
      invoke(
        'approve_canon_change',
        { proposalId, confirmation },
        () => domain.approveCanonChange(principal, proposalId, confirmation === 'APPROVE CANON CHANGE'),
        'canon_proposal',
        proposalId
      )
  );

  const registerJsonResource = (
    name: string,
    template: string,
    title: string,
    description: string,
    reader: (variables: Record<string, string | string[]>) => unknown
  ) => {
    server.registerResource(
      name,
      new ResourceTemplate(template, { list: undefined }),
      { title, description, mimeType: 'application/json' },
      async (uri, variables) => {
        try {
          const result = await reader(variables);
          integrations.appendAuditEvent({
            operation: `resource:${name}`,
            result: 'success',
            tokenId: principal.tokenId,
            projectId: typeof variables.projectId === 'string' ? variables.projectId : null,
            requestId,
            metadata: { uri: uri.href }
          });
          return {
            contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(result) }]
          };
        } catch (error) {
          integrations.appendAuditEvent({
            operation: `resource:${name}`,
            result: isDenied(error) ? 'denied' : 'failure',
            tokenId: principal.tokenId,
            projectId: typeof variables.projectId === 'string' ? variables.projectId : null,
            requestId,
            metadata: redactSecrets({ uri: uri.href, error: diagnosticDetails(error) })
          });
          if (error instanceof IntegrationStoreError || error instanceof McpDomainError) throw error;
          throw new Error('The requested integration resource could not be read.');
        }
      }
    );
  };

  const resourceVariable = (variables: Record<string, string | string[]>, key: string) => {
    const value = variables[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new McpDomainError('INVALID_RESOURCE_URI', `Resource variable ${key} must be a string.`);
    }
    return value;
  };

  registerJsonResource(
    'project-canon',
    'anime://projects/{projectId}/canon',
    'Project canon by state',
    'Read-only project metadata, bible, characters, and scenes with approval-state warnings.',
    variables => {
      const projectId = resourceVariable(variables, 'projectId');
      return {
        project: domain.getProject(principal, projectId),
        storyBible: domain.getStoryBible(principal, projectId),
        characters: domain.listCharacters(principal, projectId),
        scenes: domain.listScenes(principal, projectId)
      };
    }
  );

  registerJsonResource(
    'project-characters',
    'anime://projects/{projectId}/characters',
    'Project character index',
    'Read-only character IDs, approval states, and available forms/costumes.',
    variables => domain.listCharacters(principal, resourceVariable(variables, 'projectId'))
  );

  registerJsonResource(
    'project-timeline',
    'anime://projects/{projectId}/timeline',
    'Project timeline',
    'Read-only persisted timeline. Missing timelines return an empty view without mutating canon.',
    variables => domain.getTimeline(principal, resourceVariable(variables, 'projectId'))
  );

  registerJsonResource(
    'scene',
    'anime://scenes/{sceneId}',
    'Scene record',
    'Read-only complete scene or MCP draft record.',
    variables => domain.getScene(principal, resourceVariable(variables, 'sceneId'))
  );

  registerJsonResource(
    'character-reference',
    'anime://characters/{characterId}/reference',
    'Character reference package',
    'Read-only identity, costume, visual anchors, and continuity constraints for a character.',
    variables => domain.getCharacter(principal, resourceVariable(variables, 'characterId'))
  );

  registerJsonResource(
    'project-continuity-report',
    'anime://projects/{projectId}/continuity-report',
    'Project continuity report',
    'Read-only stored continuity reviews plus provenance warnings.',
    variables => domain.getContinuityReport(principal, resourceVariable(variables, 'projectId'))
  );

  return server;
}
