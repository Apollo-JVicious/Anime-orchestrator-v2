import React, { useState } from 'react';
import { VideoClip, Character, Location, Prop } from '../types';
import { Search, Image as ImageIcon, Video, Layers, Folder } from 'lucide-react';

interface Props {
  characters: Character[];
  locations: Location[];
  propsList: Prop[];
  videoClips: VideoClip[];
}

export default function AssetLibraryTab({ characters, locations, propsList, videoClips }: Props) {
  const [filterType, setFilterType] = useState<'all' | 'characters' | 'locations' | 'props' | 'videos'>('all');
  const [search, setSearch] = useState('');

  const filteredItems = (() => {
    const list: any[] = [];
    if (filterType === 'all' || filterType === 'characters') {
      characters.forEach(c => list.push({ type: 'Character', name: c.name, desc: c.role, img: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300', meta: c.canonStatus }));
    }
    if (filterType === 'all' || filterType === 'locations') {
      locations.forEach(l => list.push({ type: 'Location', name: l.name, desc: l.description, img: l.refImage, meta: l.timeOfDay }));
    }
    if (filterType === 'all' || filterType === 'props') {
      propsList.forEach(p => list.push({ type: 'Prop', name: p.name, desc: p.description, img: p.refImage, meta: p.canonStatus }));
    }
    if (filterType === 'all' || filterType === 'videos') {
      videoClips.forEach(v => list.push({ type: 'Video', name: v.title, desc: v.sourcePrompt, img: v.thumbnailUrl, meta: `${v.durationSeconds}s | ${v.resolution}` }));
    }

    return list.filter(item => item.name.toLowerCase().includes(search.toLowerCase()) || item.desc.toLowerCase().includes(search.toLowerCase()));
  })();

  return (
    <div className="space-y-6" id="asset-library">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-studio-border pb-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <Folder size={22} className="text-studio-blue" /> Production Asset Library
          </h2>
          <p className="text-studio-muted text-sm">Review, audit, and trace design references, storyboard cards, and render logs.</p>
        </div>

        {/* Search bar */}
        <div className="relative w-full md:w-64">
          <input
            type="text"
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-studio-dark border border-studio-border rounded px-9 py-2 text-xs text-white focus:outline-none focus:border-studio-blue"
          />
          <Search size={14} className="absolute left-3 top-3 text-studio-muted" />
        </div>
      </div>

      {/* Filter switches */}
      <div className="flex gap-2 bg-studio-card p-1 rounded border border-studio-border w-fit text-xs font-semibold uppercase tracking-wider">
        {[
          { id: 'all', label: 'All Assets' },
          { id: 'characters', label: 'Characters' },
          { id: 'locations', label: 'Locations' },
          { id: 'props', label: 'Props' },
          { id: 'videos', label: 'Videos' }
        ].map((btn) => (
          <button
            key={btn.id}
            onClick={() => setFilterType(btn.id as any)}
            className={`px-3.5 py-1.5 rounded transition-all cursor-pointer ${
              filterType === btn.id 
                ? 'bg-studio-card-light text-white border border-studio-border' 
                : 'text-studio-muted hover:text-white'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Gallery grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {filteredItems.map((item, idx) => (
          <div key={idx} className="bg-studio-card border border-studio-border rounded-lg overflow-hidden group">
            <div className="h-44 overflow-hidden relative">
              <img src={item.img} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
              <div className="absolute top-2 left-2 bg-studio-dark/80 px-2 py-0.5 rounded text-[9px] font-mono font-bold text-white uppercase border border-studio-border">
                {item.type}
              </div>
            </div>
            <div className="p-3 border-t border-studio-border space-y-1">
              <h3 className="font-display font-bold text-white text-sm group-hover:text-studio-red transition-colors truncate">
                {item.name}
              </h3>
              <p className="text-[11px] text-studio-muted truncate leading-relaxed">
                {item.desc}
              </p>
              <span className="text-[9px] font-mono font-bold text-studio-gold block border-t border-studio-border/40 pt-1 mt-1">
                {item.meta}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
