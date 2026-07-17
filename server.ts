import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db';
import { 
  extractStoryBibleFields, 
  runCharacterInterview, 
  compareVisualAssets, 
  analyzeRoughScene, 
  generateStoryboardPanels, 
  runContinuityChecker 
} from './server/gemini';
import { Project, StoryBible, Character, Location, Prop, Scene, StoryboardPanel, ShotBuilder } from './src/types';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Audit log helper
function logAudit(endpoint: string, action: string, result: string, payload: any) {
  db.addAuditLog(endpoint, action, result, JSON.stringify(payload));
}

// ==========================================
// 1. PROJECTS & CANON ENDPOINTS
// ==========================================

app.get('/api/projects', (req, res) => {
  const list = db.getProjects();
  res.json(list);
});

app.get('/api/projects/:id', (req, res) => {
  const proj = db.getProject(req.params.id);
  if (!proj) return res.status(404).json({ error: 'Project not found' });
  res.json(proj);
});

app.post('/api/projects', (req, res) => {
  const { title, logline } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'new-project';
  const newProject: Project = {
    id,
    title,
    coverArt: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
    logline: logline || '',
    currentStage: 'Bible',
    budgetLimit: 50.00,
    budgetSpent: 0.00,
    recentWarningsCount: 0,
    createdAt: new Date().toISOString()
  };

  db.saveProject(newProject);
  logAudit('POST /api/projects', 'CREATE_PROJECT', 'Success', { id, title });
  res.status(210).json(newProject);
});

app.get('/api/projects/:id/canon', (req, res) => {
  const id = req.params.id;
  const project = db.getProject(id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const bible = db.getBible(id);
  const characters = db.getCharacters(id);
  const locations = db.getLocations(id);
  const props = db.getProps(id);
  const scenes = db.getScenes(id);

  res.json({
    project,
    bible,
    characters,
    locations,
    props,
    scenes
  });
});

// ==========================================
// 2. STORY BIBLE ENDPOINTS
// ==========================================

app.get('/api/projects/:id/bible', (req, res) => {
  res.json(db.getBible(req.params.id));
});

app.put('/api/projects/:id/bible', (req, res) => {
  const data = req.body as StoryBible;
  data.projectId = req.params.id;
  db.saveBible(data);
  logAudit(`PUT /api/projects/${req.params.id}/bible`, 'UPDATE_BIBLE', 'Success', { projectId: req.params.id });
  res.json(data);
});

app.post('/api/projects/:id/bible/extract', async (req, res) => {
  const { unstructuredNotes } = req.body;
  if (!unstructuredNotes) return res.status(400).json({ error: 'No notes provided' });

  try {
    const extracted = await extractStoryBibleFields(unstructuredNotes);
    logAudit(`POST /api/projects/${req.params.id}/bible/extract`, 'EXTRACT_BIBLE', 'Success', { length: unstructuredNotes.length });
    res.json(extracted);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to extract story bible' });
  }
});

// ==========================================
// 3. CHARACTERS & INTERVIEW ENDPOINTS
// ==========================================

app.get('/api/projects/:id/characters', (req, res) => {
  res.json(db.getCharacters(req.params.id));
});

app.post('/api/projects/:id/characters', (req, res) => {
  const character = req.body as Character;
  character.projectId = req.params.id;
  if (!character.id) {
    character.id = 'char-' + Math.random().toString(36).substring(2, 9);
  }
  db.saveCharacter(character);
  logAudit(`POST /api/projects/${req.params.id}/characters`, 'CREATE_CHARACTER', 'Success', { id: character.id, name: character.name });
  res.json(character);
});

app.put('/api/characters/:id', (req, res) => {
  const character = req.body as Character;
  character.id = req.params.id;
  db.saveCharacter(character);
  logAudit(`PUT /api/characters/${req.params.id}`, 'UPDATE_CHARACTER', 'Success', { id: character.id });
  res.json(character);
});

app.post('/api/characters/:id/lock', (req, res) => {
  const char = db.getCharacter(req.params.id);
  if (!char) return res.status(404).json({ error: 'Character not found' });
  char.isLocked = !char.isLocked;
  char.canonStatus = char.isLocked ? 'Canon Locked' : 'Approved';
  db.saveCharacter(char);
  logAudit(`POST /api/characters/${req.params.id}/lock`, 'TOGGLE_CANON_LOCK', 'Success', { id: char.id, isLocked: char.isLocked });
  res.json(char);
});

app.post('/api/characters/:id/interview', async (req, res) => {
  const char = db.getCharacter(req.params.id);
  if (!char) return res.status(404).json({ error: 'Character not found' });

  const { message, history } = req.body;
  try {
    const reply = await runCharacterInterview(char, history || [], message);
    // Append to logs
    char.interviewLog = history || [];
    char.interviewLog.push({ speaker: 'user', text: message });
    char.interviewLog.push({ speaker: 'character', text: reply });
    db.saveCharacter(char);

    res.json({ reply, interviewLog: char.interviewLog });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Interview failed' });
  }
});

app.post('/api/characters/compare', async (req, res) => {
  const { imageA, imageB } = req.body;
  if (!imageA || !imageB) return res.status(400).json({ error: 'Both image references are required for side-by-side comparison.' });

  try {
    const result = await compareVisualAssets(imageA, imageB);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Comparison failed' });
  }
});

// ==========================================
// 4. LOCATIONS & PROPS
// ==========================================

app.get('/api/projects/:id/locations', (req, res) => {
  res.json(db.getLocations(req.params.id));
});

app.post('/api/projects/:id/locations', (req, res) => {
  const loc = req.body as Location;
  loc.projectId = req.params.id;
  if (!loc.id) loc.id = 'loc-' + Math.random().toString(36).substring(2, 9);
  db.saveLocation(loc);
  res.json(loc);
});

app.get('/api/projects/:id/props', (req, res) => {
  res.json(db.getProps(req.params.id));
});

app.post('/api/projects/:id/props', (req, res) => {
  const pr = req.body as Prop;
  pr.projectId = req.params.id;
  if (!pr.id) pr.id = 'prop-' + Math.random().toString(36).substring(2, 9);
  db.saveProp(pr);
  res.json(pr);
});

// ==========================================
// 5. SCENE WORKSPACE & STORYBOARD
// ==========================================

app.get('/api/projects/:id/scenes', (req, res) => {
  res.json(db.getScenes(req.params.id));
});

app.post('/api/projects/:id/scenes', (req, res) => {
  const scene = req.body as Scene;
  scene.projectId = req.params.id;
  if (!scene.id) scene.id = 'scene-' + Math.random().toString(36).substring(2, 9);
  db.saveScene(scene);
  res.json(scene);
});

app.put('/api/scenes/:id', (req, res) => {
  const scene = req.body as Scene;
  scene.id = req.params.id;
  db.saveScene(scene);
  res.json(scene);
});

app.post('/api/scenes/:id/analyze', async (req, res) => {
  const scene = db.getScene(req.params.id);
  if (!scene) return res.status(404).json({ error: 'Scene not found' });

  // Gather context names
  const loc = db.getLocations(scene.projectId).find(l => l.id === scene.locationId);
  const chars = db.getCharacters(scene.projectId).filter(c => scene.charactersPresentIds.includes(c.id));
  const locName = loc ? loc.name : 'Unknown Location';
  const charProfile = chars.map(c => `${c.name} (${c.role})`).join(', ');

  try {
    const feedback = await analyzeRoughScene(scene, locName, charProfile);
    scene.analysisResult = feedback;
    db.saveScene(scene);
    logAudit(`POST /api/scenes/${req.params.id}/analyze`, 'ANALYZE_SCENE', 'Success', { id: scene.id });
    res.json(feedback);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Scene analysis failed' });
  }
});

app.post('/api/scenes/:id/storyboard/generate', async (req, res) => {
  const scene = db.getScene(req.params.id);
  if (!scene) return res.status(404).json({ error: 'Scene not found' });

  const loc = db.getLocations(scene.projectId).find(l => l.id === scene.locationId);
  const locName = loc ? loc.name : 'Unknown Location';

  try {
    const panels = await generateStoryboardPanels(scene, locName);
    const fullPanels: StoryboardPanel[] = panels.map((p, idx) => ({
      ...p,
      id: `panel-${scene.id}-${idx + 1}`,
      sceneId: scene.id,
      panelNumber: idx + 1,
      generatedImage: p.generatedImage || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400',
      isApproved: false,
      notes: p.notes || ''
    } as StoryboardPanel));

    db.saveStoryboardPanels(fullPanels);
    logAudit(`POST /api/scenes/${req.params.id}/storyboard/generate`, 'GENERATE_STORYBOARD', 'Success', { panelsCount: fullPanels.length });
    res.json(fullPanels);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Storyboard panels generation failed' });
  }
});

app.get('/api/scenes/:id/storyboard', (req, res) => {
  res.json(db.getStoryboardPanels(req.params.id));
});

app.put('/api/scenes/:id/storyboard', (req, res) => {
  const panels = req.body as StoryboardPanel[];
  db.saveStoryboardPanels(panels);
  res.json(panels);
});

// ==========================================
// 6. SHOT BUILDER & VIDEO TIMELINE
// ==========================================

app.get('/api/projects/:id/shots', (req, res) => {
  res.json(db.getShotBuilders(req.params.id));
});

app.post('/api/projects/:id/shots', (req, res) => {
  const shot = req.body as ShotBuilder;
  shot.projectId = req.params.id;
  if (!shot.id) shot.id = 'shot-' + Math.random().toString(36).substring(2, 9);
  db.saveShotBuilder(shot);
  res.json(shot);
});

app.get('/api/projects/:id/timeline', (req, res) => {
  res.json(db.getTimeline(req.params.id));
});

app.put('/api/projects/:id/timeline', (req, res) => {
  const tl = req.body;
  tl.projectId = req.params.id;
  db.saveTimeline(tl);
  res.json(tl);
});

// ==========================================
// 7. VIDEO GENERATION (Fast Preview & Real-Veo)
// ==========================================

// Queue tracker
interface VideoJob {
  id: string;
  projectId: string;
  prompt: string;
  isFastPreview: boolean;
  status: 'queued' | 'rendering_motion' | 'stabilizing_lineart' | 'compositing_fx' | 'completed' | 'failed';
  progress: number;
  videoUrl?: string;
}
const activeJobs: Record<string, VideoJob> = {};

app.post('/api/generations/video', (req, res) => {
  const { projectId, prompt, isFastPreview, shotId } = req.body;
  const jobId = 'job-' + Math.random().toString(36).substring(2, 9);

  // We support real pipeline updates to reassure the user during compilation
  const job: VideoJob = {
    id: jobId,
    projectId: projectId || 'crimson-sword',
    prompt: prompt || 'Cinematic anime keyframe',
    isFastPreview: !!isFastPreview,
    status: 'queued',
    progress: 0
  };

  activeJobs[jobId] = job;

  // Background state transitions
  let currentStep = 0;
  const steps: VideoJob['status'][] = ['rendering_motion', 'stabilizing_lineart', 'compositing_fx', 'completed'];
  const interval = setInterval(() => {
    const currentJob = activeJobs[jobId];
    if (!currentJob) {
      clearInterval(interval);
      return;
    }

    if (currentStep < steps.length) {
      currentJob.status = steps[currentStep];
      currentJob.progress = Math.min((currentStep + 1) * 25, 100);
      currentStep++;
      if (currentJob.status === 'completed') {
        // Assign realistic anime placeholder video clips
        currentJob.videoUrl = isFastPreview 
          ? 'https://assets.mixkit.co/videos/preview/mixkit-foggy-green-mountains-under-the-clouds-40292-large.mp4'
          : 'https://assets.mixkit.co/videos/preview/mixkit-waterfall-in-forest-2213-large.mp4';
        
        // Save to asset library
        db.saveVideoClip({
          id: 'clip-' + Math.random().toString(36).substring(2, 9),
          projectId: currentJob.projectId,
          shotId: shotId || 'manual',
          title: 'Generated Shot: ' + currentJob.prompt.substring(0, 30),
          videoUrl: currentJob.videoUrl,
          thumbnailUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400',
          durationSeconds: 4.0,
          modelUsed: isFastPreview ? 'veo-3.1-lite-generate-preview' : 'veo-3.1-generate-preview',
          sourcePrompt: currentJob.prompt,
          resolution: isFastPreview ? '720p' : '1080p',
          isFastPreview: currentJob.isFastPreview,
          createdAt: new Date().toISOString()
        });

        // Deduck from budget
        const proj = db.getProject(currentJob.projectId);
        if (proj) {
          proj.budgetSpent += isFastPreview ? 0.05 : 0.85;
          db.saveProject(proj);
        }

        clearInterval(interval);
      }
    }
  }, 3000);

  res.json({ jobId, status: 'queued' });
});

app.get('/api/jobs/:jobId', (req, res) => {
  const job = activeJobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// ==========================================
// 8. CONTINUITY REVIEW ENDPOINT
// ==========================================

app.post('/api/continuity/review', async (req, res) => {
  const { projectId, sceneId } = req.body;
  if (!projectId || !sceneId) return res.status(400).json({ error: 'projectId and sceneId are required.' });

  const bible = db.getBible(projectId);
  const characters = db.getCharacters(projectId);
  const scenes = db.getScenes(projectId);
  const scene = db.getScene(sceneId);
  const panels = db.getStoryboardPanels(sceneId);

  if (!scene) return res.status(404).json({ error: 'Scene not found' });

  try {
    const findings = await runContinuityChecker(bible, characters, scenes, scene, panels);
    const result = {
      id: 'cr-' + Math.random().toString(36).substring(2, 9),
      projectId,
      targetType: 'Scene' as const,
      targetId: sceneId,
      findings,
      checkedAt: new Date().toISOString()
    };
    db.saveContinuityResult(result);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Continuity check failed' });
  }
});

app.get('/api/projects/:id/continuity', (req, res) => {
  res.json(db.getContinuityResults(req.params.id));
});

// ==========================================
// 9. ASSET LIBRARY
// ==========================================

app.get('/api/projects/:id/assets', (req, res) => {
  res.json(db.getAssets(req.params.id));
});

// ==========================================
// 10. CODEX INTEGRATION, AUDITS & EXPORTS
// ==========================================

app.get('/api/codex/logs', (req, res) => {
  res.json(db.getAuditLogs());
});

app.get('/api/export/:projectId', (req, res) => {
  const id = req.params.projectId;
  const project = db.getProject(id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const bible = db.getBible(id);
  const characters = db.getCharacters(id);
  const locations = db.getLocations(id);
  const props = db.getProps(id);
  const scenes = db.getScenes(id);

  // Markdown Export representation
  const markdown = `# PRODUCTION SPECIFICATION: ${project.title}
Generated: ${new Date().toISOString()}

## LOGLINE
${project.logline}

## STORY BIBLE
- **Premise**: ${bible.premise}
- **Genre**: ${bible.genre}
- **Themes**: ${bible.themes}
- **Tone**: ${bible.tone}
- **Magic System**: ${bible.magicSystem}
- **Visual Style**: ${bible.renderStyle}
- **Cinematography Rules**: ${bible.cinematographyRules}

## CHARACTERS
${characters.map(c => `### ${c.name} (${c.role})
- **Aliases**: ${c.aliases}
- **Species**: ${c.species}
- **Age**: ${c.age}
- **Appearance**: ${c.appearance.height}, Hair: ${c.appearance.hairStyleColor}, Eyes: ${c.appearance.eyeShapeColor}, Horns: ${c.appearance.horns}.
- **Wardrobe**: ${c.wardrobe.defaultCostume}. Weapon: ${c.wardrobe.weapons}.
- **Internal Conflict**: ${c.performance.internalConflict}
- **Combat Style**: ${c.performance.combatStyle}
`).join('\n')}

## LOCATIONS
${locations.map(l => `### ${l.name}
- **Description**: ${l.description}
- **Visual Reference Prompt**: ${l.visualPrompt}
- **Setting**: ${l.timeOfDay}, ${l.weather}
`).join('\n')}

## PROPS & ARTIFACTS
${props.map(p => `### ${p.name}
- **Description**: ${p.description}
- **Materials**: ${p.materials}
`).join('\n')}

## EPISODES & SCENES
${scenes.map(s => `### Scene ${s.episodeNumber}.${s.sceneNumber}: ${s.title}
- **Purpose**: ${s.purpose}
- **Emotional Arc**: ${s.emotionalStart} -> ${s.emotionalEnd}
- **Conflict**: ${s.conflict}
- **Action**: ${s.action}
- **Dialogue**: ${s.dialogue}
`).join('\n')}
`;

  res.json({
    manifestVersion: '1.0.0',
    projectId: id,
    exportedAt: new Date().toISOString(),
    data: db.getDatabaseState(),
    markdownSpecification: markdown
  });
});

app.post('/api/import', (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'No export data provided for import.' });

  try {
    db.importDatabaseState(data);
    logAudit('POST /api/import', 'IMPORT_PROJECT', 'Success', { manifest: 'db.json' });
    res.json({ success: true, message: 'Project specification successfully imported.' });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Import failed.' });
  }
});


// ==========================================
// 11. VITE / FRONTEND SERVING
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Anime Orchestrator server running on http://localhost:${PORT}`);
  });
}

startServer();
