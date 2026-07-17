export const MCP_SERVER_NAME = 'anime-orchestrator';
export const MCP_SERVER_VERSION = '0.1.0';

export const MCP_SCOPES = [
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
  'canon:approve'
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

export const READ_ONLY_SCOPES: McpScope[] = [
  'projects:read',
  'canon:read',
  'characters:read',
  'scenes:read',
  'continuity:read',
  'prompts:read',
  'generations:read'
];

export const DEFAULT_WRITE_SCOPES: McpScope[] = [
  ...READ_ONLY_SCOPES,
  'drafts:write',
  'generations:write',
  'canon:propose'
];

export const localReadAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

export const localDraftAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
} as const;

export const externalGenerationAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true
} as const;

export const generationConfirmationAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true
} as const;

export const canonApprovalAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false
} as const;
