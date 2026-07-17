import React, { useState, useEffect, useRef } from 'react';
import { Scene, StoryboardPanel } from '../types';
import { Film, PlayCircle, Plus, Copy, Trash2, ArrowUp, ArrowDown, Sparkles, RefreshCw, CheckCircle, Info } from 'lucide-react';

interface Props {
  activeScene: Scene | null;
  storyboardPanels: StoryboardPanel[];
  onSavePanels: (panels: StoryboardPanel[]) => void;
}

export default function StoryboardTab({ activeScene, storyboardPanels, onSavePanels }: Props) {
  const [panels, setPanels] = useState<StoryboardPanel[]>(storyboardPanels);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAnimaticIdx, setCurrentAnimaticIdx] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  // Playback timers
  const playbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setPanels(storyboardPanels);
  }, [storyboardPanels]);

  if (!activeScene) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-studio-card border border-studio-border rounded-lg">
        <Film size={48} className="text-studio-muted mb-4 animate-pulse" />
        <h3 className="text-lg font-display font-semibold text-white">No Active Scene for Storyboard</h3>
        <p className="text-sm text-studio-muted mt-1 max-w-sm">Please select a scene with approved beats first.</p>
      </div>
    );
  }

  const handleSave = (updated: StoryboardPanel[]) => {
    setPanels(updated);
    onSavePanels(updated);
  };

  const generateStoryboardSequence = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/scenes/${activeScene.id}/storyboard/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        const generated = await response.json();
        handleSave(generated);
      } else {
        alert('Generation failed. Check your Gemini API Key in Settings.');
      }
    } catch (e) {
      console.error(e);
      alert('Error connecting to Gemini.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFieldChange = (idx: number, field: keyof StoryboardPanel, value: any) => {
    const copy = [...panels];
    copy[idx] = { ...copy[idx], [field]: value };
    handleSave(copy);
  };

  const movePanel = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= panels.length) return;

    const copy = [...panels];
    const temp = copy[idx];
    copy[idx] = copy[targetIdx];
    copy[targetIdx] = temp;

    // re-index panel numbers
    const reindexed = copy.map((p, i) => ({ ...p, panelNumber: i + 1 }));
    handleSave(reindexed);
  };

  const duplicatePanel = (idx: number) => {
    const original = panels[idx];
    const duplicated: StoryboardPanel = {
      ...original,
      id: `panel-${activeScene.id}-dup-${Math.random().toString(36).substring(2, 7)}`,
      panelNumber: original.panelNumber + 1,
      isApproved: false
    };

    const copy = [...panels];
    copy.splice(idx + 1, 0, duplicated);

    // re-index panel numbers
    const reindexed = copy.map((p, i) => ({ ...p, panelNumber: i + 1 }));
    handleSave(reindexed);
  };

  const deletePanel = (idx: number) => {
    const copy = panels.filter((_, i) => i !== idx);
    const reindexed = copy.map((p, i) => ({ ...p, panelNumber: i + 1 }));
    handleSave(reindexed);
  };

  // ANIMATIC PLAYBACK LOGIC
  const startAnimatic = () => {
    if (panels.length === 0) return;
    setIsPlaying(true);
    setCurrentAnimaticIdx(0);
    playNextPanel(0);
  };

  const playNextPanel = (index: number) => {
    if (index >= panels.length) {
      setIsPlaying(false);
      return;
    }

    const currentPanel = panels[index];
    const durationMs = (currentPanel.durationSeconds || 3) * 1000;

    // Mock beep synthesis for "temporary audio" requested by user
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, audioCtx.currentTime); // nice slate/beeping sound
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      osc.start();
      setTimeout(() => {
        osc.stop();
        audioCtx.close();
      }, 80);
    } catch (e) {
      console.warn('AudioContext not fully initialized yet in frame.');
    }

    playbackTimeoutRef.current = setTimeout(() => {
      setCurrentAnimaticIdx(index + 1);
      playNextPanel(index + 1);
    }, durationMs);
  };

  const stopAnimatic = () => {
    setIsPlaying(false);
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
    }
  };

  return (
    <div className="space-y-6" id="storyboards-tab">
      <div className="flex justify-between items-center border-b border-studio-border pb-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <Film size={22} className="text-studio-red" /> Scene Storyboard Sequence
          </h2>
          <p className="text-studio-muted text-sm">Convert approved beats into shot parameters, cameras, blocking, and action frames.</p>
        </div>

        <div className="flex gap-2">
          {panels.length > 0 && (
            <button
              onClick={isPlaying ? stopAnimatic : startAnimatic}
              className="flex items-center gap-2 bg-studio-gold text-studio-dark hover:bg-yellow-500 px-4 py-2 rounded font-semibold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
            >
              <PlayCircle size={14} /> {isPlaying ? 'Stop Playback' : 'Play Animatic'}
            </button>
          )}
          <button
            onClick={generateStoryboardSequence}
            disabled={isGenerating}
            className="flex items-center gap-2 bg-studio-red hover:bg-studio-red-hover text-white px-4 py-2 rounded font-medium text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-studio-red/20"
          >
            <Sparkles size={14} className={isGenerating ? 'animate-spin' : ''} />
            {isGenerating ? 'Compiling Sequence...' : 'Generate 12 storyboard Panels'}
          </button>
        </div>
      </div>

      {/* Animatic Player Screen */}
      {isPlaying && panels[currentAnimaticIdx] && (
        <div className="bg-studio-dark border-2 border-studio-gold rounded-lg p-5 flex flex-col items-center justify-center text-center animate-fade-in relative overflow-hidden">
          <div className="absolute top-3 left-3 bg-studio-gold text-studio-dark font-mono font-bold text-[10px] px-2 py-0.5 rounded uppercase tracking-wider">
            Animatic Playback Mode (Active)
          </div>
          <div className="h-[280px] w-full max-w-lg rounded overflow-hidden relative border border-studio-border bg-black mt-2">
            <img
              src={panels[currentAnimaticIdx].generatedImage || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800'}
              alt={`Panel ${panels[currentAnimaticIdx].panelNumber}`}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            {/* Dialogue placeholder on top of video, satisfying user instruction */}
            {panels[currentAnimaticIdx].dialogue && (
              <div className="absolute bottom-4 inset-x-4 bg-black/80 p-2 text-center rounded">
                <p className="text-xs font-sans text-studio-gold leading-relaxed">{panels[currentAnimaticIdx].dialogue}</p>
              </div>
            )}
          </div>
          <div className="mt-4 space-y-1">
            <span className="text-xs text-studio-muted font-mono uppercase tracking-wider">
              Panel {panels[currentAnimaticIdx].panelNumber} / {panels.length} • Shot {panels[currentAnimaticIdx].shotId}
            </span>
            <div className="text-xs font-semibold text-white">
              Duration: <span className="text-studio-gold">{panels[currentAnimaticIdx].durationSeconds}s</span> | Framing: <span className="text-studio-gold">{panels[currentAnimaticIdx].shotSize}</span>
            </div>
            <p className="text-xs text-studio-muted max-w-md italic mt-1 leading-relaxed">
              BGM: {panels[currentAnimaticIdx].musicCue || 'Silent'} | SFX: {panels[currentAnimaticIdx].soundEffects || 'None'}
            </p>
          </div>
        </div>
      )}

      {/* Storyboard list */}
      {panels.length > 0 ? (
        <div className="space-y-4 max-h-[640px] overflow-y-auto pr-1">
          {panels.map((p, idx) => (
            <div key={p.id} className="bg-studio-card border border-studio-border rounded-lg p-5 grid grid-cols-1 lg:grid-cols-4 gap-6 relative group">
              {/* Panel Actions Rail */}
              <div className="absolute top-4 right-4 flex gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                <button onClick={() => movePanel(idx, 'up')} disabled={idx === 0} className="p-1.5 bg-studio-dark border border-studio-border text-studio-muted hover:text-white rounded disabled:opacity-30 cursor-pointer">
                  <ArrowUp size={12} />
                </button>
                <button onClick={() => movePanel(idx, 'down')} disabled={idx === panels.length - 1} className="p-1.5 bg-studio-dark border border-studio-border text-studio-muted hover:text-white rounded disabled:opacity-30 cursor-pointer">
                  <ArrowDown size={12} />
                </button>
                <button onClick={() => duplicatePanel(idx)} className="p-1.5 bg-studio-dark border border-studio-border text-studio-muted hover:text-studio-gold rounded cursor-pointer" title="Duplicate Panel">
                  <Copy size={12} />
                </button>
                <button onClick={() => deletePanel(idx)} className="p-1.5 bg-studio-dark border border-studio-border text-studio-muted hover:text-studio-red rounded cursor-pointer" title="Delete Panel">
                  <Trash2 size={12} />
                </button>
              </div>

              {/* View Part: Thumbnail */}
              <div className="lg:col-span-1 space-y-2">
                <div className="h-40 rounded overflow-hidden relative border border-studio-border bg-studio-dark">
                  <img src={p.generatedImage || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400'} alt={`Panel ${p.panelNumber}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  <div className="absolute top-2 left-2 bg-studio-red text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase">
                    Panel 0{p.panelNumber}
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-studio-muted font-mono uppercase tracking-wider">Shot ID: <strong>{p.shotId}</strong></span>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={p.isApproved}
                      onChange={(e) => handleFieldChange(idx, 'isApproved', e.target.checked)}
                      className="rounded accent-studio-red"
                    />
                    <span className="text-[10px] font-semibold text-studio-muted uppercase">Approved</span>
                  </label>
                </div>
              </div>

              {/* Form parameters */}
              <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1 font-mono">Camera Lens & Size</label>
                    <input
                      type="text"
                      value={p.shotSize}
                      onChange={(e) => handleFieldChange(idx, 'shotSize', e.target.value)}
                      className="w-full bg-studio-dark border border-studio-border rounded px-2.5 py-1 text-xs text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1 font-mono">Camera Movement</label>
                    <input
                      type="text"
                      value={p.cameraMovement}
                      onChange={(e) => handleFieldChange(idx, 'cameraMovement', e.target.value)}
                      className="w-full bg-studio-dark border border-studio-border rounded px-2.5 py-1 text-xs text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1 font-mono">Camera Angle</label>
                    <input
                      type="text"
                      value={p.cameraAngle}
                      onChange={(e) => handleFieldChange(idx, 'cameraAngle', e.target.value)}
                      className="w-full bg-studio-dark border border-studio-border rounded px-2.5 py-1 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1 font-mono">Action Description</label>
                    <textarea
                      value={p.action}
                      onChange={(e) => handleFieldChange(idx, 'action', e.target.value)}
                      className="w-full bg-studio-dark border border-studio-border rounded p-2 text-xs text-white focus:outline-none h-14 resize-none font-sans"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1 font-mono">Character blocking & Pose</label>
                    <input
                      type="text"
                      value={p.characterBlocking}
                      onChange={(e) => handleFieldChange(idx, 'characterBlocking', e.target.value)}
                      className="w-full bg-studio-dark border border-studio-border rounded px-2.5 py-1 text-xs text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1 font-mono">Dialogue Subtitle</label>
                    <input
                      type="text"
                      value={p.dialogue}
                      onChange={(e) => handleFieldChange(idx, 'dialogue', e.target.value)}
                      className="w-full bg-studio-dark border border-studio-border rounded px-2.5 py-1 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1 font-mono">Lighting Spec</label>
                    <input
                      type="text"
                      value={p.lighting}
                      onChange={(e) => handleFieldChange(idx, 'lighting', e.target.value)}
                      className="w-full bg-studio-dark border border-studio-border rounded px-2.5 py-1 text-xs text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1 font-mono">Sound Effects (SFX)</label>
                    <input
                      type="text"
                      value={p.soundEffects}
                      onChange={(e) => handleFieldChange(idx, 'soundEffects', e.target.value)}
                      className="w-full bg-studio-dark border border-studio-border rounded px-2.5 py-1 text-xs text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1 font-mono">Music Cue (BGM)</label>
                    <input
                      type="text"
                      value={p.musicCue}
                      onChange={(e) => handleFieldChange(idx, 'musicCue', e.target.value)}
                      className="w-full bg-studio-dark border border-studio-border rounded px-2.5 py-1 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 border border-studio-border rounded-lg bg-studio-card/40">
          <Info size={36} className="text-studio-muted mx-auto mb-2" />
          <h3 className="font-display font-semibold text-white">No Storyboard Sequence Generated</h3>
          <p className="text-xs text-studio-muted max-w-sm mx-auto mt-1 mb-4 leading-relaxed">
            Click Generate 12 Storyboard Panels to translate this scene’s beats, lighting scripts, and action frames into structured, editable panels.
          </p>
        </div>
      )}
    </div>
  );
}
