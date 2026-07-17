import React, { useState, useEffect } from 'react';
import { Project } from '../types';
import { Code, Terminal, Upload, Download, CheckCircle, Info, RefreshCw } from 'lucide-react';

interface Props {
  activeProject: Project | null;
  onRefreshProject: () => void;
}

export default function CodexTab({ activeProject, onRefreshProject }: Props) {
  const [logs, setLogs] = useState<any[]>([]);
  const [importJson, setImportJson] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/codex/logs');
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const triggerExport = async () => {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/export/${activeProject.id}`);
      if (res.ok) {
        const payload = await res.json();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `anime_orchestrator_${activeProject.id}_canon.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        alert('Complete production specification successfully exported!');
      }
    } catch (e) {
      console.error(e);
      alert('Export failed.');
    }
  };

  const triggerImport = async () => {
    if (!importJson.trim()) return;
    setIsImporting(true);
    try {
      const parsed = JSON.parse(importJson);
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: parsed.data })
      });
      if (res.ok) {
        alert('Production state imported successfully! Reloading...');
        setImportJson('');
        onRefreshProject();
      } else {
        alert('Import rejected. Verify JSON manifest structure.');
      }
    } catch (e) {
      console.error(e);
      alert('Invalid JSON input format.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6" id="codex-integrations">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-studio-border pb-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <Code size={22} className="text-studio-gold" /> Codex REST integration & Specification
          </h2>
          <p className="text-studio-muted text-sm">Synchronize character parameters and storyboards with game engines and secondary animators.</p>
        </div>

        <button
          onClick={triggerExport}
          disabled={!activeProject}
          className="flex items-center gap-2 bg-studio-gold text-studio-dark hover:bg-yellow-500 px-4 py-2 rounded font-semibold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
        >
          <Download size={14} /> Export Canon package
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* OpenAPI Table specifications */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4">
            <h3 className="font-display font-semibold text-white">Production Codex REST API Endpoints</h3>
            <p className="text-xs text-studio-muted">These native endpoints enable external visual render hooks or pipeline synchronizers.</p>

            <div className="space-y-2 max-h-80 overflow-y-auto text-xs pr-1">
              {[
                { method: 'GET', url: '/api/projects', desc: 'Retrieve list of all active story project directories.' },
                { method: 'GET', url: '/api/projects/{projectId}/canon', desc: 'Retrieve full consolidated story bible, character turnarounds, sets, and props.' },
                { method: 'GET', url: '/api/projects/{projectId}/characters', desc: 'Fetch character models turnaround links.' },
                { method: 'GET', url: '/api/projects/{projectId}/scenes', desc: 'Fetch scene metadata, dialogue, and link status.' },
                { method: 'GET', url: '/api/scenes/{sceneId}', desc: 'Retrieve individual scene script blocks.' },
                { method: 'POST', url: '/api/scenes', desc: 'Push a new scene or sequence into production.' },
                { method: 'PATCH', url: '/api/scenes/{sceneId}', desc: 'Update details of a registered scene.' },
                { method: 'POST', url: '/api/generations/image', desc: 'Deploy turnarounds or story cards visual assets.' },
                { method: 'POST', url: '/api/generations/video', desc: 'Queue motion timeline compile tasks via Veo.' },
                { method: 'GET', url: '/api/jobs/{jobId}', desc: 'Poll active compilation progress updates.' },
                { method: 'POST', url: '/api/continuity/review', desc: 'Trigger structured lore validations.' },
                { method: 'POST', url: '/api/import', desc: 'Initialize database settings from JSON package.' },
                { method: 'GET', url: '/api/export/{projectId}', desc: 'Download entire bundle specification.' }
              ].map((endpoint, i) => (
                <div key={i} className="bg-studio-dark border border-studio-border p-3 rounded flex gap-4 items-start font-mono">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                    endpoint.method === 'GET' 
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' 
                      : endpoint.method === 'POST'
                      ? 'bg-blue-950 text-studio-blue border-blue-900'
                      : 'bg-yellow-950 text-studio-gold border border-yellow-900'
                  }`}>
                    {endpoint.method}
                  </span>
                  <div className="space-y-1">
                    <span className="text-white font-semibold font-mono">{endpoint.url}</span>
                    <p className="text-studio-muted font-sans text-[11px] leading-relaxed">{endpoint.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Schema Import Section */}
          <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4">
            <h3 className="font-display font-semibold text-white">Manifest Schema Sync (Import)</h3>
            <p className="text-xs text-studio-muted">Paste your consolidated Anime Orchestrator export JSON below to rebuild sets, characters, and scenes.</p>
            <textarea
              placeholder="Paste complete export package JSON data here..."
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              className="w-full bg-studio-dark border border-studio-border rounded p-3 text-xs text-white focus:outline-none focus:border-studio-gold h-32 font-mono"
            />
            <button
              onClick={triggerImport}
              disabled={isImporting || !importJson.trim()}
              className="w-full bg-studio-card-light hover:bg-studio-border text-studio-gold border border-studio-gold/30 hover:border-studio-gold rounded py-2.5 text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer"
            >
              Sync manifest Structure
            </button>
          </div>
        </div>

        {/* Audit Log right rail */}
        <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4 flex flex-col h-[520px]">
          <div className="flex justify-between items-center border-b border-studio-border pb-2">
            <h3 className="font-display font-semibold text-white flex items-center gap-1.5">
              <Terminal size={16} className="text-studio-red" /> Live Audit trace
            </h3>
            <button onClick={fetchLogs} className="text-studio-muted hover:text-white" title="Refresh Log Feed">
              <RefreshCw size={12} />
            </button>
          </div>
          <p className="text-xs text-studio-muted leading-relaxed">
            Trace critical lore writes, turnaround lock states, and model generation budgets sequentially.
          </p>

          <div className="flex-1 bg-studio-dark rounded border border-studio-border p-3 overflow-y-auto space-y-3 font-mono text-[10px]">
            {logs.length > 0 ? (
              logs.map((log) => (
                <div key={log.id} className="border-b border-studio-border/50 pb-2 space-y-1">
                  <div className="flex justify-between items-center text-studio-muted font-mono">
                    <span className="text-studio-gold font-mono">{log.action}</span>
                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <span className="text-white font-semibold font-mono block">{log.endpoint}</span>
                  <p className="text-studio-muted text-[9px] truncate">Payload: {log.payload}</p>
                </div>
              ))
            ) : (
              <p className="text-studio-muted text-center py-12">No active actions traced yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
