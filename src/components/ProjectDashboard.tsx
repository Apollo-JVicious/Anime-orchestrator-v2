import React, { useState } from 'react';
import { Project } from '../types';
import { Plus, BookOpen, AlertTriangle, Sparkles, Film, ArrowRight, Check } from 'lucide-react';

interface Props {
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (p: Project) => void;
  onCreateProject: (title: string, logline: string) => void;
}

export default function ProjectDashboard({ projects, activeProject, onSelectProject, onCreateProject }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newLogline, setNewLogline] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onCreateProject(newTitle, newLogline);
    setNewTitle('');
    setNewLogline('');
    setShowCreate(false);
  };

  return (
    <div className="space-y-6" id="project-dashboard">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-studio-border pb-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-white flex items-center gap-2">
            <span className="text-studio-red">●</span> Production Cockpit
          </h1>
          <p className="text-studio-muted text-sm mt-1">Manage, orchestrate, and audit your animation continuities.</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 bg-studio-red hover:bg-studio-red-hover text-white px-4 py-2 rounded font-medium text-sm transition-all shadow-md shadow-studio-red/20 cursor-pointer"
        >
          <Plus size={16} /> New Story Project
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleSubmit} className="bg-studio-card border border-studio-border p-5 rounded-lg space-y-4 animate-fade-in">
          <h3 className="text-lg font-display font-semibold text-white">Create New Anime Project</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2">Project Title</label>
              <input
                type="text"
                placeholder="e.g. Neon Genesis Dawn"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full bg-studio-dark border border-studio-border rounded px-3 py-2 text-white focus:outline-none focus:border-studio-red text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2">Short Logline</label>
              <input
                type="text"
                placeholder="e.g. A young pilot discovers a starship bound to her dreams."
                value={newLogline}
                onChange={(e) => setNewLogline(e.target.value)}
                className="w-full bg-studio-dark border border-studio-border rounded px-3 py-2 text-white focus:outline-none focus:border-studio-red text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="text-sm text-studio-muted hover:text-white px-3 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-studio-gold hover:bg-yellow-500 text-studio-dark font-semibold px-4 py-2 rounded text-sm transition-all"
            >
              Initialize Workspace
            </button>
          </div>
        </form>
      )}

      {/* Grid of Projects */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-display font-semibold text-studio-muted flex items-center gap-2">
            Active Project Catalog
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((p) => {
              const isActive = activeProject?.id === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => onSelectProject(p)}
                  className={`relative overflow-hidden rounded-lg border transition-all cursor-pointer group ${
                    isActive 
                      ? 'bg-studio-card border-studio-red shadow-lg shadow-studio-red/10' 
                      : 'bg-studio-card/60 border-studio-border hover:border-studio-muted hover:bg-studio-card'
                  }`}
                >
                  <div className="h-32 overflow-hidden relative">
                    <img
                      src={p.coverArt}
                      alt={p.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-studio-card via-studio-card/40 to-transparent" />
                    {isActive && (
                      <span className="absolute top-3 right-3 bg-studio-red text-white text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1">
                        Active Channel
                      </span>
                    )}
                  </div>
                  <div className="p-4 space-y-2">
                    <h3 className="font-display font-bold text-white group-hover:text-studio-red transition-colors">
                      {p.title}
                    </h3>
                    <p className="text-xs text-studio-muted line-clamp-2 min-h-[32px]">
                      {p.logline || 'No logline configured yet.'}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-studio-muted border-t border-studio-border pt-2 mt-2">
                      <span>Stage: <strong className="text-studio-gold">{p.currentStage}</strong></span>
                      <span>Budget: <strong className="text-white">${p.budgetSpent.toFixed(2)}</strong> / ${p.budgetLimit.toFixed(0)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Project Status HUD */}
        {activeProject && (
          <div className="space-y-6">
            <h2 className="text-lg font-display font-semibold text-studio-muted">Studio HUD</h2>
            <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4 relative">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] text-studio-gold uppercase font-mono tracking-widest">Active Project Specification</span>
                  <h3 className="text-xl font-display font-bold text-white mt-1">{activeProject.title}</h3>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-studio-muted">Current Stage</span>
                  <span className="bg-studio-card-light text-white font-mono border border-studio-border px-2.5 py-0.5 rounded font-medium">
                    {activeProject.currentStage}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-studio-muted">Recent Warnings</span>
                  <span className={`px-2 py-0.5 rounded flex items-center gap-1 font-mono font-bold ${
                    activeProject.recentWarningsCount > 0 ? 'bg-red-950 text-studio-red border border-red-900 animate-pulse' : 'bg-studio-card-light text-studio-muted border border-studio-border'
                  }`}>
                    <AlertTriangle size={12} /> {activeProject.recentWarningsCount} Continuity Gaps
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-studio-muted">
                    <span>Model Token Cost Budget</span>
                    <span>${activeProject.budgetSpent.toFixed(2)} / ${activeProject.budgetLimit.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-studio-dark h-1.5 rounded-full overflow-hidden border border-studio-border">
                    <div 
                      className="bg-studio-red h-full rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min((activeProject.budgetSpent / activeProject.budgetLimit) * 100, 100)}%` }} 
                    />
                  </div>
                </div>
              </div>

              <div className="bg-studio-card-light border border-studio-border p-3 rounded text-xs text-studio-muted space-y-2">
                <span className="font-semibold text-studio-text flex items-center gap-1">
                  <Sparkles size={12} className="text-studio-gold" /> AI Budget Estimate
                </span>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Rough text reasoning: $0.001</li>
                  <li>Fast preview videos: $0.05 per shot</li>
                  <li>Veo High-Quality (720p/1080p): $0.85 per shot</li>
                </ul>
              </div>

              <div className="flex items-center gap-2 text-xs text-studio-gold border-t border-studio-border pt-4">
                <Film size={12} /> Live Render Queue: <span className="text-white">Idle</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Production Pipeline Indicator */}
      {activeProject && (
        <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-display font-semibold text-studio-muted uppercase tracking-wider">Studio Production Pipeline</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 text-center text-xs">
            {[
              { id: 'Bible', label: 'Story Bible', color: 'border-studio-gold text-studio-gold' },
              { id: 'Character', label: 'Characters', color: 'border-studio-blue text-studio-blue' },
              { id: 'Scene', label: 'Scenes', color: 'border-studio-blue text-studio-blue' },
              { id: 'Storyboard', label: 'Storyboards', color: 'border-studio-red text-studio-red' },
              { id: 'Shot', label: 'Shot Builder', color: 'border-studio-red text-studio-red' },
              { id: 'Video', label: 'Video Studio', color: 'border-studio-red text-studio-red' },
              { id: 'Review', label: 'Continuity', color: 'border-studio-red text-studio-red' },
              { id: 'Assembly', label: 'Timeline', color: 'border-studio-gold text-studio-gold' }
            ].map((step, idx) => {
              const isCurrent = activeProject.currentStage === step.id;
              return (
                <div 
                  key={step.id} 
                  className={`p-3 rounded border flex flex-col justify-between items-center transition-all ${
                    isCurrent 
                      ? 'bg-studio-card-light border-studio-red shadow-md shadow-studio-red/10' 
                      : 'bg-studio-dark/50 border-studio-border opacity-60'
                  }`}
                >
                  <span className="text-[10px] font-mono text-studio-muted">Phase 0{idx + 1}</span>
                  <span className={`font-semibold mt-1 block ${isCurrent ? 'text-white' : 'text-studio-muted'}`}>
                    {step.label}
                  </span>
                  <div className="mt-2">
                    {isCurrent ? (
                      <span className="inline-block w-2 h-2 rounded-full bg-studio-red animate-pulse" />
                    ) : idx < 3 ? (
                      <Check size={10} className="text-studio-gold inline" />
                    ) : (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-studio-border" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
