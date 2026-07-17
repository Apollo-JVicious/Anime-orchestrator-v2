import fs from 'fs';
import path from 'path';
import { 
  Project, StoryBible, Character, CostumeAndForm, Location, Prop, 
  Scene, StoryboardPanel, ShotBuilder, VideoClip, VideoTimeline, Asset, 
  ContinuityCheckResult, CodexAuditLog 
} from '../src/types';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'db.json');

export interface DBStructure {
  projects: Project[];
  bibles: StoryBible[];
  characters: Character[];
  costumes: CostumeAndForm[];
  locations: Location[];
  props: Prop[];
  scenes: Scene[];
  storyboardPanels: StoryboardPanel[];
  shotBuilders: ShotBuilder[];
  videoClips: VideoClip[];
  timelines: VideoTimeline[];
  assets: Asset[];
  continuityResults: ContinuityCheckResult[];
  auditLogs: CodexAuditLog[];
}

export const initialDB: DBStructure = {
  projects: [
    {
      id: 'crimson-sword',
      title: 'The Legend of the Crimson Sword and the Sun Shield',
      coverArt: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
      logline: 'An epic generation-spanning saga of heroes bound to elemental spirits battling an ancient cycle of deception.',
      currentStage: 'Bible',
      budgetLimit: 50.00,
      budgetSpent: 0.00,
      recentWarningsCount: 3,
      createdAt: new Date('2026-07-16T07:50:00Z').toISOString()
    }
  ],
  bibles: [
    {
      projectId: 'crimson-sword',
      premise: 'A world where heroic bloodlines can bond with elemental spirit beings (often demonized) to prevent the total collapse of the sky-dome.',
      genre: 'Epic Fantasy, Dark Fantasy, Shonen',
      themes: 'Cycles of deception, duty vs self-determination, reconciliation with the feared "Other".',
      tone: 'Cinematic, urgent, emotionally rich, grounded.',
      audience: 'Teens & young adults who enjoy lore-heavy narrative arcs and intense, fluid action.',
      worldHistory: 'One thousand years ago, the Crimson Dragon (a misunderstanding of a benevolent demon-beast) stopped the collapse of the sun. The world was split, creating a cyclic conflict where a hero appears every millennium.',
      timeline: 'Year 0: Reign of the Crimson Sword.\nYear 1000: Reign of the Sun Shield.\nYear 2026: The current crisis.',
      cultures: 'Elves of the Sky-Dome, Dragonfolk of the Ash Spires, Spirit-Bound Humans.',
      factions: 'The Order of the Sun, Crimson Dragon Loyals.',
      magicSystem: 'Spirit bonding: fusing with spirit entities to channel fire or stellar light through sacred artifacts.',
      mythology: 'The Crimson Dragon is commonly feared as the Arch-Demon, but is in fact the world’s silent warden.',
      techLevel: 'Feudal steampunk: brass windmills, sword crafts, magical water turbines.',
      visualLanguage: 'Cel-shaded, crisp lines, rich gradients. Sky elements should feel vast.',
      colorScript: 'Muted charcoal backgrounds contrasted by intense, saturated crimson sparks and glowing amber sunshields.',
      renderStyle: 'Grounded realism in background textures, combined with clean, classic cel-shaded key-frame animation.',
      cinematographyRules: 'Wide-angle landscape frames to emphasize the massive sky-dome; low-angle sword fights; heavy dynamic contrast.',
      contentBoundaries: 'Gore is stylized (crimson light or ink-strokes); emotional intensity is kept high but clean.',
      glossary: 'Crimson Dragon: Spirit of fire.\nSun Shield: The celestial Aegis.\nAria: Spark-bearer.',
      unstructuredNotes: 'Aria has elven ears but also small sleek horns. She is conflicted about her draconic lineage. The village treats her like a demon child because of her crimson-tipped hair, which actually matches the color of the historic Crimson Sword. There was once an earlier male hero who wielded the Crimson Sword. Now Aria is the female hero destined to wield the Sun Shield, but she feels drawn to the sword!'
    }
  ],
  characters: [
    {
      id: 'aria',
      projectId: 'crimson-sword',
      name: 'Aria',
      aliases: 'The Demon-Cursed Spark, Child of the Ash Spire',
      age: '19',
      pronouns: 'she/her',
      species: 'Half-Dragonfolk',
      heritage: 'Daughter of an Elven Scholar and an Ash Dragon general',
      role: 'Protagonist, destined Shieldbearer of the Sun',
      affiliation: 'Independent / Ash Spires outlaw',
      appearance: {
        height: '168 cm',
        bodyType: 'Sleek, athletic with high agility',
        skinTone: 'Fair, pale cream with subtle opalescent scales on her temples',
        faceShape: 'Sharp chin, high cheekbones, expressive eyes',
        eyeShapeColor: 'Wide, intense crimson-red eyes that glow when channeling fire',
        hairStyleColor: 'Long blonde hair transitioning into sharp crimson-red tips, tied back loosely',
        ears: 'Elven-like long, tapered pointed ears',
        horns: 'Two subtle, sleek obsidian-black horns curving back along her hairline',
        scarsMarkings: 'Slight starburst fire-brand scar on her left palm',
        hands: 'Slender fingers, obsidian scaled nails',
        silhouette: 'Distinctive cloak silhouette flared with fire-torn edges',
        features: 'The contrasting blonde hair with bright red ends and subtle horns',
        proportionRules: '7.5 heads high, dynamic torso-to-limb ratio for athletic combat posing'
      },
      wardrobe: {
        defaultCostume: 'Heavy traveling dark gray cloak, crimson inner lining, ash-dyed tunic',
        alternateCostumes: 'Sun Acolyte ceremonial whites, ash spires combat leather',
        armor: 'Lightweight laminated leather spaulders and gauntlets',
        accessories: 'A broken dragon-crest medallion around her neck',
        footwear: 'High ash-resistant travelers boots with steel buckles',
        weapons: 'The Sun Shield (ceremonial golden disk) and her rusty dagger',
        palette: '#dc2626, #fbbf24, #1e293b, #f8fafc',
        materials: 'Coarse woven linen, scaled dragon-leather, forged bronze',
        damageStates: 'Cloak torn and scorched at the bottom from dragon fire'
      },
      performance: {
        personality: 'Quietly resilient, deeply introspective, stubborn but holds immense compassion',
        internalConflict: 'Fears she is destined to become the demon monster her village believes she is, while holding the power to save them.',
        externalGoal: 'Reach the Solar Citadel to unlock the Sun Shield and prove her lineage.',
        voiceQualities: 'Soft-spoken but carrying clear weight and resolve, medium-low pitch',
        speechPatterns: 'Deliberate, rare use of contractions, pauses before speaking of her father',
        posture: 'Slightly defensive, shoulders squared, hands resting close to her weapons or cloak',
        gestures: 'Tucks her hair behind her pointed ear when anxious; grips her left hand to cover the scar',
        combatStyle: 'Acrobatic defense-to-offense, utilizing the Sun Shield to reflect fire blasts and redirect force',
        expressions: 'Ranges from stoic, focused neutrality to intense, fire-lit fierce determination',
        relationships: 'Daughter of Lyra (deceased scholar); mentored by Kaelen (elder spirit smith)',
        secrets: 'She can hear the voice of the sealed Crimson Dragon in her dreams.',
        arc: 'From a feared outcast seeking approval to a self-determined leader who embraces both dragon and sun.'
      },
      interviewLog: [
        { speaker: 'assistant', text: 'Welcome to the Casting & Character Interview, Aria. How are you feeling about the destiny laid before you?' },
        { speaker: 'character', text: 'Destiny? They call it a blessing, but they hand me a shield and expect me to burn for them. I will protect this world, but on my own terms.' }
      ],
      isLocked: false,
      canonStatus: 'Draft'
    }
  ],
  costumes: [
    {
      id: 'aria-traveler',
      characterId: 'aria',
      name: 'Ash Wanderer Cloak',
      description: 'Heavy ash-stained travelers cloak with high leather collar and tattered crimson hem.',
      type: 'Costume',
      visualPrompt: 'Aria in dark charcoal travel cloak with a high collar, elven ears, crimson hair-tips, holding a worn staff, anime cel-shaded style.',
      refImage: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
      isLocked: true
    },
    {
      id: 'aria-sun-form',
      characterId: 'aria',
      name: 'Dawnbreaker Awakening',
      description: 'Golden scale armor with angelic sun rays radiating behind her shoulders.',
      type: 'Transformation',
      visualPrompt: 'Aria anime transformation scene, hair fully glowing gold, eyes brilliant red, golden celestial energy plates around her arms, highly dramatic action pose.',
      refImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
      isLocked: false
    }
  ],
  locations: [
    {
      id: 'citadel',
      projectId: 'crimson-sword',
      name: 'The Solar Citadel',
      description: 'An ancient fortress built on top of a dormant volcano, featuring massive mirrors reflecting the light of the Sky-Dome.',
      visualPrompt: 'Massive white-marble citadel on a steep peak, giant sun-reflecting brass lenses, high-contrast morning light, cinematic anime background.',
      refImage: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
      timeOfDay: 'Morning',
      weather: 'Crisp, high visibility, golden fog',
      canonStatus: 'Approved',
      isLocked: false
    }
  ],
  props: [
    {
      id: 'sun-shield',
      projectId: 'crimson-sword',
      name: 'Aegis of the Solar Dawn',
      description: 'A circular shield forged from solar-bronze, carved with wings of the phoenix. The centerpiece glows with solar fire when activated.',
      visualPrompt: 'A glowing golden circular shield, intricate phoenix wing engravings, burning amber core, cel-shaded anime prop sheet.',
      refImage: 'https://images.unsplash.com/photo-1618336753974-aae8e04506aa?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
      materials: 'Sun-bronze, volcanic core glass, spirit-bound gems',
      canonStatus: 'Canon Locked',
      isLocked: true
    }
  ],
  scenes: [
    {
      id: 'scene-1',
      projectId: 'crimson-sword',
      episodeNumber: '1',
      sceneNumber: '1',
      title: 'Morning After the Crimson',
      purpose: 'Establish Aria’s loneliness, her secret connection to the Crimson Dragon, and her discovery of the destination to the Solar Citadel.',
      locationId: 'citadel',
      timeOfDay: 'Morning',
      weather: 'Foggy golden sunrise',
      charactersPresentIds: ['aria'],
      costumesUsedIds: ['aria-traveler'],
      propsIds: ['sun-shield'],
      emotionalStart: 'Melancholy, anxious',
      emotionalEnd: 'Fierce resolve, hopeful',
      conflict: 'The village guards search for her, forcing her to flee with the incomplete Shield.',
      reveal: 'The Shield triggers a compass light pointing to the Solar Citadel when Aria’s tear hits the core.',
      dialogue: 'Aria: "You fear what you do not know... but I will make you see."',
      action: 'Aria climbs the ash ridge as the morning sun cuts through the crimson haze, looking back at the smoking ruins of her sanctuary.',
      continuityPrevious: 'The ash spires were attacked by the shadow crawlers in the night, Aria barely escaped.',
      requiredSetupLater: 'The compass coordinates point to the volcano crater where she meets her mentor.',
      screenDurationSeconds: 45,
      analysisResult: {
        literalWhatHappens: 'Aria climbs the ash ridge looking back at her home, grips the shield, triggers the ancient compass, and resolves to travel to the Solar Citadel.',
        emotionalChange: 'From despair to determination.',
        purposeWhyExists: 'Establish character motivation, visual setting, and inciting journey indicator.',
        characterObjectives: 'Find a safe haven, unlock the shield’s mystery.',
        subtext: 'The shield is her curse but also her salvation.',
        expositionRisks: 'Explaining why she is exiled too quickly in dialogue; let her physical scale and scars show it.',
        pacingRisks: 'Too slow of a sunrise; need to inject the urgency of the search party.',
        continuityConflicts: 'Shield shouldn’t be fully awake yet; only a faint compass glow is allowed.',
        missingVisualInfo: 'Details of the ash ridge cliffs and the village below.',
        suggestedBeats: [
          'High wide shot of Aria looking over the misty ash canyon.',
          'Close-up of her eyes reflecting the gold light.',
          'Detail shot of her scaled hand gripping the tattered cloak.',
          'Medium shot as she pulls out the brass circular Aegis.',
          'The shield remains dark, she whispers in disappointment.',
          'Sound of horns in the distance—guards are approaching.',
          'A tear of frustration falls from her cheek onto the center prism.',
          'The sun-bronze tracks align with a heavy, clicking whir.',
          'A brilliant amber light ray shoots out from the core, painting a dynamic star map.',
          'Aria gazes in awe at the map pointing to the volcanic peaks.',
          'She pulls her hood up, her crimson hair-tips fluttering in the mountain breeze.',
          'Fades out as she leaps down the ash-chute into the fog.'
        ]
      },
      approvedBeats: [
        'High wide shot of Aria looking over the misty ash canyon.',
        'Close-up of her eyes reflecting the gold light.',
        'Detail shot of her scaled hand gripping the tattered cloak.',
        'Medium shot as she pulls out the brass circular Aegis.',
        'The shield remains dark, she whispers in disappointment.',
        'Sound of horns in the distance—guards are approaching.',
        'A tear of frustration falls from her cheek onto the center prism.',
        'The sun-bronze tracks align with a heavy, clicking whir.',
        'A brilliant amber light ray shoots out from the core, painting a dynamic star map.',
        'Aria gazes in awe at the map pointing to the volcanic peaks.',
        'She pulls her hood up, her crimson hair-tips fluttering in the mountain breeze.',
        'Fades out as she leaps down the ash-chute into the fog.'
      ],
      status: 'Approved'
    }
  ],
  storyboardPanels: [
    {
      id: 'panel-1',
      sceneId: 'scene-1',
      panelNumber: 1,
      shotId: 'shot-101',
      durationSeconds: 3.5,
      shotSize: 'Extreme Wide Shot (EWS)',
      cameraAngle: 'High Angle',
      lens: '24mm Wide-Angle',
      cameraMovement: 'Slow crane down',
      characterBlocking: 'Aria stands small in the bottom right corner, facing left toward the massive foggy canyon.',
      characterExpression: 'Stoic, hair blowing across her eyes',
      action: 'Aria watches the smoking embers of her homeland below.',
      background: 'The valley of Ash Spires, covered in golden morning fog. Steaming hot springs.',
      lighting: 'Golden hour, backlit, high contrast silhouettes.',
      dialogue: '(Silence - Wind howling)',
      soundEffects: 'Soughing wind, distant geyser steam hiss.',
      musicCue: 'Soft, melancholic solo violin starts.',
      transition: 'Cut',
      generationPrompt: 'Anime high-angle wide shot, a girl Aria with blonde hair and red tips standing on a dark volcanic mountain ash ridge overlooking a massive canyon filled with gold morning mist, medieval fantasy world, cel-shaded, masterpiece, production art, studio ghibli layout.',
      negativeConstraints: '3d render, modern city, digital interface, photo, low quality.',
      referenceAssetsIds: ['aria-traveler', 'citadel'],
      generatedImage: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
      isApproved: true,
      notes: 'Sets the scale of her isolation perfectly.'
    },
    {
      id: 'panel-2',
      sceneId: 'scene-1',
      panelNumber: 2,
      shotId: 'shot-102',
      durationSeconds: 2.5,
      shotSize: 'Close-Up (CU)',
      cameraAngle: 'Eye Level',
      lens: '85mm Portrait',
      cameraMovement: 'Static',
      characterBlocking: 'Tight focus on Aria’s face. She blinks slowly.',
      characterExpression: 'Vulnerable but resolute, eyebrows furrowed slightly.',
      action: 'Golden light catches her crimson eyes.',
      background: 'Out-of-focus misty orange sky.',
      lighting: 'Warm side-light, highlighting elven pointed ears and sleek black horns.',
      dialogue: 'Aria: "They really think a shield makes me their savior..."',
      soundEffects: 'Slight crunch of gravel.',
      musicCue: 'Violin transitions into low cellos.',
      transition: 'Cut',
      generationPrompt: 'Anime portrait of Aria, blonde hair with red tips, crimson red eyes, pointed elven ears, sleek curved black horns, golden lighting from side, gorgeous classic cel-shaded details.',
      negativeConstraints: 'photorealistic, deformed face, blue eyes, hat.',
      referenceAssetsIds: ['aria-traveler'],
      generatedImage: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
      isApproved: true,
      notes: 'Character face anchor.'
    }
  ],
  shotBuilders: [
    {
      id: 'shot-101',
      projectId: 'crimson-sword',
      name: 'Ash Ridge EWS',
      startingFrame: '001',
      endingFrame: '084',
      referenceCharactersIds: ['aria'],
      referenceLocationId: 'citadel',
      referencePropsIds: [],
      cameraPosition: 'Ash ridge edge, 10m back',
      cameraMovement: 'Slow tracking slide right',
      subjectMovement: 'Cloak flutters, slight posture shift',
      environmentalMovement: 'Mist rolling slowly through canyon',
      lighting: 'High-contrast backlight, dawn sun bursting through mountain spires',
      composition: 'Golden spiral centered on the sun rise, subject on the first-third vertical',
      dialogue: 'None',
      sound: 'Wind, far horn',
      durationSeconds: 3.5,
      aspectRatio: '16:9',
      frameRate: 24,
      styleStrength: 85,
      continuityConstraints: 'Cloak must remain tattered charcoal, blonde hair with red tips.',
      negativeConstraints: 'modern artifacts, hyperrealism, saturated purple sky',
      finalPrompt: 'Anime tracking shot, EWS, Aria on volcanic ash ridge overlooking canyon of golden morning mist, classic cel-shaded style, dawn light burst.'
    }
  ],
  videoClips: [
    {
      id: 'clip-101',
      projectId: 'crimson-sword',
      shotId: 'shot-101',
      title: 'Ash Ridge EWS - Fast Preview',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-foggy-green-mountains-under-the-clouds-40292-large.mp4', // gorgeous placeholder clip
      thumbnailUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&auto=format&fit=crop&q=60',
      durationSeconds: 3.5,
      modelUsed: 'veo-3.1-lite-generate-preview',
      sourcePrompt: 'Anime tracking shot, EWS, Aria on volcanic ash ridge overlooking canyon of golden morning mist, classic cel-shaded style, dawn light burst.',
      resolution: '720p',
      isFastPreview: true,
      createdAt: new Date('2026-07-16T07:50:00Z').toISOString()
    }
  ],
  timelines: [
    {
      projectId: 'crimson-sword',
      tracks: {
        video: [{ clipId: 'clip-101', start: 0, duration: 3.5 }],
        dialogue: [{ id: 'd1', text: 'Silence', start: 0, duration: 3.5 }],
        music: [{ id: 'm1', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', start: 0, duration: 3.5 }],
        soundEffects: [{ id: 's1', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', start: 0, duration: 3.5 }]
      }
    }
  ],
  assets: [
    {
      id: 'asset-1',
      projectId: 'crimson-sword',
      name: 'Aria Default Character Concept',
      type: 'CharacterSheet',
      url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=60',
      metadata: {
        modelUsed: 'gemini-3.1-flash-lite-image',
        sourcePrompt: 'Anime visual reference for Aria half-dragonfolk girl, blonde hair with red tips, red eyes, subtle horns, elven ears, tattered charcoal travel cloak, high contrast background.',
        seed: '99841',
        version: 1,
        approvalStatus: 'Approved'
      },
      createdAt: new Date('2026-07-16T07:50:00Z').toISOString()
    }
  ],
  continuityResults: [
    {
      id: 'cr-1',
      projectId: 'crimson-sword',
      targetType: 'Scene',
      targetId: 'scene-1',
      findings: [
        {
          id: 'f-1',
          type: 'Contradiction with locked lore',
          severity: 'Critical contradiction',
          message: 'Scene mentions the Sun Shield glows brilliantly. Story Bible specifies the Aegis core requires a solar awakening ritual at the Solar Citadel, and remains inactive until then.'
        },
        {
          id: 'f-2',
          type: 'Wrong costume for timeline',
          severity: 'Creative choice',
          message: 'Aria uses the Ash Wanderer Cloak. Confirm if she has already torn the hem or if this is the clean state before escaping.'
        }
      ],
      checkedAt: new Date('2026-07-16T07:50:00Z').toISOString()
    }
  ],
  auditLogs: [
    {
      id: 'log-1',
      timestamp: new Date('2026-07-16T07:50:00Z').toISOString(),
      endpoint: 'GET /api/projects/crimson-sword/canon',
      action: 'INITIAL_PROJECT_BOOTSTRAP',
      result: 'Success',
      payload: '{}'
    }
  ]
};

function cloneDatabase(value: DBStructure): DBStructure {
  return JSON.parse(JSON.stringify(value)) as DBStructure;
}

export class LocalDatabase {
  private db: DBStructure;
  private lastPersisted: DBStructure;

  constructor() {
    this.db = cloneDatabase(initialDB);
    this.lastPersisted = cloneDatabase(this.db);
    this.ensureDatabaseExists();
  }

  private ensureDatabaseExists() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_PATH)) {
        const fileContent = fs.readFileSync(DB_PATH, 'utf-8');
        this.db = JSON.parse(fileContent);
        this.lastPersisted = cloneDatabase(this.db);
      } else {
        this.save();
      }
    } catch (e) {
      console.error('Error initializing database, falling back to memory database:', e);
    }
  }

  private save() {
    const temporaryPath = `${DB_PATH}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify(this.db, null, 2), 'utf-8');
      fs.renameSync(temporaryPath, DB_PATH);
      this.lastPersisted = cloneDatabase(this.db);
    } catch (e) {
      if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
      this.db = cloneDatabase(this.lastPersisted);
      throw new Error('Failed to persist the local production database.', { cause: e });
    }
  }

  // Projects
  getProjects() {
    return this.db.projects;
  }

  getProject(id: string) {
    return this.db.projects.find(p => p.id === id);
  }

  saveProject(project: Project) {
    const idx = this.db.projects.findIndex(p => p.id === project.id);
    if (idx >= 0) {
      this.db.projects[idx] = project;
    } else {
      this.db.projects.push(project);
    }
    this.save();
  }

  // Story Bible
  getBible(projectId: string) {
    let bible = this.db.bibles.find(b => b.projectId === projectId);
    if (!bible) {
      bible = {
        projectId,
        premise: '',
        genre: '',
        themes: '',
        tone: '',
        audience: '',
        worldHistory: '',
        timeline: '',
        cultures: '',
        factions: '',
        magicSystem: '',
        mythology: '',
        techLevel: '',
        visualLanguage: '',
        colorScript: '',
        renderStyle: '',
        cinematographyRules: '',
        contentBoundaries: '',
        glossary: '',
        unstructuredNotes: ''
      };
    }
    return bible;
  }

  saveBible(bible: StoryBible) {
    const idx = this.db.bibles.findIndex(b => b.projectId === bible.projectId);
    if (idx >= 0) {
      this.db.bibles[idx] = bible;
    } else {
      this.db.bibles.push(bible);
    }
    this.save();
  }

  // Characters
  getCharacters(projectId: string) {
    return this.db.characters.filter(c => c.projectId === projectId);
  }

  getCharacter(id: string) {
    return this.db.characters.find(c => c.id === id);
  }

  saveCharacter(character: Character) {
    const idx = this.db.characters.findIndex(c => c.id === character.id);
    if (idx >= 0) {
      this.db.characters[idx] = character;
    } else {
      this.db.characters.push(character);
    }
    this.save();
  }

  deleteCharacter(id: string) {
    this.db.characters = this.db.characters.filter(c => c.id !== id);
    this.save();
  }

  // Costumes and Forms
  getCostumes(characterId: string) {
    return this.db.costumes.filter(c => c.characterId === characterId);
  }

  saveCostume(costume: CostumeAndForm) {
    const idx = this.db.costumes.findIndex(c => c.id === costume.id);
    if (idx >= 0) {
      this.db.costumes[idx] = costume;
    } else {
      this.db.costumes.push(costume);
    }
    this.save();
  }

  // Locations
  getLocations(projectId: string) {
    return this.db.locations.filter(l => l.projectId === projectId);
  }

  saveLocation(location: Location) {
    const idx = this.db.locations.findIndex(l => l.id === location.id);
    if (idx >= 0) {
      this.db.locations[idx] = location;
    } else {
      this.db.locations.push(location);
    }
    this.save();
  }

  // Props
  getProps(projectId: string) {
    return this.db.props.filter(p => p.projectId === projectId);
  }

  saveProp(prop: Prop) {
    const idx = this.db.props.findIndex(p => p.id === prop.id);
    if (idx >= 0) {
      this.db.props[idx] = prop;
    } else {
      this.db.props.push(prop);
    }
    this.save();
  }

  // Scenes
  getScenes(projectId: string) {
    return this.db.scenes.filter(s => s.projectId === projectId);
  }

  getScene(id: string) {
    return this.db.scenes.find(s => s.id === id);
  }

  saveScene(scene: Scene) {
    const idx = this.db.scenes.findIndex(s => s.id === scene.id);
    if (idx >= 0) {
      this.db.scenes[idx] = scene;
    } else {
      this.db.scenes.push(scene);
    }
    this.save();
  }

  // Storyboard Panels
  getStoryboardPanels(sceneId: string) {
    return this.db.storyboardPanels.filter(p => p.sceneId === sceneId).sort((a,b) => a.panelNumber - b.panelNumber);
  }

  saveStoryboardPanel(panel: StoryboardPanel) {
    const idx = this.db.storyboardPanels.findIndex(p => p.id === panel.id);
    if (idx >= 0) {
      this.db.storyboardPanels[idx] = panel;
    } else {
      this.db.storyboardPanels.push(panel);
    }
    this.save();
  }

  saveStoryboardPanels(panels: StoryboardPanel[]) {
    panels.forEach(p => {
      const idx = this.db.storyboardPanels.findIndex(x => x.id === p.id);
      if (idx >= 0) {
        this.db.storyboardPanels[idx] = p;
      } else {
        this.db.storyboardPanels.push(p);
      }
    });
    this.save();
  }

  deleteStoryboardPanel(id: string) {
    this.db.storyboardPanels = this.db.storyboardPanels.filter(p => p.id !== id);
    this.save();
  }

  // Shot Builders
  getShotBuilders(projectId: string) {
    return this.db.shotBuilders.filter(sb => sb.projectId === projectId);
  }

  saveShotBuilder(shot: ShotBuilder) {
    const idx = this.db.shotBuilders.findIndex(sb => sb.id === shot.id);
    if (idx >= 0) {
      this.db.shotBuilders[idx] = shot;
    } else {
      this.db.shotBuilders.push(shot);
    }
    this.save();
  }

  // Video Clips
  getVideoClips(projectId: string) {
    return this.db.videoClips.filter(vc => vc.projectId === projectId);
  }

  saveVideoClip(clip: VideoClip) {
    this.db.videoClips.push(clip);
    this.save();
  }

  // Timelines
  getTimeline(projectId: string) {
    let tl = this.db.timelines.find(t => t.projectId === projectId);
    if (!tl) {
      tl = {
        projectId,
        tracks: {
          video: [],
          dialogue: [],
          music: [],
          soundEffects: []
        }
      };
    }
    return tl;
  }

  saveTimeline(timeline: VideoTimeline) {
    const idx = this.db.timelines.findIndex(t => t.projectId === timeline.projectId);
    if (idx >= 0) {
      this.db.timelines[idx] = timeline;
    } else {
      this.db.timelines.push(timeline);
    }
    this.save();
  }

  // Assets
  getAssets(projectId: string) {
    return this.db.assets.filter(a => a.projectId === projectId);
  }

  saveAsset(asset: Asset) {
    const idx = this.db.assets.findIndex(a => a.id === asset.id);
    if (idx >= 0) {
      this.db.assets[idx] = asset;
    } else {
      this.db.assets.push(asset);
    }
    this.save();
  }

  // Continuity Results
  getContinuityResults(projectId: string) {
    return this.db.continuityResults.filter(cr => cr.projectId === projectId);
  }

  saveContinuityResult(result: ContinuityCheckResult) {
    const idx = this.db.continuityResults.findIndex(cr => cr.id === result.id);
    if (idx >= 0) {
      this.db.continuityResults[idx] = result;
    } else {
      this.db.continuityResults.push(result);
    }
    this.save();
  }

  // Audit Logs
  getAuditLogs() {
    return this.db.auditLogs;
  }

  addAuditLog(endpoint: string, action: string, result: string, payload: string) {
    const log: CodexAuditLog = {
      id: 'log-' + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      endpoint,
      action,
      result,
      payload
    };
    this.db.auditLogs.unshift(log);
    // Keep last 100 logs
    if (this.db.auditLogs.length > 100) {
      this.db.auditLogs.pop();
    }
    this.save();
  }

  // Full export
  getDatabaseState(): DBStructure {
    return cloneDatabase(this.db);
  }

  importDatabaseState(state: DBStructure) {
    this.db = cloneDatabase({ ...initialDB, ...state });
    this.save();
  }
}

export const db = new LocalDatabase();
