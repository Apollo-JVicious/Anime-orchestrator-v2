import React, { useState } from 'react';
import { Project } from '../types';
import { Settings, Save, AlertTriangle, Key } from 'lucide-react';

interface Props {
  activeProject: Project | null;
  onUpdateBudget: (limit: number) => void;
}

export default function SettingsTab({ activeProject, onUpdateBudget }: Props) {
  const [geminiKey, setGeminiKey] = useState('●●●●●●●●●●●●●●●●●●●●');
  const [budgetLimit, setBudgetLimit] = useState(activeProject ? activeProject.budgetLimit : 50.00);

  // Model abstraction setup
  const [textModel, setTextModel] = useState('gemini-2.5-flash');
  const [imageModel, setImageModel] = useState('imagen-3.0-generate-002');
  const [videoModel, setVideoModel] = useState('veo-3.1-generate-preview');

  const handleSave = () => {
    onUpdateBudget(budgetLimit);
    alert('Studio system configurations updated!');
  };

  return (
    <div className="space-y-6" id="settings-tab">
      <div className="flex justify-between items-center border-b border-studio-border pb-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <Settings size={22} className="text-studio-muted" /> Studio Configuration & Adapters
          </h2>
          <p className="text-studio-muted text-sm">Fine-tune model adapters, secret credential hooks, and production cost thresholds.</p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-studio-red hover:bg-studio-red-hover text-white px-4 py-2 rounded font-medium text-sm transition-all cursor-pointer shadow-md"
        >
          <Save size={16} /> Save Configurations
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
        {/* Credentials & limits */}
        <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4">
          <h3 className="font-display font-semibold text-white border-b border-studio-border pb-2 flex items-center gap-1.5">
            <Key size={16} className="text-studio-gold" /> Secrets & Financial Limits
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-2">Gemini API Key</label>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="w-full bg-studio-dark border border-studio-border rounded px-3 py-2 text-xs text-white focus:outline-none"
              />
              <p className="text-[10px] text-studio-muted mt-1 leading-relaxed">
                Managed securely in the server environment. This key is never exposed to public frontend scopes.
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-2">Project Token Cost limit ($)</label>
              <input
                type="number"
                value={budgetLimit}
                onChange={(e) => setBudgetLimit(parseFloat(e.target.value))}
                className="w-full bg-studio-dark border border-studio-border rounded px-3 py-2 text-xs text-white focus:outline-none"
              />
              <p className="text-[10px] text-studio-muted mt-1 leading-relaxed">
                Prevents accidental over-expenditure during large storyboard turnaround renders.
              </p>
            </div>
          </div>
        </div>

        {/* Model abstraction adapters */}
        <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4">
          <h3 className="font-display font-semibold text-white border-b border-studio-border pb-2 flex items-center gap-1.5">
            <Settings size={16} className="text-studio-blue" /> Dynamic Provider Adapters
          </h3>
          <p className="text-xs text-studio-muted leading-relaxed">
            Swap targeting models instantly depending on complexity requirements. Provider interfaces abstract all prompt conversions.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1">Text Reasoner (Script/Bible Extraction)</label>
              <select
                value={textModel}
                onChange={(e) => setTextModel(e.target.value)}
                className="w-full bg-studio-dark border border-studio-border text-xs rounded p-2 text-white focus:outline-none"
              >
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Optimized Speed)</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep Continuity analysis)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1">Character turnaround Generator</label>
              <select
                value={imageModel}
                onChange={(e) => setImageModel(e.target.value)}
                className="w-full bg-studio-dark border border-studio-border text-xs rounded p-2 text-white focus:outline-none"
              >
                <option value="imagen-3.0-generate-002">Imagen 3.0 (Cel-Shaded consistent vectors)</option>
                <option value="imagen-3.5-xl">Imagen 3.5 XL (High detail cinematic keyframe)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-studio-muted uppercase tracking-wider mb-1">Motion Video compiler</label>
              <select
                value={videoModel}
                onChange={(e) => setVideoModel(e.target.value)}
                className="w-full bg-studio-dark border border-studio-border text-xs rounded p-2 text-white focus:outline-none"
              >
                <option value="veo-3.1-generate-preview">Veo 3.1 Production Render (High Quality)</option>
                <option value="veo-3.1-lite-generate-preview">Veo 3.1 Lite Draft (Fast low-cost turnarounds)</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
