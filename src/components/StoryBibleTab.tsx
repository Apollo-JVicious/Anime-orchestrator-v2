import React, { useState } from 'react';
import { StoryBible, CanonStatus } from '../types';
import { Sparkles, Save, Info } from 'lucide-react';

interface Props {
  bible: StoryBible;
  onSave: (b: StoryBible) => void;
}

export default function StoryBibleTab({ bible, onSave }: Props) {
  const [formData, setFormData] = useState<StoryBible>({ ...bible });
  const [isExtracting, setIsExtracting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Track Canon statuses for each subsection dynamically
  const [statuses, setStatuses] = useState<Record<string, CanonStatus>>({
    premise: 'Approved',
    genre: 'Approved',
    themes: 'Approved',
    tone: 'Approved',
    worldHistory: 'Canon Locked',
    magicSystem: 'Canon Locked',
    visualLanguage: 'Draft',
    glossary: 'Approved'
  });

  const handleFieldChange = (field: keyof StoryBible, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleStatusChange = (section: string, status: CanonStatus) => {
    setStatuses(prev => ({ ...prev, [section]: status }));
  };

  const handleSave = () => {
    setSaveStatus('saving');
    onSave(formData);
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 800);
  };

  const handleExtract = async () => {
    if (!formData.unstructuredNotes.trim()) {
      alert('Please paste some unstructured story or world notes first!');
      return;
    }
    setIsExtracting(true);
    try {
      const response = await fetch(`/api/projects/${bible.projectId}/bible/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unstructuredNotes: formData.unstructuredNotes })
      });
      if (response.ok) {
        const extracted = await response.json();
        setFormData(prev => ({
          ...prev,
          ...extracted
        }));
      } else {
        alert('Extraction failed. Check backend server logs.');
      }
    } catch (e) {
      console.error(e);
      alert('Error connecting to Gemini API.');
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="space-y-6" id="story-bible">
      <div className="flex justify-between items-center border-b border-studio-border pb-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            Story Bible & World Lore
          </h2>
          <p className="text-studio-muted text-sm">Convert unstructured draft notes into consistent canon constraints.</p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-studio-red hover:bg-studio-red-hover text-white px-4 py-2 rounded font-medium text-sm transition-all shadow-md shadow-studio-red/20 cursor-pointer"
        >
          <Save size={16} /> {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Commit to Canon'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Unstructured Scrapbook */}
        <div className="lg:col-span-1 bg-studio-card border border-studio-border rounded-lg p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-display font-semibold text-white">Unstructured Scratchpad</h3>
            <span className="text-[10px] bg-studio-card-light text-studio-gold border border-studio-border px-2 py-0.5 rounded uppercase font-mono">
              Draft notes box
            </span>
          </div>
          <p className="text-xs text-studio-muted">
            Paste anything here: character traits, world ideas, snippets of dialogues. Gemini will parse them and populate the structured fields on the right.
          </p>
          <textarea
            value={formData.unstructuredNotes}
            onChange={(e) => handleFieldChange('unstructuredNotes', e.target.value)}
            placeholder="Type or paste unstructured brainstorm ideas here..."
            className="w-full bg-studio-dark border border-studio-border rounded p-3 text-white text-xs focus:outline-none focus:border-studio-red h-[380px] font-sans resize-none"
          />
          <button
            onClick={handleExtract}
            disabled={isExtracting}
            className="w-full flex items-center justify-center gap-2 bg-studio-card-light hover:bg-studio-border text-studio-gold border border-studio-gold/30 hover:border-studio-gold rounded py-2.5 text-xs font-semibold uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
          >
            <Sparkles size={14} className={isExtracting ? 'animate-spin' : ''} />
            {isExtracting ? 'Gemini Extracting...' : 'Structure notes with Gemini'}
          </button>
        </div>

        {/* Structured Canon Records */}
        <div className="lg:col-span-2 space-y-6 max-h-[640px] overflow-y-auto pr-1">
          {/* Premise Section */}
          <div className="bg-studio-card border border-studio-border rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-white uppercase tracking-wider">Premise & Core Story</span>
              <select
                value={statuses.premise}
                onChange={(e) => handleStatusChange('premise', e.target.value as CanonStatus)}
                className="bg-studio-dark border border-studio-border text-xs rounded px-2 py-1 text-studio-gold font-mono focus:outline-none"
              >
                <option value="Draft">Draft</option>
                <option value="Approved">Approved</option>
                <option value="Canon Locked">Canon Locked</option>
                <option value="Disputed">Disputed</option>
                <option value="Retired">Retired</option>
              </select>
            </div>
            <textarea
              value={formData.premise}
              onChange={(e) => handleFieldChange('premise', e.target.value)}
              className="w-full bg-studio-dark border border-studio-border rounded p-3 text-white text-xs focus:outline-none focus:border-studio-red h-24"
              placeholder="The main driving concept of this world..."
            />
          </div>

          {/* Theme & Tone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-studio-card border border-studio-border rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-white uppercase tracking-wider">Themes</span>
                <select
                  value={statuses.themes}
                  onChange={(e) => handleStatusChange('themes', e.target.value as CanonStatus)}
                  className="bg-studio-dark border border-studio-border text-xs rounded px-2 py-1 text-studio-gold font-mono focus:outline-none"
                >
                  <option value="Draft">Draft</option>
                  <option value="Approved">Approved</option>
                  <option value="Canon Locked">Canon Locked</option>
                </select>
              </div>
              <textarea
                value={formData.themes}
                onChange={(e) => handleFieldChange('themes', e.target.value)}
                className="w-full bg-studio-dark border border-studio-border rounded p-3 text-white text-xs focus:outline-none focus:border-studio-red h-24"
                placeholder="Core philosophical questions or conflicts..."
              />
            </div>
            <div className="bg-studio-card border border-studio-border rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-white uppercase tracking-wider">Tone & Vibe</span>
                <select
                  value={statuses.tone}
                  onChange={(e) => handleStatusChange('tone', e.target.value as CanonStatus)}
                  className="bg-studio-dark border border-studio-border text-xs rounded px-2 py-1 text-studio-gold font-mono focus:outline-none"
                >
                  <option value="Draft">Draft</option>
                  <option value="Approved">Approved</option>
                  <option value="Canon Locked">Canon Locked</option>
                </select>
              </div>
              <textarea
                value={formData.tone}
                onChange={(e) => handleFieldChange('tone', e.target.value)}
                className="w-full bg-studio-dark border border-studio-border rounded p-3 text-white text-xs focus:outline-none focus:border-studio-red h-24"
                placeholder="Cinematic mood description..."
              />
            </div>
          </div>

          {/* History & Timeline */}
          <div className="bg-studio-card border border-studio-border rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-white uppercase tracking-wider">World History & Historical Wars</span>
              <select
                value={statuses.worldHistory}
                onChange={(e) => handleStatusChange('worldHistory', e.target.value as CanonStatus)}
                className="bg-studio-dark border border-studio-border text-xs rounded px-2 py-1 text-studio-gold font-mono focus:outline-none"
              >
                <option value="Draft">Draft</option>
                <option value="Approved">Approved</option>
                <option value="Canon Locked">Canon Locked</option>
              </select>
            </div>
            <textarea
              value={formData.worldHistory}
              onChange={(e) => handleFieldChange('worldHistory', e.target.value)}
              className="w-full bg-studio-dark border border-studio-border rounded p-3 text-white text-xs focus:outline-none focus:border-studio-red h-32"
              placeholder="What events shaped this landscape..."
            />
          </div>

          {/* Magic Systems */}
          <div className="bg-studio-card border border-studio-border rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-white uppercase tracking-wider">Magic, Spirits & Power Laws</span>
              <select
                value={statuses.magicSystem}
                onChange={(e) => handleStatusChange('magicSystem', e.target.value as CanonStatus)}
                className="bg-studio-dark border border-studio-border text-xs rounded px-2 py-1 text-studio-gold font-mono focus:outline-none"
              >
                <option value="Draft">Draft</option>
                <option value="Approved">Approved</option>
                <option value="Canon Locked">Canon Locked</option>
              </select>
            </div>
            <textarea
              value={formData.magicSystem}
              onChange={(e) => handleFieldChange('magicSystem', e.target.value)}
              className="w-full bg-studio-dark border border-studio-border rounded p-3 text-white text-xs focus:outline-none focus:border-studio-red h-28"
              placeholder="System dynamics, elemental bounds, active rules..."
            />
          </div>

          {/* Rendering Style & Cinematography */}
          <div className="bg-studio-card border border-studio-border rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-white uppercase tracking-wider">Visual Language & Color Script</span>
              <select
                value={statuses.visualLanguage}
                onChange={(e) => handleStatusChange('visualLanguage', e.target.value as CanonStatus)}
                className="bg-studio-dark border border-studio-border text-xs rounded px-2 py-1 text-studio-gold font-mono focus:outline-none"
              >
                <option value="Draft">Draft</option>
                <option value="Approved">Approved</option>
                <option value="Canon Locked">Canon Locked</option>
              </select>
            </div>
            <textarea
              value={formData.renderStyle}
              onChange={(e) => handleFieldChange('renderStyle', e.target.value)}
              className="w-full bg-studio-dark border border-studio-border rounded p-3 text-white text-xs focus:outline-none focus:border-studio-red h-24"
              placeholder="Cel-shaded aesthetics, shadow densities, framing principles..."
            />
          </div>

          {/* Glossary */}
          <div className="bg-studio-card border border-studio-border rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-white uppercase tracking-wider">Glossary & Pronunciation Guides</span>
              <select
                value={statuses.glossary}
                onChange={(e) => handleStatusChange('glossary', e.target.value as CanonStatus)}
                className="bg-studio-dark border border-studio-border text-xs rounded px-2 py-1 text-studio-gold font-mono focus:outline-none"
              >
                <option value="Draft">Draft</option>
                <option value="Approved">Approved</option>
                <option value="Canon Locked">Canon Locked</option>
              </select>
            </div>
            <textarea
              value={formData.glossary}
              onChange={(e) => handleFieldChange('glossary', e.target.value)}
              className="w-full bg-studio-dark border border-studio-border rounded p-3 text-white text-xs focus:outline-none focus:border-studio-red h-20"
              placeholder="Aria: ah-ree-ah..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
