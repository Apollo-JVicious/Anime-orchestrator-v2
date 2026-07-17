import React, { useState } from 'react';
import { ContinuityCheckResult, Scene } from '../types';
import { ShieldCheck, AlertTriangle, CheckCircle2, Clock, RefreshCw } from 'lucide-react';

interface Props {
  scenes: Scene[];
  continuityResults: ContinuityCheckResult[];
  onTriggerCheck: (sceneId: string) => void;
}

export default function ContinuityReviewTab({ scenes, continuityResults, onTriggerCheck }: Props) {
  const [selectedSceneId, setSelectedSceneId] = useState(scenes[0]?.id || '');
  const [isReviewing, setIsReviewing] = useState(false);

  const activeResult = continuityResults.find(r => r.targetId === selectedSceneId);

  const handleReview = async () => {
    if (!selectedSceneId) return;
    setIsReviewing(true);
    await onTriggerCheck(selectedSceneId);
    setIsReviewing(false);
  };

  return (
    <div className="space-y-6" id="continuity-review">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-studio-border pb-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <ShieldCheck size={22} className="text-studio-red" /> Continuity & Lore Review
          </h2>
          <p className="text-studio-muted text-sm">Validate scenes and storyboard layouts against approved Story Bible constraints.</p>
        </div>

        <div className="flex gap-2 items-center w-full md:w-auto">
          <select
            value={selectedSceneId}
            onChange={(e) => setSelectedSceneId(e.target.value)}
            className="bg-studio-dark border border-studio-border text-xs rounded px-3 py-2 text-white focus:outline-none"
          >
            {scenes.map(s => <option key={s.id} value={s.id}>Scene {s.episodeNumber}.{s.sceneNumber}: {s.title}</option>)}
          </select>
          <button
            onClick={handleReview}
            disabled={isReviewing}
            className="flex items-center gap-1.5 bg-studio-red hover:bg-studio-red-hover text-white px-4 py-2 rounded text-xs font-semibold uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shrink-0"
          >
            <RefreshCw size={12} className={isReviewing ? 'animate-spin' : ''} />
            {isReviewing ? 'Auditing Lore...' : 'Review Scene'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: General Stats */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4">
            <h3 className="font-display font-semibold text-white">Continuity Alert Cockpit</h3>
            <p className="text-xs text-studio-muted">Central audit telemetry mapping design drift and magic law deviations.</p>

            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-studio-dark p-3 rounded border border-studio-border">
                <span className="text-2xl font-mono font-bold text-studio-red">
                  {activeResult?.findings.filter(f => f.severity === 'Critical contradiction' || f.severity === 'Likely inconsistency').length || 0}
                </span>
                <span className="block text-[9px] text-studio-muted uppercase mt-1 font-semibold">Severe contradictions</span>
              </div>
              <div className="bg-studio-dark p-3 rounded border border-studio-border">
                <span className="text-2xl font-mono font-bold text-studio-gold">
                  {activeResult?.findings.filter(f => f.severity === 'Creative choice' || f.severity === 'Minor visual drift').length || 0}
                </span>
                <span className="block text-[9px] text-studio-muted uppercase mt-1 font-semibold">Drifts & Choices</span>
              </div>
            </div>

            <div className="border-t border-studio-border/50 pt-3 space-y-2 text-xs">
              <div className="flex justify-between items-center text-studio-muted">
                <span>Total Checked Scenes</span>
                <span className="text-white font-mono font-semibold">{continuityResults.length}</span>
              </div>
              <div className="flex justify-between items-center text-studio-muted">
                <span>Last Audit Timestamp</span>
                <span className="text-white font-mono text-[10px]">{activeResult ? new Date(activeResult.checkedAt).toLocaleTimeString() : 'Never'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Itemized Findings List */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-display font-semibold text-studio-muted">Active Lore Audit Log</h3>

          {activeResult && activeResult.findings.length > 0 ? (
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {activeResult.findings.map((finding) => {
                const isSevere = finding.severity === 'Critical contradiction' || finding.severity === 'Likely inconsistency';
                return (
                  <div key={finding.id} className="bg-studio-card border border-studio-border rounded-lg p-4 flex justify-between gap-4 relative overflow-hidden">
                    {/* Color strip accent on left representing severity */}
                    <div className={`absolute top-0 bottom-0 left-0 w-1 ${
                      isSevere ? 'bg-studio-red' : 'bg-studio-gold'
                    }`} />

                    <div className="space-y-1.5 pl-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${
                          isSevere 
                            ? 'bg-red-950 text-studio-red border-red-900' 
                            : 'bg-yellow-950 text-studio-gold border-yellow-900'
                        }`}>
                          {finding.severity}
                        </span>
                        <span className="text-[10px] text-studio-muted font-mono uppercase tracking-wider">
                          Type: {finding.type}
                        </span>
                      </div>

                      <p className="text-xs text-white leading-relaxed font-semibold">{finding.message}</p>
                    </div>

                    <div className="flex items-start shrink-0">
                      <button className="bg-studio-card-light hover:bg-studio-border text-white px-3 py-1.5 border border-studio-border rounded text-[10px] font-semibold uppercase tracking-wider transition-all cursor-pointer">
                        Resolve Fix
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 bg-studio-card/40 border border-studio-border rounded-lg">
              <CheckCircle2 size={36} className="text-emerald-500 mx-auto mb-2" />
              <h3 className="font-display font-semibold text-white">Continuous alignment complete</h3>
              <p className="text-xs text-studio-muted max-w-xs mx-auto mt-1">Select a scene from the dropdown and hit Review Scene to inspect design consistency across the Story Bible.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
