import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Code,
  Copy,
  Key,
  Lock,
  Plus,
  Power,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  Wifi,
  WifiOff,
  X
} from 'lucide-react';
import { Project } from '../types';

interface Props {
  activeProject: Project | null;
  onRefreshProject: () => void;
}

type IntegrationPermission = 'read-only' | 'read-write';

interface McpServerState {
  enabled: boolean;
  status: string;
  endpoint: string;
  transport: string;
  version: string;
  adminAuthRequired: boolean;
}

interface IntegrationProject {
  id: string;
  title: string;
}

interface ProjectGrant {
  projectId?: string;
  id?: string;
  title?: string;
}

interface IntegrationTokenSummary {
  id: string;
  name: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  status?: string;
  permission: IntegrationPermission;
  scopes: string[];
  projectIds?: string[];
  projects?: Array<string | ProjectGrant>;
  projectGrants?: ProjectGrant[];
  prefix?: string;
  tokenPrefix?: string;
}

interface IntegrationActivityEvent {
  id: string;
  timestamp?: string;
  createdAt?: string;
  occurredAt?: string;
  action?: string;
  operation?: string;
  toolName?: string;
  resourceUri?: string;
  result?: string;
  summary?: string;
  message?: string;
  projectId?: string;
  tokenName?: string;
  tokenId?: string;
  actor?: string;
  requestId?: string;
  targetType?: string;
  targetId?: string;
}

interface IntegrationStatusResponse {
  server: McpServerState;
  configTemplate: string;
}

interface IntegrationOverviewResponse extends IntegrationStatusResponse {
  tokens: IntegrationTokenSummary[];
  projects: IntegrationProject[];
  activity: IntegrationActivityEvent[];
}

interface ConnectionTestResult {
  ok: boolean;
  checkedAt?: string;
  latencyMs?: number;
  serverVersion?: string;
  capabilities?: string[];
  error?: string;
  message?: string;
}

interface Notice {
  kind: 'success' | 'error' | 'info';
  message: string;
}

interface TokenFormState {
  name: string;
  expiresAt: string;
  projectIds: string[];
  permission: IntegrationPermission;
  scopes: string[];
}

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const READ_SCOPES = [
  { value: 'projects:read', label: 'Projects', description: 'List and inspect granted projects.' },
  { value: 'canon:read', label: 'Canon', description: 'Read approved, locked, draft, and disputed lore.' },
  { value: 'characters:read', label: 'Characters', description: 'Read identities, forms, costumes, and visual anchors.' },
  { value: 'scenes:read', label: 'Scenes', description: 'Read scenes, beats, storyboards, and continuity state.' },
  { value: 'continuity:read', label: 'Continuity review', description: 'Run read-only continuity analysis.' },
  { value: 'prompts:read', label: 'Prompt compiler', description: 'Compile shot prompts from locked source records.' },
  { value: 'generations:read', label: 'Generation jobs', description: 'Inspect generation estimates, queue state, outputs, and errors.' }
] as const;

const WRITE_SCOPES = [
  { value: 'drafts:write', label: 'Production drafts', description: 'Create scene and character drafts without replacing approved records.' },
  { value: 'generations:write', label: 'Generation jobs', description: 'Stage and confirm external generation jobs.' },
  { value: 'canon:propose', label: 'Canon proposals', description: 'Propose changes without promoting them.' }
] as const;

const ELEVATED_SCOPE = {
  value: 'canon:approve',
  label: 'Canon approval',
  description: 'Elevated: approve a canon-change proposal after explicit confirmation.'
} as const;

const DEFAULT_READ_SCOPES = READ_SCOPES.map((scope) => scope.value);

function formatDate(value?: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getTokenProjectIds(token: IntegrationTokenSummary): string[] {
  if (token.projectIds) return token.projectIds;
  if (token.projectGrants) {
    return token.projectGrants.flatMap((grant) => grant.projectId || grant.id || []);
  }
  return (token.projects || []).flatMap((project) => {
    if (typeof project === 'string') return project;
    return project.projectId || project.id || [];
  });
}

function getTokenStatus(token: IntegrationTokenSummary) {
  if (token.revokedAt || token.status?.toLowerCase() === 'revoked') return 'revoked';
  if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()) return 'expired';
  return token.status?.toLowerCase() || 'active';
}

function getSafeConfig(server: McpServerState | null, template: string) {
  const startupTimeout = template.match(/startup_timeout_sec\s*=\s*(\d+)/)?.[1] || '20';
  const toolTimeout = template.match(/tool_timeout_sec\s*=\s*(\d+)/)?.[1] || '120';
  const endpoint = (server?.endpoint || 'https://USER_DEPLOYED_DOMAIN/mcp').replace(/[\r\n"]/g, '');

  return `[mcp_servers.anime_orchestrator]
enabled = true
required = true
url = "${endpoint}"
bearer_token_env_var = "ANIME_ORCHESTRATOR_TOKEN"
startup_timeout_sec = ${startupTimeout}
tool_timeout_sec = ${toolTimeout}`;
}

export default function CodexTab({ activeProject }: Props) {
  const [serverState, setServerState] = useState<McpServerState | null>(null);
  const [configTemplate, setConfigTemplate] = useState('');
  const [tokens, setTokens] = useState<IntegrationTokenSummary[]>([]);
  const [projects, setProjects] = useState<IntegrationProject[]>([]);
  const [activity, setActivity] = useState<IntegrationActivityEvent[]>([]);
  const [adminAuthenticated, setAdminAuthenticated] = useState<boolean | null>(null);
  const [adminKey, setAdminKey] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [creatingToken, setCreatingToken] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [oneTimeToken, setOneTimeToken] = useState<{ plaintext: string; token: IntegrationTokenSummary } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<IntegrationTokenSummary | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokingToken, setRevokingToken] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<boolean | null>(null);
  const [toggleReason, setToggleReason] = useState('');
  const [toggleConfirmation, setToggleConfirmation] = useState('');
  const [togglingServer, setTogglingServer] = useState(false);
  const [tokenForm, setTokenForm] = useState<TokenFormState>({
    name: '',
    expiresAt: '',
    projectIds: [],
    permission: 'read-only',
    scopes: [...DEFAULT_READ_SCOPES]
  });

  const safeConfig = useMemo(
    () => getSafeConfig(serverState, configTemplate),
    [serverState, configTemplate]
  );

  const requestJson = async <T,>(url: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    });

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        setAdminAuthenticated(false);
      }
      const body = payload as { error?: string; message?: string } | null;
      throw new ApiError(body?.error || body?.message || `Request failed (${response.status})`, response.status);
    }

    return payload as T;
  };

  const applyOverview = (overview: IntegrationOverviewResponse) => {
    setServerState(overview.server);
    setConfigTemplate(overview.configTemplate || '');
    setTokens(overview.tokens || []);
    setProjects(overview.projects || []);
    setActivity(overview.activity || []);
    setAdminAuthenticated(true);
    setTokenForm((current) => {
      if (current.projectIds.length > 0 || overview.projects.length === 0) return current;
      const preferredProject = overview.projects.find((project) => project.id === activeProject?.id) || overview.projects[0];
      return { ...current, projectIds: [preferredProject.id] };
    });
  };

  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      const overview = await requestJson<IntegrationOverviewResponse>('/api/integrations/overview');
      applyOverview(overview);
    } finally {
      setOverviewLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      setInitialLoading(true);
      try {
        const status = await requestJson<IntegrationStatusResponse>('/api/integrations/status');
        if (!active) return;
        setServerState(status.server);
        setConfigTemplate(status.configTemplate || '');

        try {
          const overview = await requestJson<IntegrationOverviewResponse>('/api/integrations/overview');
          if (active) applyOverview(overview);
        } catch (error) {
          if (!active) return;
          if (!(error instanceof ApiError && (error.status === 401 || error.status === 403))) {
            setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to load integration details.' });
          }
        }
      } catch (error) {
        if (active) {
          setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to reach the integration service.' });
        }
      } finally {
        if (active) setInitialLoading(false);
      }
    };

    void bootstrap();
    return () => {
      active = false;
    };
    // The initial project is used only to select the first token grant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdminSession = async (event: FormEvent) => {
    event.preventDefault();
    if (!adminKey.trim()) return;
    setAuthenticating(true);
    setNotice(null);
    try {
      await requestJson<unknown>('/api/integrations/admin/session', {
        method: 'POST',
        body: JSON.stringify({ adminKey })
      });
      setAdminAuthenticated(true);
      await loadOverview();
      setNotice({ kind: 'success', message: 'Secure integration session established.' });
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Authentication failed.' });
    } finally {
      setAdminKey('');
      setAuthenticating(false);
    }
  };

  const toggleProjectGrant = (projectId: string) => {
    setTokenForm((current) => ({
      ...current,
      projectIds: current.projectIds.includes(projectId)
        ? current.projectIds.filter((id) => id !== projectId)
        : [...current.projectIds, projectId]
    }));
  };

  const toggleScope = (scope: string) => {
    setTokenForm((current) => ({
      ...current,
      scopes: current.scopes.includes(scope)
        ? current.scopes.filter((item) => item !== scope)
        : [...current.scopes, scope]
    }));
  };

  const setPermission = (permission: IntegrationPermission) => {
    setTokenForm((current) => ({
      ...current,
      permission,
      scopes: permission === 'read-only'
        ? current.scopes.filter((scope) => DEFAULT_READ_SCOPES.includes(scope as typeof DEFAULT_READ_SCOPES[number]))
        : current.scopes
    }));
  };

  const handleCreateToken = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);

    if (!tokenForm.name.trim()) {
      setNotice({ kind: 'error', message: 'Enter a token name.' });
      return;
    }
    if (tokenForm.projectIds.length === 0) {
      setNotice({ kind: 'error', message: 'Grant access to at least one project.' });
      return;
    }
    if (tokenForm.scopes.length === 0) {
      setNotice({ kind: 'error', message: 'Select at least one permission scope.' });
      return;
    }

    let expiresAt: string | null = null;
    if (tokenForm.expiresAt) {
      const expiration = new Date(tokenForm.expiresAt);
      if (Number.isNaN(expiration.getTime()) || expiration.getTime() <= Date.now()) {
        setNotice({ kind: 'error', message: 'Expiration must be a valid future date and time.' });
        return;
      }
      expiresAt = expiration.toISOString();
    }

    setCreatingToken(true);
    try {
      const response = await requestJson<{ token: IntegrationTokenSummary; plaintextToken: string }>('/api/integrations/tokens', {
        method: 'POST',
        body: JSON.stringify({
          name: tokenForm.name.trim(),
          expiresAt,
          projectIds: tokenForm.projectIds,
          permission: tokenForm.permission,
          scopes: tokenForm.scopes
        })
      });
      setTokens((current) => [response.token, ...current.filter((token) => token.id !== response.token.id)]);
      setOneTimeToken({ plaintext: response.plaintextToken, token: response.token });
      setTokenForm((current) => ({
        ...current,
        name: '',
        expiresAt: '',
        permission: 'read-only',
        scopes: [...DEFAULT_READ_SCOPES]
      }));
      setNotice({ kind: 'success', message: 'Token created. Save the one-time value before closing the reveal.' });
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to create token.' });
    } finally {
      setCreatingToken(false);
    }
  };

  const handleRevokeToken = async (event: FormEvent) => {
    event.preventDefault();
    if (!revokeTarget || !revokeReason.trim()) return;
    setRevokingToken(true);
    setNotice(null);
    try {
      await requestJson<unknown>(`/api/integrations/tokens/${encodeURIComponent(revokeTarget.id)}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason: revokeReason.trim() })
      });
      await loadOverview();
      setRevokeTarget(null);
      setRevokeReason('');
      setNotice({ kind: 'success', message: `Token “${revokeTarget.name}” was revoked.` });
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to revoke token.' });
    } finally {
      setRevokingToken(false);
    }
  };

  const handleConnectionTest = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    setNotice(null);
    try {
      const result = await requestJson<ConnectionTestResult>('/api/integrations/test', { method: 'POST' });
      setConnectionResult(result);
      setNotice({
        kind: result.ok ? 'success' : 'error',
        message: result.ok ? 'MCP connection test passed.' : result.error || result.message || 'MCP connection test failed.'
      });
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Connection test failed.' });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleActivityRefresh = async () => {
    setActivityLoading(true);
    setNotice(null);
    try {
      const result = await requestJson<IntegrationActivityEvent[] | { activity: IntegrationActivityEvent[] }>('/api/integrations/activity');
      setActivity(Array.isArray(result) ? result : result.activity || []);
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to refresh activity.' });
    } finally {
      setActivityLoading(false);
    }
  };

  const openServerToggle = () => {
    if (!serverState) return;
    const target = !serverState.enabled;
    setToggleTarget(target);
    setToggleReason('');
    setToggleConfirmation('');
  };

  const handleServerToggle = async (event: FormEvent) => {
    event.preventDefault();
    if (toggleTarget === null || !toggleReason.trim()) return;
    const confirmation = toggleTarget ? 'ENABLE MCP' : 'DISABLE MCP';
    if (toggleConfirmation !== confirmation) return;

    setTogglingServer(true);
    setNotice(null);
    try {
      await requestJson<unknown>('/api/integrations/status', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: toggleTarget,
          reason: toggleReason.trim(),
          confirmation
        })
      });
      await loadOverview();
      setToggleTarget(null);
      setToggleReason('');
      setToggleConfirmation('');
      setNotice({ kind: 'success', message: toggleTarget ? 'MCP access enabled.' : 'MCP access disabled.' });
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to change MCP status.' });
    } finally {
      setTogglingServer(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice({ kind: 'success', message: `${label} copied to the clipboard.` });
    } catch {
      setNotice({ kind: 'error', message: `Could not copy ${label.toLowerCase()}. Select and copy it manually.` });
    }
  };

  const normalizedServerStatus = serverState?.status?.toLowerCase() || '';
  const serverHealthy = Boolean(
    serverState?.enabled && !['offline', 'error', 'disabled', 'unavailable'].includes(normalizedServerStatus)
  );

  return (
    <div className="space-y-6" id="codex-integrations">
      <div className="flex flex-col gap-4 border-b border-studio-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-display font-bold text-white">
            <Code size={22} className="text-studio-gold" /> Codex MCP Integrations
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-studio-muted">
            Give authorized agents scoped access to live production data without exposing provider or database credentials.
          </p>
        </div>
        {serverState && (
          <div className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs font-semibold ${
            serverHealthy
              ? 'border-emerald-800 bg-emerald-950 text-emerald-300'
              : 'border-red-900 bg-red-950 text-red-300'
          }`}>
            {serverHealthy ? <Wifi size={14} /> : <WifiOff size={14} />}
            {serverState.enabled ? serverState.status : 'Disabled'}
          </div>
        )}
      </div>

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`flex items-start gap-2 rounded border px-4 py-3 text-sm ${
            notice.kind === 'error'
              ? 'border-red-900 bg-red-950/50 text-red-200'
              : notice.kind === 'success'
                ? 'border-emerald-900 bg-emerald-950/50 text-emerald-200'
                : 'border-blue-900 bg-blue-950/50 text-blue-200'
          }`}
        >
          {notice.kind === 'error' ? <AlertTriangle size={17} className="mt-0.5 shrink-0" /> : <CheckCircle size={17} className="mt-0.5 shrink-0" />}
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} className="ml-auto shrink-0" aria-label="Dismiss message">
            <X size={15} />
          </button>
        </div>
      )}

      {initialLoading ? (
        <div className="rounded-lg border border-studio-border bg-studio-card p-10 text-center text-sm text-studio-muted" role="status">
          <RefreshCw size={20} className="mx-auto mb-3 animate-spin" /> Checking the MCP service…
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-3" aria-labelledby="mcp-server-heading">
            <div className="space-y-4 rounded-lg border border-studio-border bg-studio-card p-5 xl:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 id="mcp-server-heading" className="flex items-center gap-2 font-display font-semibold text-white">
                    <Server size={17} className="text-studio-blue" /> MCP server
                  </h3>
                  <p className="mt-1 text-xs text-studio-muted">
                    {serverState?.transport || 'Streamable HTTP'} · Version {serverState?.version || 'unknown'}
                  </p>
                </div>
                {adminAuthenticated && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void loadOverview().catch((error) => setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Refresh failed.' }))}
                      disabled={overviewLoading}
                      className="inline-flex items-center gap-2 rounded border border-studio-border px-3 py-2 text-xs font-semibold text-studio-muted transition hover:border-studio-blue hover:text-white disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={overviewLoading ? 'animate-spin' : ''} /> Refresh
                    </button>
                    <button
                      type="button"
                      onClick={handleConnectionTest}
                      disabled={testingConnection || !serverState?.enabled}
                      className="inline-flex items-center gap-2 rounded bg-studio-blue px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Wifi size={13} /> {testingConnection ? 'Testing…' : 'Test connection'}
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded border border-studio-border bg-studio-dark p-3">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-studio-muted">Public MCP endpoint</span>
                <div className="flex min-w-0 items-center gap-2">
                  <code className="min-w-0 flex-1 break-all text-xs text-white">{serverState?.endpoint || 'Not configured'}</code>
                  {serverState?.endpoint && (
                    <button type="button" onClick={() => copyText(serverState.endpoint, 'MCP endpoint')} className="shrink-0 text-studio-muted hover:text-white" aria-label="Copy MCP endpoint">
                      <Copy size={15} />
                    </button>
                  )}
                </div>
              </div>

              {connectionResult && (
                <div className={`rounded border p-3 text-xs ${connectionResult.ok ? 'border-emerald-900 bg-emerald-950/30 text-emerald-200' : 'border-red-900 bg-red-950/30 text-red-200'}`}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <strong>{connectionResult.ok ? 'Connection healthy' : 'Connection failed'}</strong>
                    {typeof connectionResult.latencyMs === 'number' && <span>{connectionResult.latencyMs} ms</span>}
                    {connectionResult.serverVersion && <span>Server {connectionResult.serverVersion}</span>}
                    {connectionResult.checkedAt && <span>{formatDate(connectionResult.checkedAt)}</span>}
                  </div>
                  {connectionResult.capabilities && connectionResult.capabilities.length > 0 && (
                    <p className="mt-2 text-studio-muted">Capabilities: {connectionResult.capabilities.join(', ')}</p>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-studio-border bg-studio-card p-5">
              <h3 className="flex items-center gap-2 font-display font-semibold text-white">
                <ShieldCheck size={17} className="text-studio-gold" /> Security state
              </h3>
              <dl className="mt-4 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-3"><dt className="text-studio-muted">Agent access</dt><dd className="font-semibold text-white">{serverState?.enabled ? 'Enabled' : 'Disabled'}</dd></div>
                <div className="flex items-center justify-between gap-3"><dt className="text-studio-muted">Admin session</dt><dd className="font-semibold text-white">{adminAuthenticated ? 'Authenticated' : 'Required'}</dd></div>
                <div className="flex items-center justify-between gap-3"><dt className="text-studio-muted">Bearer tokens</dt><dd className="font-semibold text-white">Server-managed</dd></div>
              </dl>
              {adminAuthenticated && (
                <button
                  type="button"
                  onClick={openServerToggle}
                  className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded border px-3 py-2 text-xs font-bold uppercase tracking-wider transition ${
                    serverState?.enabled
                      ? 'border-red-900 bg-red-950/40 text-red-300 hover:bg-red-950'
                      : 'border-emerald-900 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950'
                  }`}
                >
                  <Power size={14} /> {serverState?.enabled ? 'Emergency disable' : 'Enable MCP'}
                </button>
              )}
            </div>
          </section>

          {serverState?.adminAuthRequired && !adminAuthenticated ? (
            <section className="mx-auto max-w-xl rounded-lg border border-studio-border bg-studio-card p-6" aria-labelledby="admin-session-heading">
              <div className="text-center">
                <Lock size={24} className="mx-auto text-studio-gold" />
                <h3 id="admin-session-heading" className="mt-3 font-display text-lg font-semibold text-white">Open a secure admin session</h3>
                <p className="mt-1 text-sm text-studio-muted">Token management and audit activity require the server-side administrator key.</p>
              </div>
              <form onSubmit={handleAdminSession} className="mt-5 space-y-3">
                <div>
                  <label htmlFor="integration-admin-key" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-studio-muted">Administrator key</label>
                  <input
                    id="integration-admin-key"
                    type="password"
                    value={adminKey}
                    onChange={(event) => setAdminKey(event.target.value)}
                    autoComplete="off"
                    autoFocus
                    className="w-full rounded border border-studio-border bg-studio-dark px-3 py-2.5 text-sm text-white outline-none focus:border-studio-gold"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authenticating || !adminKey.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded bg-studio-gold px-4 py-2.5 text-sm font-semibold text-studio-dark transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Key size={15} /> {authenticating ? 'Authenticating…' : 'Authenticate'}
                </button>
              </form>
              <p className="mt-3 text-center text-[10px] leading-relaxed text-studio-muted">The key is sent directly to the server, cleared after this attempt, and never stored in browser storage.</p>
            </section>
          ) : adminAuthenticated ? (
            <>
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="space-y-5 rounded-lg border border-studio-border bg-studio-card p-5 xl:col-span-2">
                  <div>
                    <h3 className="flex items-center gap-2 font-display font-semibold text-white">
                      <Plus size={17} className="text-studio-gold" /> Create scoped token
                    </h3>
                    <p className="mt-1 text-xs text-studio-muted">The full bearer token appears once. Only its cryptographic hash remains on the server.</p>
                  </div>

                  <form onSubmit={handleCreateToken} className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="token-name" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-studio-muted">Token name</label>
                        <input id="token-name" value={tokenForm.name} onChange={(event) => setTokenForm((current) => ({ ...current, name: event.target.value }))} placeholder="Codex workstation" className="w-full rounded border border-studio-border bg-studio-dark px-3 py-2 text-sm text-white outline-none focus:border-studio-gold" />
                      </div>
                      <div>
                        <label htmlFor="token-expiration" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-studio-muted">Expiration (optional)</label>
                        <input id="token-expiration" type="datetime-local" value={tokenForm.expiresAt} onChange={(event) => setTokenForm((current) => ({ ...current, expiresAt: event.target.value }))} className="w-full rounded border border-studio-border bg-studio-dark px-3 py-2 text-sm text-white outline-none focus:border-studio-gold" />
                      </div>
                    </div>

                    <fieldset>
                      <legend className="mb-2 text-[10px] font-bold uppercase tracking-wider text-studio-muted">Project access</legend>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {projects.map((project) => (
                          <label key={project.id} className="flex cursor-pointer items-start gap-3 rounded border border-studio-border bg-studio-dark p-3 text-xs text-white hover:border-studio-blue">
                            <input type="checkbox" checked={tokenForm.projectIds.includes(project.id)} onChange={() => toggleProjectGrant(project.id)} className="mt-0.5 accent-blue-500" />
                            <span><strong className="block">{project.title}</strong><span className="mt-0.5 block font-mono text-[10px] text-studio-muted">{project.id}</span></span>
                          </label>
                        ))}
                      </div>
                      {projects.length === 0 && <p className="rounded border border-studio-border bg-studio-dark p-3 text-xs text-studio-muted">No projects are available to grant.</p>}
                    </fieldset>

                    <fieldset>
                      <legend className="mb-2 text-[10px] font-bold uppercase tracking-wider text-studio-muted">Permission level</legend>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {(['read-only', 'read-write'] as IntegrationPermission[]).map((permission) => (
                          <label key={permission} className={`cursor-pointer rounded border p-3 text-xs ${tokenForm.permission === permission ? 'border-studio-gold bg-yellow-950/20 text-white' : 'border-studio-border bg-studio-dark text-studio-muted'}`}>
                            <input type="radio" name="token-permission" value={permission} checked={tokenForm.permission === permission} onChange={() => setPermission(permission)} className="mr-2 accent-yellow-400" />
                            <strong>{permission === 'read-only' ? 'Read-only' : 'Read-write drafts'}</strong>
                            <span className="mt-1 block text-[10px] leading-relaxed text-studio-muted">{permission === 'read-only' ? 'Cannot create or modify records.' : 'Writes still begin as drafts; locked canon remains protected.'}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    <fieldset>
                      <legend className="mb-2 text-[10px] font-bold uppercase tracking-wider text-studio-muted">Tool scopes</legend>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {READ_SCOPES.map((scope) => (
                          <label key={scope.value} className="flex cursor-pointer items-start gap-3 rounded border border-studio-border bg-studio-dark p-3 text-xs">
                            <input type="checkbox" checked={tokenForm.scopes.includes(scope.value)} onChange={() => toggleScope(scope.value)} className="mt-0.5 accent-blue-500" />
                            <span><strong className="text-white">{scope.label}</strong><span className="mt-0.5 block text-[10px] leading-relaxed text-studio-muted">{scope.description}</span></span>
                          </label>
                        ))}
                        {tokenForm.permission === 'read-write' && WRITE_SCOPES.map((scope) => (
                          <label key={scope.value} className="flex cursor-pointer items-start gap-3 rounded border border-blue-900/60 bg-blue-950/20 p-3 text-xs">
                            <input type="checkbox" checked={tokenForm.scopes.includes(scope.value)} onChange={() => toggleScope(scope.value)} className="mt-0.5 accent-blue-500" />
                            <span><strong className="text-blue-200">{scope.label}</strong><span className="mt-0.5 block text-[10px] leading-relaxed text-studio-muted">{scope.description}</span></span>
                          </label>
                        ))}
                        {tokenForm.permission === 'read-write' && (
                          <label className="flex cursor-pointer items-start gap-3 rounded border border-red-900 bg-red-950/30 p-3 text-xs sm:col-span-2">
                            <input type="checkbox" checked={tokenForm.scopes.includes(ELEVATED_SCOPE.value)} onChange={() => toggleScope(ELEVATED_SCOPE.value)} className="mt-0.5 accent-red-500" />
                            <span><strong className="flex items-center gap-1 text-red-200"><AlertTriangle size={13} /> {ELEVATED_SCOPE.label} · Elevated</strong><span className="mt-0.5 block text-[10px] leading-relaxed text-red-200/70">{ELEVATED_SCOPE.description}</span></span>
                          </label>
                        )}
                      </div>
                    </fieldset>

                    <button type="submit" disabled={creatingToken || projects.length === 0} className="inline-flex w-full items-center justify-center gap-2 rounded bg-studio-gold px-4 py-2.5 text-sm font-semibold text-studio-dark transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50">
                      <Key size={15} /> {creatingToken ? 'Creating secure token…' : 'Create token'}
                    </button>
                  </form>
                </div>

                <div className="rounded-lg border border-studio-border bg-studio-card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 font-display font-semibold text-white"><Terminal size={16} className="text-studio-blue" /> Codex configuration</h3>
                    <button type="button" onClick={() => copyText(safeConfig, 'Codex configuration')} className="text-studio-muted hover:text-white" aria-label="Copy Codex configuration"><Copy size={15} /></button>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-studio-muted">Set the token in your environment, then paste this into Codex configuration. The token itself is never embedded here.</p>
                  <pre className="mt-4 max-w-full overflow-x-auto whitespace-pre rounded border border-studio-border bg-studio-dark p-3 text-[10px] leading-relaxed text-emerald-300"><code>{safeConfig}</code></pre>
                  <div className="mt-4 rounded border border-studio-border bg-studio-dark p-3 text-xs text-studio-muted">
                    <strong className="mb-1 block text-white">Environment variable</strong>
                    <code className="break-all text-studio-gold">ANIME_ORCHESTRATOR_TOKEN</code>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-studio-border bg-studio-card p-5" aria-labelledby="token-list-heading">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 id="token-list-heading" className="flex items-center gap-2 font-display font-semibold text-white"><Key size={16} className="text-studio-gold" /> Integration tokens</h3>
                    <p className="mt-1 text-xs text-studio-muted">Only token metadata is recoverable after creation.</p>
                  </div>
                  <span className="rounded-full bg-studio-dark px-2.5 py-1 text-xs font-mono text-studio-muted">{tokens.length}</span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {tokens.map((token) => {
                    const status = getTokenStatus(token);
                    const grantedProjects = getTokenProjectIds(token);
                    return (
                      <article key={token.id} className="rounded border border-studio-border bg-studio-dark p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="truncate font-semibold text-white">{token.name}</h4>
                            <p className="mt-0.5 font-mono text-[10px] text-studio-muted">{token.tokenPrefix || token.prefix ? `${token.tokenPrefix || token.prefix}…` : token.id}</p>
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${status === 'active' ? 'border-emerald-900 bg-emerald-950 text-emerald-300' : 'border-studio-border bg-studio-card text-studio-muted'}`}>{status}</span>
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]">
                          <div><dt className="text-studio-muted">Permission</dt><dd className="mt-0.5 font-semibold text-white">{token.permission}</dd></div>
                          <div><dt className="text-studio-muted">Expires</dt><dd className="mt-0.5 font-semibold text-white">{formatDate(token.expiresAt)}</dd></div>
                          <div><dt className="text-studio-muted">Created</dt><dd className="mt-0.5 font-semibold text-white">{formatDate(token.createdAt)}</dd></div>
                          <div><dt className="text-studio-muted">Last used</dt><dd className="mt-0.5 font-semibold text-white">{formatDate(token.lastUsedAt)}</dd></div>
                        </dl>
                        <div className="mt-3 space-y-2 border-t border-studio-border pt-3 text-[10px]">
                          <p className="text-studio-muted"><strong className="text-white">Projects:</strong> {grantedProjects.length > 0 ? grantedProjects.join(', ') : 'None'}</p>
                          <p className="break-words text-studio-muted"><strong className="text-white">Scopes:</strong> {(token.scopes || []).join(', ') || 'None'}</p>
                        </div>
                        {status === 'active' && (
                          <button type="button" onClick={() => setRevokeTarget(token)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-red-300 hover:text-red-200">
                            <X size={13} /> Revoke token
                          </button>
                        )}
                      </article>
                    );
                  })}
                  {tokens.length === 0 && <p className="rounded border border-dashed border-studio-border p-8 text-center text-sm text-studio-muted lg:col-span-2">No integration tokens have been created.</p>}
                </div>
              </section>

              <section className="rounded-lg border border-studio-border bg-studio-card p-5" aria-labelledby="activity-heading">
                <div className="flex items-center justify-between gap-3 border-b border-studio-border pb-3">
                  <div>
                    <h3 id="activity-heading" className="flex items-center gap-2 font-display font-semibold text-white"><Activity size={16} className="text-studio-red" /> Recent Codex activity</h3>
                    <p className="mt-1 text-xs text-studio-muted">Redacted tool activity and administrative changes.</p>
                  </div>
                  <button type="button" onClick={handleActivityRefresh} disabled={activityLoading} className="text-studio-muted hover:text-white disabled:opacity-50" aria-label="Refresh recent activity"><RefreshCw size={14} className={activityLoading ? 'animate-spin' : ''} /></button>
                </div>
                <div className="mt-3 divide-y divide-studio-border">
                  {activity.slice(0, 20).map((event) => (
                    <article key={event.id} className="grid grid-cols-1 gap-2 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-white">{event.toolName || event.action || event.operation || 'Integration event'}</strong>
                          {event.result && <span className="rounded bg-studio-dark px-1.5 py-0.5 text-[9px] font-bold uppercase text-studio-muted">{event.result}</span>}
                        </div>
                        <p className="mt-1 break-words text-[11px] text-studio-muted">{event.summary || event.message || 'Redacted activity recorded.'}</p>
                        <p className="mt-1 font-mono text-[9px] text-studio-muted">{[event.projectId, event.tokenName || event.actor || event.tokenId, event.targetType && event.targetId ? `${event.targetType}:${event.targetId}` : null, event.requestId].filter(Boolean).join(' · ')}</p>
                      </div>
                      <time className="text-[10px] text-studio-muted">{formatDate(event.timestamp || event.createdAt || event.occurredAt)}</time>
                    </article>
                  ))}
                  {activity.length === 0 && <p className="py-8 text-center text-sm text-studio-muted">No recent Codex activity.</p>}
                </div>
              </section>
            </>
          ) : null}
        </>
      )}

      {oneTimeToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="token-reveal-heading">
          <div className="w-full max-w-2xl rounded-lg border border-studio-gold/50 bg-studio-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="token-reveal-heading" className="flex items-center gap-2 font-display text-lg font-semibold text-white"><Key size={18} className="text-studio-gold" /> Save this token now</h3>
                <p className="mt-1 text-sm text-studio-muted">This is the only time the full token for “{oneTimeToken.token.name}” will be displayed.</p>
              </div>
            </div>
            <div className="mt-5 rounded border border-studio-border bg-studio-dark p-4">
              <code className="block select-all break-all text-sm leading-relaxed text-emerald-300">{oneTimeToken.plaintext}</code>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setOneTimeToken(null)} className="rounded border border-studio-border px-4 py-2 text-sm font-semibold text-studio-muted hover:text-white">I saved it — close</button>
              <button type="button" onClick={() => copyText(oneTimeToken.plaintext, 'One-time token')} className="inline-flex items-center justify-center gap-2 rounded bg-studio-gold px-4 py-2 text-sm font-semibold text-studio-dark hover:bg-yellow-400"><Copy size={15} /> Copy token</button>
            </div>
          </div>
        </div>
      )}

      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="revoke-token-heading">
          <form onSubmit={handleRevokeToken} className="w-full max-w-lg rounded-lg border border-red-900 bg-studio-card p-6 shadow-2xl">
            <h3 id="revoke-token-heading" className="flex items-center gap-2 font-display text-lg font-semibold text-white"><AlertTriangle size={18} className="text-red-400" /> Revoke “{revokeTarget.name}”?</h3>
            <p className="mt-2 text-sm text-studio-muted">Codex connections using this token will stop working immediately. Revocation cannot be undone.</p>
            <label htmlFor="revoke-reason" className="mb-1.5 mt-5 block text-[10px] font-bold uppercase tracking-wider text-studio-muted">Reason</label>
            <textarea id="revoke-reason" value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} autoFocus className="h-24 w-full rounded border border-studio-border bg-studio-dark p-3 text-sm text-white outline-none focus:border-red-500" />
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setRevokeTarget(null); setRevokeReason(''); }} disabled={revokingToken} className="rounded border border-studio-border px-4 py-2 text-sm font-semibold text-studio-muted hover:text-white">Cancel</button>
              <button type="submit" disabled={revokingToken || !revokeReason.trim()} className="rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50">{revokingToken ? 'Revoking…' : 'Revoke token'}</button>
            </div>
          </form>
        </div>
      )}

      {toggleTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="toggle-mcp-heading">
          <form onSubmit={handleServerToggle} className="w-full max-w-lg rounded-lg border border-red-900 bg-studio-card p-6 shadow-2xl">
            <h3 id="toggle-mcp-heading" className="flex items-center gap-2 font-display text-lg font-semibold text-white"><Power size={18} className={toggleTarget ? 'text-emerald-400' : 'text-red-400'} /> {toggleTarget ? 'Enable MCP access' : 'Emergency disable MCP'}</h3>
            <p className="mt-2 text-sm text-studio-muted">{toggleTarget ? 'Authorized tokens will be able to connect again.' : 'All external MCP requests will be rejected until access is re-enabled.'}</p>
            <label htmlFor="toggle-reason" className="mb-1.5 mt-5 block text-[10px] font-bold uppercase tracking-wider text-studio-muted">Reason</label>
            <textarea id="toggle-reason" value={toggleReason} onChange={(event) => setToggleReason(event.target.value)} autoFocus className="h-20 w-full rounded border border-studio-border bg-studio-dark p-3 text-sm text-white outline-none focus:border-red-500" />
            <label htmlFor="toggle-confirmation" className="mb-1.5 mt-4 block text-[10px] font-bold uppercase tracking-wider text-studio-muted">Type {toggleTarget ? 'ENABLE MCP' : 'DISABLE MCP'} to confirm</label>
            <input id="toggle-confirmation" value={toggleConfirmation} onChange={(event) => setToggleConfirmation(event.target.value)} autoComplete="off" className="w-full rounded border border-studio-border bg-studio-dark px-3 py-2 font-mono text-sm text-white outline-none focus:border-red-500" />
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setToggleTarget(null)} disabled={togglingServer} className="rounded border border-studio-border px-4 py-2 text-sm font-semibold text-studio-muted hover:text-white">Cancel</button>
              <button type="submit" disabled={togglingServer || !toggleReason.trim() || toggleConfirmation !== (toggleTarget ? 'ENABLE MCP' : 'DISABLE MCP')} className={`rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${toggleTarget ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-red-700 hover:bg-red-600'}`}>{togglingServer ? 'Applying…' : toggleTarget ? 'Enable MCP' : 'Disable MCP'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
