import React, { useState, useEffect } from 'react';
import { Project, StoryBible, Character, Location, Prop, Scene, StoryboardPanel, VideoClip, ContinuityCheckResult, ShotBuilder } from './types';
import ProjectDashboard from './components/ProjectDashboard';
import StoryBibleTab from './components/StoryBibleTab';
import CharacterCreatorTab from './components/CharacterCreatorTab';
import LocationsTab from './components/LocationsTab';
import PropsTab from './components/PropsTab';
import SceneWorkspaceTab from './components/SceneWorkspaceTab';
import StoryboardTab from './components/StoryboardTab';
import ShotBuilderTab from './components/ShotBuilderTab';
import VideoStudioTab from './components/VideoStudioTab';
import AssetLibraryTab from './components/AssetLibraryTab';
import ContinuityReviewTab from './components/ContinuityReviewTab';
import CodexTab from './components/CodexTab';
import SettingsTab from './components/SettingsTab';
import { Film, BookOpen, User, MapPin, Swords, Video, Folder, Layers, ShieldCheck, Settings, Code, Terminal, Play } from 'lucide-react';

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  
  // Active Project Datastores
  const [storyBible, setStoryBible] = useState<StoryBible | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [propsList, setPropsList] = useState<Prop[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeScene, setActiveScene] = useState<Scene | null>(null);
  const [storyboardPanels, setStoryboardPanels] = useState<StoryboardPanel[]>([]);
  const [videoClips, setVideoClips] = useState<VideoClip[]>([]);
  const [continuityResults, setContinuityResults] = useState<ContinuityCheckResult[]>([]);
  const [shotBuilders, setShotBuilders] = useState<ShotBuilder[]>([]);

  // Navigation Tab State
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      if (response.ok) {
        const list = await response.json();
        setProjects(list);
        if (list.length > 0 && !activeProject) {
          handleSelectProject(list[0]);
        }
      }
    } catch (e) {
      console.error('Error fetching projects:', e);
    }
  };

  const handleSelectProject = async (p: Project) => {
    setActiveProject(p);
    try {
      // 1. Fetch Canon Data (Bible, Characters, Locations, Props, Scenes)
      const resCanon = await fetch(`/api/projects/${p.id}/canon`);
      if (resCanon.ok) {
        const data = await resCanon.json();
        setStoryBible(data.bible);
        setCharacters(data.characters);
        setLocations(data.locations);
        setPropsList(data.props);
        setScenes(data.scenes);
        if (data.scenes.length > 0) {
          handleSelectScene(data.scenes[0]);
        }
      }

      // 2. Fetch Additional workspace items
      const resShots = await fetch(`/api/projects/${p.id}/shots`);
      if (resShots.ok) {
        const shots = await resShots.json();
        setShotBuilders(shots);
      }

      const resClips = await fetch(`/api/projects/${p.id}/assets`);
      if (resClips.ok) {
        const clips = await resClips.json();
        setVideoClips(clips);
      }

      const resContinuity = await fetch(`/api/projects/${p.id}/continuity`);
      if (resContinuity.ok) {
        const continuity = await resContinuity.json();
        setContinuityResults(continuity);
      }
    } catch (e) {
      console.error('Error hydrating project canon:', e);
    }
  };

  const handleSelectScene = async (s: Scene) => {
    setActiveScene(s);
    try {
      const res = await fetch(`/api/scenes/${s.id}/storyboard`);
      if (res.ok) {
        const panels = await res.json();
        setStoryboardPanels(panels);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveBible = async (updated: StoryBible) => {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/bible`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        setStoryBible(updated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveCharacter = async (updated: Character) => {
    try {
      const res = await fetch(`/api/characters/${updated.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        setCharacters(prev => prev.map(c => c.id === updated.id ? updated : c));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleLock = async (id: string) => {
    try {
      const res = await fetch(`/api/characters/${id}/lock`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setCharacters(prev => prev.map(c => c.id === id ? updated : c));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveLocation = async (updated: Location) => {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        const saved = await res.json();
        setLocations(prev => [...prev, saved]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveProp = async (updated: Prop) => {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/props`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        const saved = await res.json();
        setPropsList(prev => [...prev, saved]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveScene = async (updated: Scene) => {
    try {
      const res = await fetch(`/api/scenes/${updated.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        setScenes(prev => prev.map(s => s.id === updated.id ? updated : s));
        setActiveScene(updated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveStoryboardPanels = async (updatedPanels: StoryboardPanel[]) => {
    if (!activeScene) return;
    try {
      const res = await fetch(`/api/scenes/${activeScene.id}/storyboard`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPanels)
      });
      if (res.ok) {
        setStoryboardPanels(updatedPanels);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveShot = async (updatedShot: ShotBuilder) => {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/shots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedShot)
      });
      if (res.ok) {
        setShotBuilders(prev => prev.map(s => s.id === updatedShot.id ? updatedShot : s));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateProject = async (title: string, logline: string) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, logline })
      });
      if (res.ok) {
        const newProj = await res.json();
        setProjects(prev => [...prev, newProj]);
        handleSelectProject(newProj);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleTriggerContinuityCheck = async (sceneId: string) => {
    if (!activeProject) return;
    try {
      const res = await fetch('/api/continuity/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, sceneId })
      });
      if (res.ok) {
        const result = await res.json();
        setContinuityResults(prev => {
          const filtered = prev.filter(r => r.targetId !== sceneId);
          return [...filtered, result];
        });
        
        // Update warnings count locally
        setActiveProject(p => {
          if (!p) return null;
          return {
            ...p,
            recentWarningsCount: result.findings.length
          };
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateBudget = (newLimit: number) => {
    setActiveProject(p => {
      if (!p) return null;
      return { ...p, budgetLimit: newLimit };
    });
  };

  const handleRefreshWorkspace = () => {
    if (activeProject) {
      handleSelectProject(activeProject);
    }
  };

  return (
    <div className="min-h-screen bg-studio-dark text-studio-text flex font-sans" id="studio-shell">
      {/* Sidebar navigation */}
      <aside className="w-64 bg-studio-card border-r border-studio-border flex flex-col justify-between shrink-0">
        <div className="space-y-6 py-5">
          {/* Logo badge */}
          <div className="px-6 flex items-center gap-2">
            <span className="w-8 h-8 rounded bg-studio-red flex items-center justify-center font-display font-black text-white text-base">
              AO
            </span>
            <div>
              <span className="font-display font-bold text-white text-sm tracking-tight block">Anime Orchestrator</span>
              <span className="text-[10px] font-semibold text-studio-muted tracking-widest uppercase">Production Suite</span>
            </div>
          </div>

          {/* Core Menu */}
          <nav className="space-y-1 px-3">
            {[
              { id: 'dashboard', label: 'Production Cockpit', icon: <Layers size={14} /> },
              { id: 'bible', label: 'Story Bible', icon: <BookOpen size={14} />, requiresProject: true },
              { id: 'characters', label: 'Characters database', icon: <User size={14} />, requiresProject: true },
              { id: 'locations', label: 'Set Locations', icon: <MapPin size={14} />, requiresProject: true },
              { id: 'props', label: 'Props & Artifacts', icon: <Swords size={14} />, requiresProject: true },
              { id: 'scenes', label: 'Scene Workspace', icon: <Terminal size={14} />, requiresProject: true },
              { id: 'storyboards', label: 'Storyboards', icon: <Film size={14} />, requiresProject: true },
              { id: 'shots', label: 'Prompt Compiler', icon: <Play size={14} />, requiresProject: true },
              { id: 'videos', label: 'Veo Video Studio', icon: <Video size={14} />, requiresProject: true },
              { id: 'assets', label: 'Asset Library', icon: <Folder size={14} />, requiresProject: true },
              { id: 'continuity', label: 'Continuity & Lore', icon: <ShieldCheck size={14} />, requiresProject: true },
              { id: 'codex', label: 'Codex Integrations', icon: <Code size={14} /> },
              { id: 'settings', label: 'Studio Settings', icon: <Settings size={14} /> }
            ].map((item) => {
              const isActive = currentTab === item.id;
              const isDisabled = item.requiresProject && !activeProject;
              return (
                <button
                  key={item.id}
                  disabled={isDisabled}
                  onClick={() => setCurrentTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded transition-all text-left cursor-pointer ${
                    isActive 
                      ? 'bg-studio-red/10 text-studio-red border-l-2 border-studio-red' 
                      : isDisabled 
                      ? 'text-studio-dark opacity-35 cursor-not-allowed'
                      : 'text-studio-muted hover:text-white hover:bg-studio-card-light/40'
                  }`}
                >
                  {item.icon} {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom hud */}
        {activeProject && (
          <div className="p-4 border-t border-studio-border bg-studio-dark/35 space-y-2">
            <span className="text-[10px] text-studio-muted uppercase tracking-widest block font-bold font-mono">Current Channel</span>
            <div className="flex items-center justify-between text-xs font-semibold text-white">
              <span className="truncate max-w-[120px]">{activeProject.title}</span>
              <span className="text-studio-gold font-mono">${activeProject.budgetSpent.toFixed(2)}</span>
            </div>
          </div>
        )}
      </aside>

      {/* Main viewport */}
      <main className="flex-1 bg-studio-dark-bg p-8 overflow-y-auto max-w-7xl mx-auto w-full">
        {currentTab === 'dashboard' && (
          <ProjectDashboard
            projects={projects}
            activeProject={activeProject}
            onSelectProject={handleSelectProject}
            onCreateProject={handleCreateProject}
          />
        )}

        {currentTab === 'bible' && storyBible && (
          <StoryBibleTab
            bible={storyBible}
            onSave={handleSaveBible}
          />
        )}

        {currentTab === 'characters' && (
          <CharacterCreatorTab
            characters={characters}
            activeCharacter={characters[0] || null}
            onSelectCharacter={() => {}}
            onSaveCharacter={handleSaveCharacter}
            onToggleLock={handleToggleLock}
          />
        )}

        {currentTab === 'locations' && (
          <LocationsTab
            locations={locations}
            onSaveLocation={handleSaveLocation}
          />
        )}

        {currentTab === 'props' && (
          <PropsTab
            propsList={propsList}
            onSaveProp={handleSaveProp}
          />
        )}

        {currentTab === 'scenes' && activeScene && (
          <SceneWorkspaceTab
            scenes={scenes}
            locations={locations}
            characters={characters}
            propsList={propsList}
            activeScene={activeScene}
            onSelectScene={handleSelectScene}
            onSaveScene={handleSaveScene}
          />
        )}

        {currentTab === 'storyboards' && (
          <StoryboardTab
            activeScene={activeScene}
            storyboardPanels={storyboardPanels}
            onSavePanels={handleSaveStoryboardPanels}
          />
        )}

        {currentTab === 'shots' && (
          <ShotBuilderTab
            shots={shotBuilders}
            onSaveShot={handleSaveShot}
          />
        )}

        {currentTab === 'videos' && (
          <VideoStudioTab
            shots={shotBuilders}
            videoClips={videoClips}
            onAddVideoClip={() => {}}
            onRefreshProject={handleRefreshWorkspace}
          />
        )}

        {currentTab === 'assets' && (
          <AssetLibraryTab
            characters={characters}
            locations={locations}
            propsList={propsList}
            videoClips={videoClips}
          />
        )}

        {currentTab === 'continuity' && (
          <ContinuityReviewTab
            scenes={scenes}
            continuityResults={continuityResults}
            onTriggerCheck={handleTriggerContinuityCheck}
          />
        )}

        {currentTab === 'codex' && (
          <CodexTab
            activeProject={activeProject}
            onRefreshProject={handleRefreshWorkspace}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsTab
            activeProject={activeProject}
            onUpdateBudget={handleUpdateBudget}
          />
        )}
      </main>
    </div>
  );
}
