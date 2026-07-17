import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IntegrationStore } from '../../server/integrations/store';

const TEST_PEPPER = 'vitest-mcp-pepper-with-at-least-16-bytes';

let httpServer: Server;
let endpoint: URL;
let store: IntegrationStore;
let bearerToken: string;
let draftBearerToken: string;
let resetRuntime: () => void;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.INTEGRATION_TOKEN_PEPPER = TEST_PEPPER;
  process.env.INTEGRATIONS_DB_PATH = ':memory:';
  process.env.PUBLIC_BASE_URL = 'http://127.0.0.1:3000';

  const runtime = await import('../../server/integrations/runtime');
  runtime.resetIntegrationRuntimeForTests();
  resetRuntime = runtime.resetIntegrationRuntimeForTests;

  const { app } = await import('../../server');
  const configuredStore = runtime.getIntegrationStore();
  if (!configuredStore) {
    throw runtime.getIntegrationConfigurationError() ?? new Error('Integration store unavailable.');
  }
  store = configuredStore;
  bearerToken = store.createIntegrationToken({
    name: 'MCP protocol test',
    permission: 'read-only',
    scopes: [
      'projects:read',
      'canon:read',
      'characters:read',
      'scenes:read',
      'continuity:read',
      'prompts:read',
      'generations:read',
    ],
    projectIds: ['crimson-sword'],
  }).bearerToken;
  draftBearerToken = store.createIntegrationToken({
    name: 'MCP draft continuity test',
    permission: 'read-write',
    scopes: ['drafts:write'],
    projectIds: ['crimson-sword'],
  }).bearerToken;

  httpServer = createServer(app);
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const address = httpServer.address() as AddressInfo;
  endpoint = new URL(`http://127.0.0.1:${address.port}/mcp`);
});

afterAll(async () => {
  if (httpServer?.listening) {
    await new Promise<void>((resolve, reject) => {
      httpServer.close(error => (error ? reject(error) : resolve()));
    });
  }
  resetRuntime?.();
});

describe('stateless Streamable HTTP MCP endpoint', () => {
  it('rejects unapproved Host headers before processing MCP credentials', async () => {
    const response = await request(httpServer)
      .post('/mcp')
      .set('Host', 'attacker.example')
      .set('Authorization', `Bearer ${bearerToken}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'ping' });

    expect(response.status).toBe(421);
    expect(response.body).toMatchObject({
      jsonrpc: '2.0',
      error: { code: -32000 },
    });
  });

  it('rejects initialize requests without a bearer token', async () => {
    const response = await request(httpServer)
      .post('/mcp')
      .set('Host', 'localhost')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'unauthenticated-vitest', version: '1.0.0' },
        },
      });

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toContain('Bearer');
    expect(response.body).toMatchObject({
      jsonrpc: '2.0',
      error: { code: -32001 },
    });
  });

  it('authenticates before enforcing the bounded MCP JSON payload size', async () => {
    const response = await request(httpServer)
      .post('/mcp')
      .set('Host', 'localhost')
      .set('Authorization', `Bearer ${bearerToken}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'ping',
        padding: 'x'.repeat(300_000),
      });

    expect(response.status).toBe(413);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body).toMatchObject({
      jsonrpc: '2.0',
      error: { code: -32600 },
    });
  });

  it('keeps the legacy stock-video simulator disabled by default', async () => {
    const adminSession = store.createAdminSession({ subject: 'vitest-generation-safety' });
    const response = await request(httpServer)
      .post('/api/generations/video')
      .set('Cookie', `anime_orchestrator_admin=${adminSession.sessionToken}`)
      .send({
        projectId: 'crimson-sword',
        shotId: 'shot-test',
        prompt: 'This request must not create a placeholder video.',
        isFastPreview: true,
      });

    expect(response.status).toBe(503);
    expect(response.body.error).toContain('stock-video simulator is disabled');
  });

  it('initializes through the official client and lists all integration tools', async () => {
    const client = new Client(
      { name: 'anime-orchestrator-vitest', version: '1.0.0' },
      { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: {
        headers: { Authorization: `Bearer ${bearerToken}` },
      },
    });

    try {
      await client.connect(transport);
      const response = await client.listTools();
      const names = response.tools.map(tool => tool.name);

      expect(names).toHaveLength(17);
      expect(names).toEqual(expect.arrayContaining([
        'list_projects',
        'get_project',
        'get_story_bible',
        'list_characters',
        'get_character',
        'list_scenes',
        'get_scene',
        'create_scene_draft',
        'update_scene_draft',
        'create_character_draft',
        'run_continuity_review',
        'compile_shot_prompt',
        'create_generation_job',
        'confirm_generation_job',
        'get_generation_job',
        'propose_canon_change',
        'approve_canon_change',
      ]));
      expect(response.tools.find(tool => tool.name === 'list_projects')?.annotations)
        .toMatchObject({ readOnlyHint: true, openWorldHint: false });
      expect(response.tools.find(tool => tool.name === 'approve_canon_change')?.annotations)
        .toMatchObject({ destructiveHint: true });
      expect(response.tools.find(tool => tool.name === 'create_generation_job')?.annotations)
        .toMatchObject({ destructiveHint: false, openWorldHint: true });
      expect(response.tools.find(tool => tool.name === 'confirm_generation_job')?.annotations)
        .toMatchObject({ destructiveHint: true, openWorldHint: true });

      const validation = await client.callTool({
        name: 'run_continuity_review',
        arguments: { projectId: 'crimson-sword' },
      });
      expect(validation.isError).toBe(true);
      expect(validation.structuredContent).toMatchObject({
        result: {
          error: {
            code: 'VALIDATION_ERROR',
          },
        },
      });
    } finally {
      await client.close();
    }
  });

  it('reviews an MCP-created scene draft without promoting or changing it', async () => {
    const writer = new Client(
      { name: 'anime-orchestrator-draft-writer-vitest', version: '1.0.0' },
      { capabilities: {} },
    );
    const writerTransport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: {
        headers: { Authorization: `Bearer ${draftBearerToken}` },
      },
    });
    const reader = new Client(
      { name: 'anime-orchestrator-draft-reader-vitest', version: '1.0.0' },
      { capabilities: {} },
    );
    const readerTransport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: {
        headers: { Authorization: `Bearer ${bearerToken}` },
      },
    });

    try {
      await writer.connect(writerTransport);
      const created = await writer.callTool({
        name: 'create_scene_draft',
        arguments: {
          projectId: 'crimson-sword',
          episodeId: '1',
          title: 'Opening exterior',
          sceneData: {
            sceneNumber: '1',
            charactersPresentIds: ['missing-character'],
            action: 'An isolated cottage stands under moonlight while wolves encircle it.',
          },
          sourceNote: 'Vitest-only storyboard transcription.',
        },
      });
      expect(created.isError).not.toBe(true);
      const createdResult = created.structuredContent as {
        result: { entityId: string; version: number };
      };

      await reader.connect(readerTransport);
      const reviewed = await reader.callTool({
        name: 'run_continuity_review',
        arguments: {
          projectId: 'crimson-sword',
          sceneId: createdResult.result.entityId,
        },
      });

      expect(reviewed.isError).not.toBe(true);
      expect(reviewed.structuredContent).toMatchObject({
        result: {
          projectId: 'crimson-sword',
          target: {
            type: 'scene',
            id: createdResult.result.entityId,
          },
          analyticalMode: 'deterministic-record-review',
          findings: [{
            severity: 'critical',
            code: 'MISSING_CHARACTER',
            evidence: [{
              type: 'scene',
              id: createdResult.result.entityId,
              field: 'charactersPresentIds',
              value: 'missing-character',
            }],
          }],
          summary: {
            critical: 1,
            warning: 0,
            info: 0,
          },
        },
      });

      const readBack = await reader.callTool({
        name: 'get_scene',
        arguments: { sceneId: createdResult.result.entityId },
      });
      expect(readBack.structuredContent).toMatchObject({
        result: {
          version: createdResult.result.version,
          status: 'Draft',
          scene: {
            id: createdResult.result.entityId,
            status: 'Draft',
          },
        },
      });
    } finally {
      await Promise.allSettled([writer.close(), reader.close()]);
    }
  });
});
