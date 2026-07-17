import React, { useState } from 'react';
import { Scene, Location, Character, Prop } from '../types';
import { Sparkles, Save, Eye, Clipboard, Book, List, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';

interface Props {
  scenes: Scene[];
  locations: Location[];
  characters: Character[];
  propsList: Prop[];
  activeScene: Scene | null;
  onSelectScene: (s: Scene) => void;
  onSaveScene: (s: Scene) => void;
}

export default function SceneWorkspaceTab({
  scenes,
  locations,
  characters,
  propsList,
  activeScene,
  onSelectScene,
  onSaveScene
}: Props) {
  const [viewMode, setViewMode] = useState<'screenplay' | 'prose' | 'beats' | 'shots'>('screenplay');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sceneForm, setSceneForm] = useState<Scene | null>(activeScene);

  React.useEffect(() => {
    setSceneForm(activeScene);
  }, [activeScene]);

  if (!activeScene || !sceneForm) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-studio-card border border-studio-border rounded-lg">
        <Sparkles size={48} className="text-studio-gold mb-4 animate-pulse" />
        <h3 className="text-lg font-display font-semibold text-white">No Scene Selected</h3>
        <p className="text-sm text-studio-muted mt-1 max-w-sm">Please select a scene in the pipeline or initialize one to begin writing.</p>
      </div>
    );
  }

  const handleFieldChange = (field: keyof Scene, value: any) => {
    setSceneForm(prev => {
      if (!prev) return null;
      return { ...prev, [field]: value };
    });
  };

  const handleSave = () => {
    if (sceneForm) {
      onSaveScene(sceneForm);
      alert('Scene draft saved successfully!');
    }
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const response = await fetch(`/api/scenes/${sceneForm.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        const feedback = await response.json();
        setSceneForm(prev => {
          if (!prev) return null;
          return { ...prev, analysisResult: feedback };
        });
      } else {
        alert('Analysis failed. Check your Gemini API Key in Settings.');
      }
    } catch (e) {
      console.error(e);
      alert('Network error analyzing scene.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applySuggestedBeats = () => {
    if (sceneForm && sceneForm.analysisResult) {
      setSceneForm(prev => {
        if (!prev || !prev.analysisResult) return null;
        return {
          ...prev,
          approvedBeats: prev.analysisResult.suggestedBeats
        };
      });
      alert('Suggested beats copied to approved timeline!');
    }
  };

  return (
    <div className="space-y-6" id="scene-workspace">
      {/* HUD Header */}
      <div className="flex justify-between items-center border-b border-studio-border pb-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            Ep {sceneForm.episodeNumber} • Scene {sceneForm.sceneNumber}: {sceneForm.title}
          </h2>
          <p className="text-studio-muted text-sm">Develop narrative beats, screenplay scripts, and emotional pacing hooks.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="flex items-center gap-2 bg-studio-card-light hover:bg-studio-border text-studio-gold border border-studio-gold/30 hover:border-studio-gold px-4 py-2 rounded text-xs font-semibold uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
          >
            <Sparkles size={14} className={isAnalyzing ? 'animate-spin' : ''} />
            {isAnalyzing ? 'Analyzing Scene...' : 'AI Scene Analysis'}
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-studio-red hover:bg-studio-red-hover text-white px-4 py-2 rounded font-medium text-xs uppercase tracking-wider transition-all cursor-pointer"
          >
            <Save size={14} /> Save Scene
          </button>
        </div>
      </div>

      {/* Selector of scenes list */}
      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-studio-border/40">
        {scenes.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelectScene(s)}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-all border shrink-0 ${
              s.id === sceneForm.id 
                ? 'bg-studio-red/15 border-studio-red text-white' 
                : 'bg-studio-card border-studio-border text-studio-muted hover:text-white'
            }`}
          >
            Scene {s.episodeNumber}.{s.sceneNumber}
          </button>
        ))}
      </div>

      {/* Grid: Editor vs Analyzer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Sub Views */}
          <div className="flex gap-2 bg-studio-card p-1 rounded border border-studio-border w-fit">
            {[
              { id: 'screenplay', label: 'Screenplay View', icon: <Book size={12} /> },
              { id: 'prose', label: 'Prose Draft', icon: <Clipboard size={12} /> },
              { id: 'beats', label: 'Beats Timeline', icon: <List size={12} /> },
              { id: 'shots', label: 'Asset linkages', icon: <Eye size={12} /> }
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => setViewMode(v.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === v.id 
                    ? 'bg-studio-card-light text-white border border-studio-border' 
                    : 'text-studio-muted hover:text-white border border-transparent'
                }`}
              >
                {v.icon} {v.label}
              </button>
            ))}
          </div>

          {/* Screenplay mode */}
          {viewMode === 'screenplay' && (
            <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4 animate-fade-in font-mono text-sm max-h-[500px] overflow-y-auto">
              <div className="text-center text-studio-muted text-xs uppercase tracking-widest border-b border-studio-border pb-2 mb-4">
                Screenplay view format
              </div>
              <div>
                <span className="text-studio-gold uppercase font-bold">EXT. {locations.find(l => l.id === sceneForm.locationId)?.name || 'Citadel'} - {sceneForm.timeOfDay.toUpperCase()}</span>
                <p className="text-studio-muted text-xs mt-1">The weather is {sceneForm.weather}.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1 font-sans">Action Description</label>
                  <textarea
                    value={sceneForm.action}
                    onChange={(e) => handleFieldChange('action', e.target.value)}
                    className="w-full bg-studio-dark border border-studio-border rounded p-3 text-white text-xs focus:outline-none focus:border-studio-red font-mono h-32"
                    placeholder="Describe direct action, physics, and movements..."
                  />
                </div>

                <div className="max-w-md mx-auto text-center space-y-2">
                  <span className="text-white font-bold block">ARIA</span>
                  <textarea
                    value={sceneForm.dialogue}
                    onChange={(e) => handleFieldChange('dialogue', e.target.value)}
                    className="w-full bg-studio-dark border border-studio-border rounded p-3 text-white text-xs text-center focus:outline-none focus:border-studio-red font-mono h-24"
                    placeholder="Enter character dialogue blocks..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Prose Draft */}
          {viewMode === 'prose' && (
            <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-3 animate-fade-in">
              <h3 className="font-display font-semibold text-white">Prose draft mode</h3>
              <p className="text-xs text-studio-muted">Write fluid narrative passages for light novels or script drafts.</p>
              <textarea
                value={sceneForm.action + '\n\n' + sceneForm.dialogue}
                onChange={(e) => {
                  const val = e.target.value;
                  // basic split
                  handleFieldChange('action', val);
                }}
                className="w-full bg-studio-dark border border-studio-border rounded p-4 text-xs text-white focus:outline-none focus:border-studio-red h-[360px] font-sans"
                placeholder="Once the morning fire settled..."
              />
            </div>
          )}

          {/* Beats Timeline */}
          {viewMode === 'beats' && (
            <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4 animate-fade-in">
              <div className="flex justify-between items-center">
                <h3 className="font-display font-semibold text-white">Approved Storyboard Beats</h3>
                <span className="text-xs text-studio-muted">{sceneForm.approvedBeats.length} beats tracked</span>
              </div>
              <p className="text-xs text-studio-muted">These discrete visual steps represent the keyframes to populate storyboard panels.</p>
              
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {sceneForm.approvedBeats.map((beat, idx) => (
                  <div key={idx} className="bg-studio-dark border border-studio-border rounded p-3 text-xs flex gap-3 items-center">
                    <span className="text-studio-red font-mono font-bold">Beat 0{idx + 1}</span>
                    <input
                      type="text"
                      value={beat}
                      onChange={(e) => {
                        const copy = [...sceneForm.approvedBeats];
                        copy[idx] = e.target.value;
                        handleFieldChange('approvedBeats', copy);
                      }}
                      className="flex-1 bg-transparent border-none text-white focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Asset Linkages */}
          {viewMode === 'shots' && (
            <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4 animate-fade-in">
              <h3 className="font-display font-semibold text-white">Canon asset links</h3>
              <p className="text-xs text-studio-muted">Synchronize character profile turnarounds, props, and location sets active in this scene.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="bg-studio-dark p-3 rounded border border-studio-border">
                  <span className="block text-[10px] text-studio-muted uppercase tracking-wider mb-2 font-mono">Location Set</span>
                  <select
                    value={sceneForm.locationId}
                    onChange={(e) => handleFieldChange('locationId', e.target.value)}
                    className="w-full bg-studio-card border border-studio-border text-white text-xs p-1.5 rounded focus:outline-none"
                  >
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>

                <div className="bg-studio-dark p-3 rounded border border-studio-border">
                  <span className="block text-[10px] text-studio-muted uppercase tracking-wider mb-2 font-mono font-bold">Characters Present</span>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {characters.map(c => {
                      const isChecked = sceneForm.charactersPresentIds.includes(c.id);
                      return (
                        <label key={c.id} className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const list = isChecked 
                                ? sceneForm.charactersPresentIds.filter(id => id !== c.id)
                                : [...sceneForm.charactersPresentIds, c.id];
                              handleFieldChange('charactersPresentIds', list);
                            }}
                            className="rounded accent-studio-red"
                          />
                          <span>{c.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-studio-dark p-3 rounded border border-studio-border">
                  <span className="block text-[10px] text-studio-muted uppercase tracking-wider mb-2 font-mono font-bold">Props Linked</span>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {propsList.map(pr => {
                      const isChecked = sceneForm.propsIds.includes(pr.id);
                      return (
                        <label key={pr.id} className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const list = isChecked
                                ? sceneForm.propsIds.filter(id => id !== pr.id)
                                : [...sceneForm.propsIds, pr.id];
                              handleFieldChange('propsIds', list);
                            }}
                            className="rounded accent-studio-blue"
                          />
                          <span>{pr.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* AI Editor Panel */}
        <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4">
          <h3 className="font-display font-semibold text-white flex items-center gap-1.5">
            <Sparkles size={16} className="text-studio-gold" /> AI Storyboard Editor HUD
          </h3>
          <p className="text-xs text-studio-muted leading-relaxed">
            Run a critical analysis on your draft. Gemini checks subtext alignments, continuity, pacing, and outputs structured visual beats.
          </p>

          {sceneForm.analysisResult ? (
            <div className="space-y-4 animate-fade-in text-xs max-h-[460px] overflow-y-auto pr-1">
              <div className="bg-studio-dark p-3 rounded border border-studio-border space-y-1">
                <span className="text-[10px] uppercase font-bold text-studio-gold font-mono">Literal Action</span>
                <p className="text-white leading-relaxed">{sceneForm.analysisResult.literalWhatHappens}</p>
              </div>

              <div className="bg-studio-dark p-3 rounded border border-studio-border space-y-1">
                <span className="text-[10px] uppercase font-bold text-studio-gold font-mono">Subtext Analysis</span>
                <p className="text-white leading-relaxed">{sceneForm.analysisResult.subtext}</p>
              </div>

              <div className="bg-studio-dark p-3 rounded border border-studio-border space-y-1">
                <span className="text-[10px] uppercase font-bold text-studio-gold font-mono">Exposition Risks</span>
                <p className="text-white leading-relaxed">{sceneForm.analysisResult.expositionRisks}</p>
              </div>

              <div className="bg-studio-dark p-3 rounded border border-studio-border/60 space-y-2">
                <span className="text-[10px] uppercase font-bold text-studio-gold font-mono block border-b border-studio-border pb-1">AI Suggested Beats</span>
                <ol className="list-decimal list-inside space-y-1.5 text-studio-text leading-relaxed">
                  {sceneForm.analysisResult.suggestedBeats.map((b: string, i: number) => (
                    <li key={i}>{b}</li>
                  ))}
                </ol>
                <button
                  onClick={applySuggestedBeats}
                  className="w-full mt-2 bg-studio-card-light hover:bg-studio-border text-white border border-studio-border rounded py-2 font-semibold uppercase tracking-wider transition-all text-[10px] cursor-pointer"
                >
                  Confirm & Sync Beats List
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-studio-border rounded-lg bg-studio-dark/40">
              <AlertTriangle size={32} className="text-studio-muted mx-auto mb-2" />
              <p className="text-xs text-studio-muted leading-relaxed max-w-[200px] mx-auto">No current critique loaded. Click AI Scene Analysis above to start auditing set assets.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
