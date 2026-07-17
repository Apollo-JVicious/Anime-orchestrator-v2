import React, { useState } from 'react';
import { Prop } from '../types';
import { Swords, Plus, Save } from 'lucide-react';

interface Props {
  propsList: Prop[];
  onSaveProp: (p: Prop) => void;
}

export default function PropsTab({ propsList, onSaveProp }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visualPrompt, setVisualPrompt] = useState('');
  const [materials, setMaterials] = useState('');
  const [refImage, setRefImage] = useState('https://images.unsplash.com/photo-1618336753974-aae8e04506aa?w=600');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSaveProp({
      id: 'prop-' + Math.random().toString(36).substring(2, 9),
      projectId: 'crimson-sword',
      name,
      description,
      visualPrompt,
      refImage,
      materials,
      canonStatus: 'Approved',
      isLocked: false
    });
    setName('');
    setDescription('');
    setVisualPrompt('');
    setMaterials('');
    setShowAdd(false);
  };

  return (
    <div className="space-y-6" id="props-tab">
      <div className="flex justify-between items-center border-b border-studio-border pb-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <Swords size={22} className="text-studio-blue" /> Props & sacred Artifacts
          </h2>
          <p className="text-studio-muted text-sm">Log core weaponry, mystical tools, and materials references for scene logic.</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 bg-studio-blue hover:bg-blue-600 text-white px-4 py-2 rounded font-medium text-sm transition-all shadow-md cursor-pointer"
        >
          <Plus size={16} /> Add Prop
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleSubmit} className="bg-studio-card border border-studio-border p-5 rounded-lg space-y-4 animate-fade-in">
          <h3 className="text-sm font-display font-semibold text-white uppercase tracking-wider">New Prop Registration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">Prop Name</label>
                <input
                  type="text"
                  placeholder="e.g. Aegis Solar Shield"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded px-3 py-1.5 text-xs text-white focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">Description</label>
                <textarea
                  placeholder="Design detailing..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded p-3 text-xs text-white focus:outline-none h-20"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">Materials / Textures</label>
                <input
                  type="text"
                  placeholder="e.g. Solar-bronze, obsidian cores"
                  value={materials}
                  onChange={(e) => setMaterials(e.target.value)}
                  className="w-full bg-studio-dark border border-studio-border rounded px-3 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">Concept Image URL</label>
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
              Save Prop Spec
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {propsList.map((p) => (
          <div key={p.id} className="bg-studio-card border border-studio-border rounded-lg overflow-hidden group">
            <div className="h-44 overflow-hidden relative">
              <img src={p.refImage} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-gradient-to-t from-studio-card via-transparent to-transparent" />
              <div className="absolute top-3 left-3 bg-studio-dark/80 px-2 py-0.5 rounded text-[10px] font-mono font-bold text-studio-gold border border-studio-border uppercase">
                {p.canonStatus}
              </div>
            </div>
            <div className="p-4 space-y-2">
              <h3 className="font-display font-bold text-white text-lg">{p.name}</h3>
              <p className="text-xs text-studio-muted leading-relaxed line-clamp-2">{p.description}</p>
              <div className="border-t border-studio-border pt-2 mt-2 flex justify-between items-center text-[10px]">
                <span className="text-studio-muted">Materials: <strong className="text-white">{p.materials || 'Standard'}</strong></span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
