import React, { useState, useEffect } from 'react';
import { ShotBuilder } from '../types';
import { Sparkles, Save, Film } from 'lucide-react';

interface Props {
  shots: ShotBuilder[];
  onSaveShot: (shot: ShotBuilder) => void;
}

export default function ShotBuilderTab({ shots, onSaveShot }: Props) {
  const [activeShot, setActiveShot] = useState<ShotBuilder | null>(shots[0] || null);

  const [name, setName] = useState('');
  const [cameraPosition, setCameraPosition] = useState('');
  const [cameraMovement, setCameraMovement] = useState('');
  const [subjectMovement, setSubjectMovement] = useState('');
  const [environmentalMovement, setEnvironmentalMovement] = useState('');
  const [lighting, setLighting] = useState('');
  const [composition, setComposition] = useState('');
  const [dialogue, setDialogue] = useState('');
  const [negativeConstraints, setNegativeConstraints] = useState('');
  const [finalPrompt, setFinalPrompt] = useState('');

  useEffect(() => {
    if (shots.length > 0 && !activeShot) {
      setActiveShot(shots[0]);
    }
  }, [shots]);

  useEffect(() => {
    if (activeShot) {
      setName(activeShot.name);
      setCameraPosition(activeShot.cameraPosition || 'Eye-level, front-on');
      setCameraMovement(activeShot.cameraMovement || 'Slow pan right');
      setSubjectMovement(activeShot.subjectMovement || 'Standing stoically');
      setEnvironmentalMovement(activeShot.environmentalMovement || 'Wind blowing dust particles');
      setLighting(activeShot.lighting || 'Golden hour warm sunlight');
      setComposition(activeShot.composition || 'Rule of thirds, medium shot');
      setDialogue(activeShot.dialogue || '');
      setNegativeConstraints(activeShot.negativeConstraints || 'no flat shading, low resolution, bad anatomy');
      setFinalPrompt(activeShot.finalPrompt || '');
    }
  }, [activeShot]);

  // Real-time Prompt Compiler
  useEffect(() => {
    if (!activeShot) return;

    const compositionLine = composition ? `Framing: ${composition}.` : '';
    const cameraLine = `Camera: ${cameraPosition} with ${cameraMovement}.`;
    const motionLine = `Subject: ${subjectMovement}, Environment: ${environmentalMovement}.`;
    const lightLine = `Atmospheric lighting: ${lighting}.`;
    const dialogueLine = dialogue ? `Dialogue Subtitle: "${dialogue}".` : '';

    const compiled = `[Cinematic Anime Scene - "${name}"]
${compositionLine}
${cameraLine}
${motionLine}
${lightLine}
${dialogueLine}
Style: Cel-shaded 2D keyframe, clean ink-lines, rich ambient occlusion shadow density, masterpiece.`;

    setFinalPrompt(compiled);
  }, [name, cameraPosition, cameraMovement, subjectMovement, environmentalMovement, lighting, composition, dialogue, activeShot]);

  if (!activeShot) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-studio-card border border-studio-border rounded-lg">
        <Film size={48} className="text-studio-muted mb-4 animate-pulse" />
        <h3 className="text-lg font-display font-semibold text-white">No Shot Records Loaded</h3>
        <p className="text-sm text-studio-muted mt-1 max-w-sm font-sans">Wait for database hydration or select a valid workspace project.</p>
      </div>
    );
  }

  const handleSave = () => {
    const updated: ShotBuilder = {
      ...activeShot,
      name,
      cameraPosition,
      cameraMovement,
      subjectMovement,
      environmentalMovement,
      lighting,
      composition,
      dialogue,
      negativeConstraints,
      finalPrompt
    };
    onSaveShot(updated);
    alert('Cinematography specifications committed and prompt compiled successfully!');
  };

  return (
    <div className="space-y-6" id="shot-builder">
      <div className="flex justify-between items-center border-b border-studio-border pb-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <Film size={22} className="text-studio-gold" /> Prompt Compiler & Shot Builder
          </h2>
          <p className="text-studio-muted text-sm">Design fine-tuned camera positions, environmental physics, and lighting directives.</p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-studio-gold text-studio-dark hover:bg-yellow-500 px-4 py-2 rounded font-semibold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
        >
          <Save size={14} /> Save Shot Specs
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Shot Select & Camera Matrices */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex gap-2 overflow-x-auto pb-2 border-b border-studio-border/30">
            {shots.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveShot(s)}
                className={`px-3 py-1.5 rounded text-xs font-mono transition-all border shrink-0 ${
                  s.id === activeShot.id 
                    ? 'bg-studio-gold/15 border-studio-gold text-white' 
                    : 'bg-studio-card border-studio-border text-studio-muted hover:text-white'
                }`}
              >
                Shot: {s.name}
              </button>
            ))}
          </div>

          <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-5">
            <h3 className="font-display font-semibold text-white border-b border-studio-border pb-2 flex items-center gap-1.5">
              Cinematic Camera & Composition Matrix
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1.5 font-mono">Composition / Framing</label>
                <input
                  type="text"
                  value={composition}
                  onChange={(e) => setComposition(e.target.value)}
                  placeholder="e.g. Extreme wide shot, rule of thirds, character in bottom-right"
                  className="w-full bg-studio-dark border border-studio-border rounded p-2.5 text-xs text-white focus:outline-none focus:border-studio-gold"
                />
              </div>

              <div>
                <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1.5 font-mono">Camera Position</label>
                <input
                  type="text"
                  value={cameraPosition}
                  onChange={(e) => setCameraPosition(e.target.value)}
                  placeholder="e.g. Low angle looking up, high-key backlight"
                  className="w-full bg-studio-dark border border-studio-border rounded p-2.5 text-xs text-white focus:outline-none focus:border-studio-gold"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1.5 font-mono">Camera Movement Speed & Arc</label>
                <input
                  type="text"
                  value={cameraMovement}
                  onChange={(e) => setCameraMovement(e.target.value)}
                  placeholder="e.g. Slow Dolly tracking left-to-right, orbital pan around subject"
                  className="w-full bg-studio-dark border border-studio-border rounded p-2.5 text-xs text-white focus:outline-none focus:border-studio-gold"
                />
              </div>
            </div>
          </div>

          <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-5">
            <h3 className="font-display font-semibold text-white border-b border-studio-border pb-2 flex items-center gap-1.5">
              Subject & Environmental Physics
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1.5 font-mono">Subject Movement Blocking</label>
                <input
                  type="text"
                  value={subjectMovement}
                  onChange={(e) => setSubjectMovement(e.target.value)}
                  placeholder="e.g. Aria drawing her glowing sun-shield slowly"
                  className="w-full bg-studio-dark border border-studio-border rounded p-2.5 text-xs text-white focus:outline-none focus:border-studio-gold"
                />
              </div>

              <div>
                <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1.5 font-mono">Environmental FX & Physics</label>
                <input
                  type="text"
                  value={environmentalMovement}
                  onChange={(e) => setEnvironmentalMovement(e.target.value)}
                  placeholder="e.g. embers swirling, dust particles floating in light-beams"
                  className="w-full bg-studio-dark border border-studio-border rounded p-2.5 text-xs text-white focus:outline-none focus:border-studio-gold"
                />
              </div>

              <div>
                <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1.5 font-mono">Volumetric Lighting Specs</label>
                <input
                  type="text"
                  value={lighting}
                  onChange={(e) => setLighting(e.target.value)}
                  placeholder="e.g. Golden hour sunset contrast, volumetric shafts through fog"
                  className="w-full bg-studio-dark border border-studio-border rounded p-2.5 text-xs text-white focus:outline-none focus:border-studio-gold"
                />
              </div>

              <div>
                <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1.5 font-mono">Dialogue Anchor</label>
                <input
                  type="text"
                  value={dialogue}
                  onChange={(e) => setDialogue(e.target.value)}
                  placeholder="Dialogue subtitles overlay..."
                  className="w-full bg-studio-dark border border-studio-border rounded p-2.5 text-xs text-white focus:outline-none focus:border-studio-gold"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Compiled Output */}
        <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4">
          <h3 className="font-display font-semibold text-white flex items-center gap-1.5">
            <Sparkles size={16} className="text-studio-gold" /> Real-time compiled Prompt
          </h3>
          <p className="text-xs text-studio-muted leading-relaxed">
            Compiled according to standard cel-shaded turnaround rules. Direct output feed:
          </p>

          <div className="space-y-4 pt-2">
            <div>
              <span className="text-[10px] uppercase font-bold text-studio-gold font-mono block mb-1">Target Prompt</span>
              <div className="bg-studio-dark p-3.5 rounded border border-studio-border text-xs text-studio-text leading-relaxed font-mono whitespace-pre-wrap select-all relative group">
                {finalPrompt}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(finalPrompt);
                    alert('Copied compiled prompt to clipboard!');
                  }}
                  className="absolute top-2 right-2 bg-studio-card-light hover:bg-studio-border border border-studio-border text-white text-[9px] font-mono px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  Copy
                </button>
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-studio-red font-mono block mb-1">Negative Constraints (Rules)</span>
              <textarea
                value={negativeConstraints}
                onChange={(e) => setNegativeConstraints(e.target.value)}
                className="w-full bg-studio-dark border border-studio-border rounded p-3 text-xs text-studio-muted font-mono focus:outline-none h-24"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
