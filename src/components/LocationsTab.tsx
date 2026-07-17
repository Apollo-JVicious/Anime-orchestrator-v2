import React, { useState } from 'react';
import { Location } from '../types';
import { MapPin, Plus, Save } from 'lucide-react';

interface Props {
  locations: Location[];
  onSaveLocation: (loc: Location) => void;
}

export default function LocationsTab({ locations, onSaveLocation }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visualPrompt, setVisualPrompt] = useState('');
  const [refImage, setRefImage] = useState('https://images.unsplash.com/photo-1518005020951-eccb494ad742?w=600');
  const [timeOfDay, setTimeOfDay] = useState('Morning');
  const [weather, setWeather] = useState('Crisp, sunny');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSaveLocation({
      id: 'loc-' + Math.random().toString(36).substring(2, 9),
      projectId: 'crimson-sword',
      name,
      description,
      visualPrompt,
      refImage,
      timeOfDay,
      weather,
      canonStatus: 'Approved',
      isLocked: false
    });
    setName('');
    setDescription('');
    setVisualPrompt('');
    setShowAdd(false);
  };

  return (
    <div className="space-y-6" id="locations-tab">
      <div className="flex justify-between items-center border-b border-studio-border pb-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <MapPin size={22} className="text-studio-blue" /> Production Locations
          </h2>
          <p className="text-studio-muted text-sm">Lock settings, visual styles, and lighting blueprints for set continuity.</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 bg-studio-blue hover:bg-blue-600 text-white px-4 py-2 rounded font-medium text-sm transition-all shadow-md cursor-pointer"
        >
          <Plus size={16} /> Add Location
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleSubmit} className="bg-studio-card border border-studio-border p-5 rounded-lg space-y-4 animate-fade-in">
          <h3 className="text-sm font-display font-semibold text-white uppercase tracking-wider">New Location Set</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">Set Name</label>
                <input
                  type="text"
                  placeholder="e.g. Vulcans Forge"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded px-3 py-1.5 text-xs text-white focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">Description</label>
                <textarea
                  placeholder="Atmosphere details..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded p-3 text-xs text-white focus:outline-none h-20"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">AI Prompt Guideline</label>
                <input
                  type="text"
                  placeholder="Background anime prompt..."
                  value={visualPrompt}
                  onChange={(e) => setVisualPrompt(e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded px-3 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">Reference Image URL</label>
                <input
                  type="text"
                  value={refImage}
                  onChange={(e) => setRefImage(e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded px-3 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-studio-muted hover:text-white">Cancel</button>
            <button type="submit" className="bg-studio-blue hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded text-xs transition-all">
              Save Set Location
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {locations.map((l) => (
          <div key={l.id} className="bg-studio-card border border-studio-border rounded-lg overflow-hidden group">
            <div className="h-44 overflow-hidden relative">
              <img src={l.refImage} alt={l.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-gradient-to-t from-studio-card via-transparent to-transparent" />
              <div className="absolute top-3 left-3 bg-studio-dark/80 px-2 py-0.5 rounded text-[10px] font-mono font-bold text-studio-blue border border-studio-blue/30 uppercase">
                {l.timeOfDay} / {l.weather}
              </div>
            </div>
            <div className="p-4 space-y-2">
              <h3 className="font-display font-bold text-white text-lg">{l.name}</h3>
              <p className="text-xs text-studio-muted leading-relaxed line-clamp-3">{l.description}</p>
              <div className="border-t border-studio-border pt-2 mt-2 space-y-1">
                <span className="text-[10px] text-studio-muted uppercase font-semibold">Prompt Rule:</span>
                <p className="text-[10px] text-studio-gold font-mono leading-relaxed truncate">{l.visualPrompt}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
