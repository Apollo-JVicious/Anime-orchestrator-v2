import React, { useState } from 'react';
import { Character, CharacterReferenceSheet, CostumeAndForm, CanonStatus } from '../types';
import { Lock, Unlock, MessageSquare, Sparkles, Image as ImageIcon, CheckCircle, RefreshCw, AlertTriangle, Eye, ShieldCheck } from 'lucide-react';

interface Props {
  characters: Character[];
  activeCharacter: Character | null;
  onSelectCharacter: (c: Character) => void;
  onSaveCharacter: (c: Character) => void;
  onToggleLock: (id: string) => void;
}

export default function CharacterCreatorTab({
  characters,
  activeCharacter,
  onSelectCharacter,
  onSaveCharacter,
  onToggleLock
}: Props) {
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'wardrobe' | 'interview' | 'sheet' | 'compare'>('profile');
  
  // Interview state
  const [userMsg, setUserMsg] = useState('');
  const [isCasting, setIsCasting] = useState(false);

  // Comparison state
  const [imgA, setImgA] = useState('https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600');
  const [imgB, setImgB] = useState('https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600');
  const [compResult, setCompResult] = useState<any | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  // Form edit states
  const [charForm, setCharForm] = useState<Character | null>(activeCharacter);

  React.useEffect(() => {
    setCharForm(activeCharacter);
    setCompResult(null);
  }, [activeCharacter]);

  if (!activeCharacter || !charForm) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-studio-card border border-studio-border rounded-lg">
        <ImageIcon size={48} className="text-studio-muted mb-4 animate-pulse" />
        <h3 className="text-lg font-display font-semibold text-white">No Character Selected</h3>
        <p className="text-sm text-studio-muted mt-1 max-w-sm">Select or create a character in the Production Cockpit first.</p>
      </div>
    );
  }

  const handleFieldChange = (section: 'appearance' | 'wardrobe' | 'performance', field: string, value: string) => {
    setCharForm(prev => {
      if (!prev) return null;
      return {
        ...prev,
        [section]: {
          ...prev[section as keyof Character] as any,
          [field]: value
        }
      };
    });
  };

  const handleBaseFieldChange = (field: keyof Character, value: any) => {
    setCharForm(prev => {
      if (!prev) return null;
      return { ...prev, [field]: value };
    });
  };

  const handleCommitChanges = () => {
    onSaveCharacter(charForm);
    alert('Character specs committed to canon!');
  };

  const handleInterviewSend = async () => {
    if (!userMsg.trim()) return;
    setIsCasting(true);
    const msg = userMsg;
    setUserMsg('');

    try {
      const response = await fetch(`/api/characters/${activeCharacter.id}/interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: charForm.interviewLog
        })
      });
      if (response.ok) {
        const data = await response.json();
        setCharForm(prev => {
          if (!prev) return null;
          return { ...prev, interviewLog: data.interviewLog };
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCasting(false);
    }
  };

  const runVisualComparison = async () => {
    setIsComparing(true);
    setCompResult(null);
    try {
      const res = await fetch('/api/characters/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageA: imgA, imageB: imgB })
      });
      if (res.ok) {
        const result = await res.json();
        setCompResult(result);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="space-y-6" id="character-creator">
      {/* Header HUD */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-studio-card border border-studio-border p-4 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-studio-card-light border border-studio-border rounded-full flex items-center justify-center text-xl font-display font-bold text-studio-gold">
            {charForm.name[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-display font-bold text-white">{charForm.name}</h2>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                charForm.isLocked ? 'bg-red-950 text-studio-red border border-red-900' : 'bg-studio-card-light text-studio-gold border border-studio-border'
              }`}>
                {charForm.canonStatus}
              </span>
            </div>
            <p className="text-xs text-studio-muted mt-0.5">Species: <strong className="text-white">{charForm.species}</strong> | Affiliation: <strong className="text-white">{charForm.affiliation}</strong></p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onToggleLock(charForm.id)}
            className="flex items-center gap-2 bg-studio-card-light hover:bg-studio-border text-white px-4 py-2 rounded text-xs font-semibold uppercase tracking-wider transition-all border border-studio-border cursor-pointer"
          >
            {charForm.isLocked ? (
              <>
                <Lock size={12} className="text-studio-red" /> Unlock Canon
              </>
            ) : (
              <>
                <Unlock size={12} className="text-studio-gold" /> Lock Canon
              </>
            )}
          </button>
          <button
            onClick={handleCommitChanges}
            className="bg-studio-red hover:bg-studio-red-hover text-white px-4 py-2 rounded text-xs font-semibold uppercase tracking-wider transition-all shadow-md shadow-studio-red/20 cursor-pointer"
          >
            Save Character
          </button>
        </div>
      </div>

      {/* Sub tabs */}
      <div className="flex border-b border-studio-border">
        {[
          { id: 'profile', label: 'Identity & Appearance' },
          { id: 'wardrobe', label: 'Wardrobe & Performance' },
          { id: 'sheet', label: 'Reference Sheets' },
          { id: 'interview', label: 'AI Casting Interview' },
          { id: 'compare', label: 'Visual Consistency check' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeSubTab === tab.id 
                ? 'border-studio-red text-white bg-studio-card-light/40' 
                : 'border-transparent text-studio-muted hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Form */}
      {activeSubTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
          <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4">
            <h3 className="font-display font-semibold text-white border-b border-studio-border pb-2">Core Identity Specs</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">Aliases</label>
                <input
                  type="text"
                  value={charForm.aliases}
                  onChange={(e) => handleBaseFieldChange('aliases', e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded px-3 py-1.5 text-white text-xs focus:outline-none focus:border-studio-red"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">Age</label>
                <input
                  type="text"
                  value={charForm.age}
                  onChange={(e) => handleBaseFieldChange('age', e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded px-3 py-1.5 text-white text-xs focus:outline-none focus:border-studio-red"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">Species</label>
                <input
                  type="text"
                  value={charForm.species}
                  onChange={(e) => handleBaseFieldChange('species', e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded px-3 py-1.5 text-white text-xs focus:outline-none focus:border-studio-red"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">Role</label>
                <input
                  type="text"
                  value={charForm.role}
                  onChange={(e) => handleBaseFieldChange('role', e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded px-3 py-1.5 text-white text-xs focus:outline-none focus:border-studio-red"
                />
              </div>
            </div>
          </div>

          <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4">
            <h3 className="font-display font-semibold text-white border-b border-studio-border pb-2">Physical Appearance Rules</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">Hair Shape & Color</label>
                <input
                  type="text"
                  value={charForm.appearance.hairStyleColor}
                  onChange={(e) => handleFieldChange('appearance', 'hairStyleColor', e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded px-3 py-1.5 text-white text-xs focus:outline-none focus:border-studio-red"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">Eye Shape & Color</label>
                <input
                  type="text"
                  value={charForm.appearance.eyeShapeColor}
                  onChange={(e) => handleFieldChange('appearance', 'eyeShapeColor', e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded px-3 py-1.5 text-white text-xs focus:outline-none focus:border-studio-red"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">Horns Specification</label>
                <input
                  type="text"
                  value={charForm.appearance.horns}
                  onChange={(e) => handleFieldChange('appearance', 'horns', e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded px-3 py-1.5 text-white text-xs focus:outline-none focus:border-studio-red"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">Ears Detail</label>
                <input
                  type="text"
                  value={charForm.appearance.ears}
                  onChange={(e) => handleFieldChange('appearance', 'ears', e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded px-3 py-1.5 text-white text-xs focus:outline-none focus:border-studio-red"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wardrobe & Performance */}
      {activeSubTab === 'wardrobe' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
          <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4">
            <h3 className="font-display font-semibold text-white border-b border-studio-border pb-2">Wardrobe & Armory</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">Default Costume Design</label>
                <textarea
                  value={charForm.wardrobe.defaultCostume}
                  onChange={(e) => handleFieldChange('wardrobe', 'defaultCostume', e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded p-3 text-white text-xs focus:outline-none focus:border-studio-red h-20"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">Weapons & Active Artifacts</label>
                <input
                  type="text"
                  value={charForm.wardrobe.weapons}
                  onChange={(e) => handleFieldChange('wardrobe', 'weapons', e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-studio-red"
                />
              </div>
            </div>
          </div>

          <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4">
            <h3 className="font-display font-semibold text-white border-b border-studio-border pb-2">Dramatic Performance Specs</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">Internal Conflict</label>
                <textarea
                  value={charForm.performance.internalConflict}
                  onChange={(e) => handleFieldChange('performance', 'internalConflict', e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded p-3 text-white text-xs focus:outline-none focus:border-studio-red h-20"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">Combat Choreography Style</label>
                <input
                  type="text"
                  value={charForm.performance.combatStyle}
                  onChange={(e) => handleFieldChange('performance', 'combatStyle', e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-studio-red"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reference Sheets */}
      {activeSubTab === 'sheet' && (
        <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-6 animate-fade-in">
          <div className="flex justify-between items-center border-b border-studio-border pb-3">
            <div>
              <h3 className="font-display font-semibold text-white">Production Reference turnaround Sheet</h3>
              <p className="text-xs text-studio-muted">Official model layouts. Turnaround angles are kept locked for generation consistency.</p>
            </div>
            <button className="flex items-center gap-1.5 text-xs text-studio-gold hover:text-white bg-studio-card-light px-3 py-1.5 border border-studio-border rounded transition-all cursor-pointer">
              <RefreshCw size={12} /> Regenerate Sheet Part
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Front View', img: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300' },
              { label: 'Three-Quarter', img: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300' },
              { label: 'Side View', img: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300' },
              { label: 'Rear View', img: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?w=300' },
              { label: 'Close-Up Portrait', img: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300' }
            ].map((view, idx) => (
              <div key={idx} className="bg-studio-dark border border-studio-border rounded overflow-hidden group">
                <div className="h-40 overflow-hidden relative">
                  <img
                    src={view.img}
                    alt={view.label}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-2 left-2 bg-studio-dark/80 px-2 py-0.5 rounded text-[9px] font-mono font-bold text-studio-gold uppercase">
                    Slot {idx + 1}
                  </div>
                </div>
                <div className="p-2 border-t border-studio-border bg-studio-card-light/40 text-center">
                  <span className="text-xs font-semibold text-white block">{view.label}</span>
                  <span className="text-[10px] text-studio-muted block mt-0.5">Approved turnaround</span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-studio-card-light border border-studio-border p-4 rounded-lg space-y-2">
            <span className="text-xs font-semibold text-white flex items-center gap-1">
              <ShieldCheck size={14} className="text-studio-gold" /> Color Palette Anchors (Approved Hex Codes)
            </span>
            <div className="flex items-center gap-3 pt-1">
              {['#dc2626', '#fbbf24', '#1e293b', '#f8fafc', '#0f172a'].map((hex) => (
                <div key={hex} className="flex items-center gap-1 bg-studio-dark border border-studio-border rounded p-1.5">
                  <div className="w-5 h-5 rounded" style={{ backgroundColor: hex }} />
                  <span className="text-[10px] font-mono font-bold text-white uppercase">{hex}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Interview Chat */}
      {activeSubTab === 'interview' && (
        <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4 animate-fade-in flex flex-col h-[520px]">
          <div className="border-b border-studio-border pb-3">
            <h3 className="font-display font-semibold text-white flex items-center gap-1.5">
              <MessageSquare size={16} className="text-studio-gold" /> Developmental Casting Session
            </h3>
            <p className="text-xs text-studio-muted">Simulate deep in-character dialogue to discover subtexts and voice properties.</p>
          </div>

          {/* Chat box */}
          <div className="flex-1 bg-studio-dark rounded-lg border border-studio-border p-4 overflow-y-auto space-y-3 space-y-reverse flex flex-col">
            <div className="flex-1" />
            {charForm.interviewLog.map((log, idx) => {
              const isUser = log.speaker === 'user';
              return (
                <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded px-4 py-2.5 text-xs ${
                    isUser 
                      ? 'bg-studio-red text-white' 
                      : 'bg-studio-card border border-studio-border text-studio-text'
                  }`}>
                    <span className="block text-[9px] uppercase font-bold tracking-wider mb-1 text-studio-gold">
                      {isUser ? 'Director' : charForm.name}
                    </span>
                    <p className="leading-relaxed">{log.text}</p>
                  </div>
                </div>
              );
            })}
            {isCasting && (
              <div className="flex justify-start">
                <div className="bg-studio-card border border-studio-border rounded px-4 py-2 text-xs text-studio-muted">
                  <span className="animate-pulse flex items-center gap-1.5">
                    <Sparkles size={12} className="text-studio-gold animate-spin" /> Aria is typing dialogue...
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Form input */}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              placeholder="Ask Aria about her background, her sword skills, or how she feels about her horns..."
              value={userMsg}
              onChange={(e) => setUserMsg(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInterviewSend()}
              className="flex-1 bg-studio-dark border border-studio-border rounded px-4 py-3 text-xs text-white focus:outline-none focus:border-studio-red"
            />
            <button
              onClick={handleInterviewSend}
              disabled={isCasting}
              className="bg-studio-gold hover:bg-yellow-500 text-studio-dark font-bold px-6 rounded text-xs uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
            >
              Interview
            </button>
          </div>
        </div>
      )}

      {/* Visual comparison */}
      {activeSubTab === 'compare' && (
        <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-6 animate-fade-in">
          <div className="border-b border-studio-border pb-3">
            <h3 className="font-display font-semibold text-white flex items-center gap-1.5">
              <Eye size={16} className="text-studio-red" /> Side-by-Side visual comparison check
            </h3>
            <p className="text-xs text-studio-muted">Place any generated shot next to the canon reference sheet to verify hair transition, horns shape, and eye colors.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-studio-muted uppercase tracking-wider">Image A (Approved Ref)</label>
                  <input
                    type="text"
                    value={imgA}
                    onChange={(e) => setImgA(e.target.value)}
                    className="w-full bg-studio-dark border border-studio-border rounded px-3 py-1.5 text-xs text-white focus:outline-none"
                  />
                  <div className="h-44 rounded overflow-hidden border border-studio-border bg-studio-dark">
                    <img src={imgA} alt="A" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-studio-muted uppercase tracking-wider">Image B (Generated Shot)</label>
                  <input
                    type="text"
                    value={imgB}
                    onChange={(e) => setImgB(e.target.value)}
                    className="w-full bg-studio-dark border border-studio-border rounded px-3 py-1.5 text-xs text-white focus:outline-none"
                  />
                  <div className="h-44 rounded overflow-hidden border border-studio-border bg-studio-dark">
                    <img src={imgB} alt="B" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                </div>
              </div>

              <button
                onClick={runVisualComparison}
                disabled={isComparing}
                className="w-full bg-studio-red hover:bg-studio-red-hover text-white font-bold py-3 rounded text-xs uppercase tracking-wider transition-all shadow-md shadow-studio-red/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw size={14} className={isComparing ? 'animate-spin' : ''} />
                {isComparing ? 'Running Multi-point comparison...' : 'Inspect Visual Alignment'}
              </button>
            </div>

            {/* Results */}
            <div className="bg-studio-dark rounded-lg border border-studio-border p-5 flex flex-col justify-center">
              {compResult ? (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-studio-border pb-3">
                    <span className="text-sm font-semibold text-white">Continuity Consistency Verdict</span>
                    <div className="flex items-center gap-1">
                      <span className="text-2xl font-mono font-bold text-studio-gold">{compResult.consistencyScore}%</span>
                      <span className="text-xs text-studio-muted">Alignment</span>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                    {compResult.discrepancies.map((d: any, idx: number) => (
                      <div key={idx} className="bg-studio-card border border-studio-border rounded p-3 text-xs flex justify-between gap-3">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-studio-muted">{d.category}</span>
                          <p className="text-white leading-relaxed">{d.details}</p>
                        </div>
                        <div className="flex items-start">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                            d.status === 'Matching' 
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' 
                              : d.status === 'Minor Drift'
                              ? 'bg-yellow-950 text-studio-gold border border-yellow-900'
                              : 'bg-red-950 text-studio-red border border-red-900'
                          }`}>
                            {d.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Eye size={32} className="text-studio-muted mx-auto mb-2" />
                  <p className="text-xs text-studio-muted">Click Inspect above to analyze design drift, scale, hair colors, and apparel matching.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
