import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import { createServer as createViteServer } from 'vite';
import { db, DBStructure } from './server/db';
import {
  createIntegrationRouter,
  legacyReadGuard,
  legacyWriteGuard,
  requireIntegrationAdmin,
} from './server/integrations/routes';
import { createMcpRouter } from './server/mcp/http';
import { 
  extractStoryBibleFields, 
  runCharacterInterview, 
  compareVisualAssets, 
  analyzeRoughScene, 
  generateStoryboardPanels, 
  runContinuityChecker 
} from './server/gemini';
import { Project, StoryBible, Character, Location, Prop, Scene, StoryboardPanel, ShotBuilder } from './src/types';

export const app = express();
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || (
  process.env.NODE_ENV !== 'production' && process.env.ALLOW_INSECURE_LOCAL_API === 'true'
    ? '127.0.0.1'
    : '0.0.0.0'
);
const TRUST_PROXY_HOPS = Math.max(0, Number.parseInt(process.env.TRUST_PROXY_HOPS || '0', 10) || 0);

if (TRUST_PROXY_HOPS > 0) app.set('trust proxy', TRUST_PROXY_HOPS);

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        ...(process.env.NODE_ENV === 'production' ? [] : ["'unsafe-inline'", "'unsafe-eval'"]),
      ],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      mediaSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", ...(process.env.NODE_ENV === 'production' ? [] : ['ws:', 'wss:'])],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

const allowedOrigins = new Set(
  [
    process.env.PUBLIC_BASE_URL,
    ...(process.env.ALLOWED_ORIGINS || '').split(','),
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`
  ]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value))
    .map(value => value.replace(/\/$/, ''))
);

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed.'));
  }
}));

app.use((req, res, next) => {
  const requestId = req.header('x-request-id')?.slice(0, 128) || randomUUID();
  res.setHeader('x-request-id', requestId);
  res.locals.requestId = requestId;
  next();
});

app.use('/mcp', createMcpRouter());

app.use(express.json({ limit: '10mb' }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'anime-orchestrator', version: '0.1.0' });
});

app.use('/api/integrations', createIntegrationRouter());
app.use('/api/export', requireIntegrationAdmin);
app.use('/api/codex/logs', requireIntegrationAdmin);
app.use('/api', legacyReadGuard);
app.use('/api', legacyWriteGuard);

// Audit log helper
function logAudit(endpoint: string, action: string, result: string, payload: any) {
  db.addAuditLog(endpoint, action, result, JSON.stringify(payload));
}

function validateImportDatabase(value: unknown): DBStructure {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Import data must be a database object.');
  }
  const record = value as Record<string, unknown>;
  const requiredArrays: Array<keyof DBStructure> = [
    'projects', 'bibles', 'characters', 'costumes', 'locations', 'props', 'scenes',
    'storyboardPanels', 'shotBuilders', 'videoClips', 'timelines', 'assets',
    'continuityResults', 'auditLogs',
  ];
  for (const key of requiredArrays) {
    if (!Array.isArray(record[key])) throw new Error(`Import field ${key} must be an array.`);
  }
  const assertUniqueIds = (key: keyof DBStructure) => {
    const seen = new Set<string>();
    for (const item of record[key] as Array<Record<string, unknown>>) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) {
        throw new Error(`Every ${key} record must have a non-empty immutable ID.`);
      }
      if (seen.has(item.id)) throw new Error(`Duplicate ${key} ID: ${item.id}`);
      seen.add(item.id);
    }
  };
  for (const key of [
    'projects', 'characters', 'costumes', 'locations', 'props', 'scenes',
    'storyboardPanels', 'shotBuilders', 'videoClips', 'assets', 'continuityResults', 'auditLogs',
  ] as Array<keyof DBStructure>) {
    assertUniqueIds(key);
  }
  return JSON.parse(JSON.stringify(value)) as DBStructure;
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
  if (db.getProject(id)) return res.status(409).json({ error: 'A project with this ID already exists.' });
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
  res.status(201).json(newProject);
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
  character.isLocked = false;
  character.canonStatus = 'Draft';
  if (db.getCharacter(character.id)) {
    return res.status(409).json({ error: 'A character with this immutable ID already exists.' });
  }
  db.saveCharacter(character);
  logAudit(`POST /api/projects/${req.params.id}/characters`, 'CREATE_CHARACTER', 'Success', { id: character.id, name: character.name });
  res.json(character);
});

app.put('/api/characters/:id', (req, res) => {
  const existing = db.getCharacter(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Character not found' });
  if (existing.isLocked || existing.canonStatus === 'Canon Locked') {
    return res.status(409).json({ error: 'Locked canon cannot be overwritten. Create a canon-change proposal.' });
  }
  const character: Character = {
    ...(req.body as Character),
    id: existing.id,
    projectId: existing.projectId,
    isLocked: existing.isLocked,
    canonStatus: existing.canonStatus,
  };
  db.saveCharacter(character);
  logAudit(`PUT /api/characters/${req.params.id}`, 'UPDATE_CHARACTER', 'Success', { id: character.id });
  res.json(character);
});

app.post('/api/characters/:id/lock', (req, res) => {
  const char = db.getCharacter(req.params.id);
  if (!char) return res.status(404).json({ error: 'Character not found' });
  if (char.isLocked || char.canonStatus === 'Canon Locked') return res.json(char);
  char.isLocked = true;
  char.canonStatus = 'Canon Locked';
  db.saveCharacter(char);
  logAudit(`POST /api/characters/${req.params.id}/lock`, 'LOCK_CANON', 'Success', { id: char.id, isLocked: char.isLocked });
  res.json(char);
});

app.post('/api/characters/:id/interview', async (req, res) => {
  const char = db.getCharacter(req.params.id);
  if (!char) return res.status(404).json({ error: 'Character not found' });

  const { message, history } = req.body;
  try {
    const reply = await runCharacterInterview(char, history || [], message);
    const interviewLog = [...(history || [])];
    interviewLog.push({ speaker: 'user', text: message });
    interviewLog.push({ speaker: 'character', text: reply });
    const canPersist = !char.isLocked && char.canonStatus !== 'Canon Locked';
    if (canPersist) {
      char.interviewLog = interviewLog;
      db.saveCharacter(char);
    }

    res.json({ reply, interviewLog, persisted: canPersist });
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
  loc.isLocked = false;
  loc.canonStatus = 'Draft';
  if (db.getDatabaseState().locations.some(item => item.id === loc.id)) {
    return res.status(409).json({ error: 'A location with this immutable ID already exists.' });
  }
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
  pr.isLocked = false;
  pr.canonStatus = 'Draft';
  if (db.getDatabaseState().props.some(item => item.id === pr.id)) {
    return res.status(409).json({ error: 'A prop with this immutable ID already exists.' });
  }
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
  scene.status = 'Draft';
  if (db.getScene(scene.id)) {
    return res.status(409).json({ error: 'A scene with this immutable ID already exists.' });
  }
  db.saveScene(scene);
  res.json(scene);
});

app.put('/api/scenes/:id', (req, res) => {
  const existing = db.getScene(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Scene not found' });
  if (existing.status === 'Approved' || existing.status === 'Canon Locked') {
    return res.status(409).json({ error: 'Approved or locked scenes cannot be overwritten. Create a scene draft.' });
  }
  const scene: Scene = {
    ...(req.body as Scene),
    id: existing.id,
    projectId: existing.projectId,
    status: existing.status,
  };
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
    if (scene.status === 'Draft') {
      scene.analysisResult = feedback;
      db.saveScene(scene);
    }
    logAudit(`POST /api/scenes/${req.params.id}/analyze`, 'ANALYZE_SCENE', 'Success', { id: scene.id });
    res.json(feedback);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Scene analysis failed' });
  }
});

app.post('/api/scenes/:id/storyboard/generate', async (req, res) => {
  const scene = db.getScene(req.params.id);
  if (!scene) return res.status(404).json({ error: 'Scene not found' });
  if (db.getStoryboardPanels(scene.id).some(panel => panel.isApproved)) {
    return res.status(409).json({ error: 'Approved storyboard panels cannot be overwritten by generation.' });
  }

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
  if (!Array.isArray(panels) || panels.some(panel => panel.sceneId !== req.params.id)) {
    return res.status(400).json({ error: 'Every storyboard panel must belong to the requested scene.' });
  }
  const approvedIds = new Set(
    db.getStoryboardPanels(req.params.id).filter(panel => panel.isApproved).map(panel => panel.id),
  );
  if (panels.some(panel => approvedIds.has(panel.id))) {
    return res.status(409).json({ error: 'Approved storyboard panels cannot be overwritten. Create a new panel version.' });
  }
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
// 7. VIDEO GENERATION (development-only legacy simulator)
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
  if (process.env.ALLOW_SIMULATED_GENERATION !== 'true' || process.env.NODE_ENV === 'production') {
    return res.status(503).json({
      error:
        'The legacy stock-video simulator is disabled. Use the reviewed generation-job workflow after a real provider worker is connected.',
    });
  }
  const { projectId, prompt, isFastPreview, shotId } = req.body;
  const jobId = 'job-' + Math.random().toString(36).substring(2, 9);

  // Simulated progress for explicit local UI testing only.
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
        // Assign stock placeholders; these are never real provider output.
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

  const state = db.getDatabaseState();
  const characterIds = new Set(characters.map(character => character.id));
  const sceneIds = new Set(scenes.map(scene => scene.id));
  res.json({
    manifestVersion: '1.0.0',
    projectId: id,
    exportedAt: new Date().toISOString(),
    data: {
      projects: [project],
      bibles: state.bibles.filter(item => item.projectId === id),
      characters,
      costumes: state.costumes.filter(item => characterIds.has(item.characterId)),
      locations,
      props,
      scenes,
      storyboardPanels: state.storyboardPanels.filter(item => sceneIds.has(item.sceneId)),
      shotBuilders: state.shotBuilders.filter(item => item.projectId === id),
      videoClips: state.videoClips.filter(item => item.projectId === id),
      timelines: state.timelines.filter(item => item.projectId === id),
      assets: state.assets.filter(item => item.projectId === id),
      continuityResults: state.continuityResults.filter(item => item.projectId === id),
      auditLogs: [],
    },
    markdownSpecification: markdown
  });
});

app.post('/api/import', (req, res) => {
  const { data, confirmation, lockedCanonConfirmation } = req.body;
  if (!data) return res.status(400).json({ error: 'No export data provided for import.' });
  if (confirmation !== 'REPLACE LOCAL DATABASE') {
    return res.status(400).json({ error: 'Type REPLACE LOCAL DATABASE to confirm this destructive import.' });
  }
  const state = db.getDatabaseState();
  const hasLockedCanon =
    state.characters.some(item => item.isLocked || item.canonStatus === 'Canon Locked') ||
    state.locations.some(item => item.isLocked || item.canonStatus === 'Canon Locked') ||
    state.props.some(item => item.isLocked || item.canonStatus === 'Canon Locked') ||
    state.scenes.some(item => item.status === 'Canon Locked') ||
    state.storyboardPanels.some(item => item.isApproved);
  if (hasLockedCanon && lockedCanonConfirmation !== 'REPLACE LOCKED CANON') {
    return res.status(409).json({ error: 'Type REPLACE LOCKED CANON to confirm replacement of approved or locked records.' });
  }

  try {
    db.importDatabaseState(validateImportDatabase(data));
    logAudit('POST /api/import', 'IMPORT_PROJECT', 'Success', { manifest: 'db.json' });
    res.json({ success: true, message: 'Project specification successfully imported.' });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Import failed.' });
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const message = error instanceof Error ? error.message : '';
  if (message === 'Origin is not allowed.') {
    res.status(403).json({ error: 'Origin is not allowed.' });
    return;
  }
  const bodyError = error as { type?: string; status?: number };
  if (bodyError.type === 'entity.too.large' || bodyError.status === 413) {
    res.status(413).json({ error: 'Request body is too large.' });
    return;
  }
  console.error(`[${res.locals.requestId || 'no-request-id'}] Request failed.`);
  res.status(500).json({ error: 'The request could not be completed.' });
});


// ==========================================
// 11. VITE / FRONTEND SERVING
// ==========================================

export async function startServer() {
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

  app.listen(PORT, HOST, () => {
    console.log(`Anime Orchestrator server running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch(error => {
    console.error('Failed to start Anime Orchestrator:', error);
    process.exitCode = 1;
  });
}
