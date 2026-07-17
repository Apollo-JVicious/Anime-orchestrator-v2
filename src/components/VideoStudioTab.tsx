import React, { useState, useEffect, useRef } from 'react';
import { VideoClip, ShotBuilder } from '../types';
import { Video, Play, Film, Sparkles, RefreshCw, AlertTriangle, PlayCircle, Plus, Trash2, CheckCircle } from 'lucide-react';

interface Props {
  shots: ShotBuilder[];
  videoClips: VideoClip[];
  onAddVideoClip: (clip: VideoClip) => void;
  onRefreshProject: () => void;
}

export default function VideoStudioTab({ shots, videoClips, onAddVideoClip, onRefreshProject }: Props) {
  const [activeShot, setActiveShot] = useState<ShotBuilder | null>(shots[0] || null);
  const [isFastPreview, setIsFastPreview] = useState(true);

  // Queue tracking
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any | null>(null);

  // Timeline assembly
  const [timeline, setTimeline] = useState<VideoClip[]>([]);
  const [currentTimelineIdx, setCurrentTimelineIdx] = useState(0);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const timelineVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (shots.length > 0 && !activeShot) {
      setActiveShot(shots[0]);
    }
  }, [shots]);

  // Polling mechanism
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (response.ok) {
          const status = await response.json();
          setJobStatus(status);

          if (status.status === 'completed') {
            setJobId(null);
            onRefreshProject(); // reload the clips
            alert('Shot compiled & saved to Production Library!');
          }
        }
      } catch (e) {
        console.error(e);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [jobId]);

  const triggerRender = async () => {
    if (!activeShot) return;
    setJobStatus({ status: 'queued', progress: 0 });
    try {
      const response = await fetch('/api/generations/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'crimson-sword',
          prompt: activeShot.promptSettings?.compiledPrompt || activeShot.sourcePrompt,
          isFastPreview,
          shotId: activeShot.id
        })
      });
      if (response.ok) {
        const data = await response.json();
        setJobId(data.jobId);
      }
    } catch (e) {
      console.error(e);
      alert('Network error compiling rendering request.');
    }
  };

  const addToTimeline = (clip: VideoClip) => {
    setTimeline(prev => [...prev, clip]);
  };

  const removeFromTimeline = (idx: number) => {
    setTimeline(prev => prev.filter((_, i) => i !== idx));
  };

  const playTimeline = () => {
    if (timeline.length === 0) return;
    setIsTimelinePlaying(true);
    setCurrentTimelineIdx(0);
  };

  const stopTimeline = () => {
    setIsTimelinePlaying(false);
  };

  const handleVideoEnded = () => {
    if (currentTimelineIdx < timeline.length - 1) {
      setCurrentTimelineIdx(prev => prev + 1);
    } else {
      setIsTimelinePlaying(false);
    }
  };

  return (
    <div className="space-y-6" id="video-studio">
      <div className="flex justify-between items-center border-b border-studio-border pb-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <Video size={22} className="text-studio-red" /> Veo Video Rendering Suite
          </h2>
          <p className="text-studio-muted text-sm">Deploy high-quality anime video frames using optimized motion adapters and lineart stabilization.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Controls & trigger */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4">
            <h3 className="font-display font-semibold text-white">1. Select compiled Shot Spec</h3>
            <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
              {shots.map((s) => {
                const isActive = activeShot?.id === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => setActiveShot(s)}
                    className={`p-3 rounded border text-xs cursor-pointer transition-all ${
                      isActive 
                        ? 'bg-studio-red/15 border-studio-red text-white' 
                        : 'bg-studio-dark/50 border-studio-border text-studio-muted hover:text-white'
                    }`}
                  >
                    <span className="font-semibold block font-mono">{s.name}</span>
                    <span className="text-[10px] text-studio-muted block mt-0.5 truncate">{s.finalPrompt}</span>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-studio-border/50 pt-4 space-y-3">
              <h3 className="font-display font-semibold text-white text-xs uppercase tracking-wider">2. Choose Rendering Model Mode</h3>
              <div className="grid grid-cols-2 gap-4">
                <div
                  onClick={() => setIsFastPreview(true)}
                  className={`p-3 rounded border cursor-pointer transition-all ${
                    isFastPreview 
                      ? 'bg-studio-card-light border-studio-gold text-white' 
                      : 'bg-studio-dark border-studio-border text-studio-muted opacity-60'
                  }`}
                >
                  <span className="text-xs font-semibold block text-studio-gold">Fast Preview (Veo Lite Turnaround)</span>
                  <span className="text-[10px] text-studio-muted mt-1 block">Low-cost testing ($0.05 budget Spent). Perfect for timing, camera speeds and keyframe layouts.</span>
                </div>

                <div
                  onClick={() => setIsFastPreview(false)}
                  className={`p-3 rounded border cursor-pointer transition-all ${
                    !isFastPreview 
                      ? 'bg-studio-card-light border-studio-red text-white' 
                      : 'bg-studio-dark border-studio-border text-studio-muted opacity-60'
                  }`}
                >
                  <span className="text-xs font-semibold block text-studio-red">Veo Production Render (1080p Ultra)</span>
                  <span className="text-[10px] text-studio-muted mt-1 block">Production-ready ($0.85 budget spent). Standard 2D anime frame consistency with stabilized shading.</span>
                </div>
              </div>
            </div>

            <button
              onClick={triggerRender}
              disabled={!!jobId || !activeShot}
              className="w-full bg-studio-red hover:bg-studio-red-hover text-white font-bold py-3 rounded text-xs uppercase tracking-wider transition-all shadow-md shadow-studio-red/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Sparkles size={14} /> Compile & Queue Render Shot
            </button>
          </div>

          {/* Sequence Timeline Assembly */}
          <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-studio-border pb-2">
              <h3 className="font-display font-semibold text-white">Active Sequence Timeline Editor</h3>
              <div className="flex gap-2">
                {timeline.length > 0 && (
                  <button
                    onClick={isTimelinePlaying ? stopTimeline : playTimeline}
                    className="bg-studio-gold text-studio-dark hover:bg-yellow-500 font-bold px-3 py-1.5 rounded text-[10px] uppercase tracking-wider cursor-pointer"
                  >
                    {isTimelinePlaying ? 'Stop Track' : 'Play Assembled track'}
                  </button>
                )}
                <button
                  onClick={() => setTimeline([])}
                  className="text-[10px] text-studio-muted hover:text-white"
                >
                  Clear Tracks
                </button>
              </div>
            </div>

            {/* Video Player Box for Timeline Sequential Streams */}
            {isTimelinePlaying && timeline[currentTimelineIdx] ? (
              <div className="bg-black rounded-lg aspect-video max-h-64 mx-auto relative overflow-hidden border border-studio-gold">
                <video
                  ref={timelineVideoRef}
                  src={timeline[currentTimelineIdx].videoUrl}
                  autoPlay
                  controls={false}
                  onEnded={handleVideoEnded}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 bg-studio-gold text-studio-dark px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider">
                  Track Shot {currentTimelineIdx + 1} / {timeline.length}: {timeline[currentTimelineIdx].title.substring(0, 20)}...
                </div>
              </div>
            ) : (
              <p className="text-xs text-studio-muted text-center py-6 bg-studio-dark/40 rounded border border-studio-border">
                Timeline is currently empty or stopped. Add clips from the library below and hit "Play Assembled Track" to stream continuously!
              </p>
            )}

            {/* Drag representation */}
            <div className="flex gap-3 overflow-x-auto pb-2">
              {timeline.map((clip, i) => (
                <div key={i} className="bg-studio-dark border border-studio-border rounded p-2.5 shrink-0 w-36 text-xs relative group">
                  <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => removeFromTimeline(i)} className="p-1 bg-studio-card border border-studio-border text-studio-muted hover:text-studio-red rounded cursor-pointer">
                      <Trash2 size={10} />
                    </button>
                  </div>
                  <span className="text-studio-gold font-mono text-[10px] font-bold">Track 0{i+1}</span>
                  <p className="text-white font-semibold truncate mt-1">{clip.title}</p>
                  <span className="text-[10px] text-studio-muted block mt-0.5">{clip.durationSeconds}s | {clip.resolution}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: active Queue & Shot Library */}
        <div className="space-y-6">
          {/* Status HUD Queue */}
          {jobStatus && (
            <div className="bg-studio-card border border-studio-gold/60 rounded-lg p-5 space-y-3 animate-fade-in">
              <span className="text-[10px] uppercase font-mono tracking-widest text-studio-gold">Active Render Queue Node</span>
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-white">Pipeline Status:</span>
                <span className="bg-yellow-950 text-studio-gold text-[10px] font-mono font-bold border border-yellow-900 px-2 py-0.5 rounded uppercase animate-pulse">
                  {jobStatus.status.replace('_', ' ')}
                </span>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-studio-muted">
                  <span>Progress</span>
                  <span>{jobStatus.progress}%</span>
                </div>
                <div className="w-full bg-studio-dark h-2 rounded-full overflow-hidden border border-studio-border">
                  <div className="bg-studio-gold h-full transition-all duration-500" style={{ width: `${jobStatus.progress}%` }} />
                </div>
              </div>

              {/* Step indicator */}
              <div className="bg-studio-dark/60 p-3 rounded border border-studio-border space-y-1.5 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className={jobStatus.progress >= 25 ? 'text-emerald-400' : 'text-studio-muted'}>● rendering motion adapters</span>
                  <span className="text-studio-muted">25%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={jobStatus.progress >= 50 ? 'text-emerald-400' : 'text-studio-muted'}>● stabilizing hand-drawn lines</span>
                  <span className="text-studio-muted font-mono">50%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={jobStatus.progress >= 75 ? 'text-emerald-400' : 'text-studio-muted'}>● compositing volumetric shadows</span>
                  <span className="text-studio-muted">75%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={jobStatus.progress >= 100 ? 'text-emerald-400' : 'text-studio-muted'}>● compiling final frame layers</span>
                  <span className="text-studio-muted">100%</span>
                </div>
              </div>
            </div>
          )}

          {/* Shot Library list */}
          <div className="bg-studio-card border border-studio-border rounded-lg p-5 space-y-4">
            <h3 className="font-display font-semibold text-white flex items-center gap-1.5">
              <Film size={16} className="text-studio-blue" /> Production library Clips
            </h3>
            <p className="text-[11px] text-studio-muted leading-relaxed">Add generated anime sequences to the sequence timeline editor above.</p>

            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {videoClips.map((clip) => (
                <div key={clip.id} className="bg-studio-dark border border-studio-border p-3 rounded flex gap-3 items-center group">
                  <div className="w-14 h-14 rounded overflow-hidden relative border border-studio-border/60 shrink-0 bg-black">
                    <img src={clip.thumbnailUrl} alt="Thumb" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] text-studio-gold uppercase font-mono block tracking-wider">{clip.modelUsed}</span>
                    <span className="text-xs font-semibold text-white block truncate">{clip.title}</span>
                    <span className="text-[10px] text-studio-muted block mt-0.5">{clip.durationSeconds}s | {clip.resolution} | Cost: <strong className="text-white">${clip.isFastPreview ? '0.05' : '0.85'}</strong></span>
                  </div>
                  <button
                    onClick={() => addToTimeline(clip)}
                    className="p-1.5 bg-studio-card border border-studio-border text-studio-muted hover:text-studio-gold rounded cursor-pointer shrink-0"
                    title="Add to timeline"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
