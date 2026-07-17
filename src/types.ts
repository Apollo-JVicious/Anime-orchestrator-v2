export type CurrentStage = 'Bible' | 'Character' | 'Scene' | 'Storyboard' | 'Shot' | 'Video' | 'Review' | 'Assembly';

export type CanonStatus = 'Draft' | 'Approved' | 'Canon Locked' | 'Disputed' | 'Retired';

export interface Project {
  id: string;
  title: string;
  coverArt: string;
  logline: string;
  currentStage: CurrentStage;
  budgetLimit: number;
  budgetSpent: number;
  recentWarningsCount: number;
  createdAt: string;
}

export interface StoryBible {
  projectId: string;
  premise: string;
  genre: string;
  themes: string;
  tone: string;
  audience: string;
  worldHistory: string;
  timeline: string;
  cultures: string;
  factions: string;
  magicSystem: string;
  mythology: string;
  techLevel: string;
  visualLanguage: string;
  colorScript: string;
  renderStyle: string;
  cinematographyRules: string;
  contentBoundaries: string;
  glossary: string;
  unstructuredNotes: string;
}

export interface Character {
  id: string;
  projectId: string;
  name: string;
  aliases: string;
  age: string;
  pronouns: string;
  species: string;
  heritage: string;
  role: string;
  affiliation: string;
  appearance: {
    height: string;
    bodyType: string;
    skinTone: string;
    faceShape: string;
    eyeShapeColor: string;
    hairStyleColor: string;
    ears: string;
    horns: string;
    scarsMarkings: string;
    hands: string;
    silhouette: string;
    features: string;
    proportionRules: string;
  };
  wardrobe: {
    defaultCostume: string;
    alternateCostumes: string;
    armor: string;
    accessories: string;
    footwear: string;
    weapons: string;
    palette: string; // comma separated hex values
    materials: string;
    damageStates: string;
  };
  performance: {
    personality: string;
    internalConflict: string;
    externalGoal: string;
    voiceQualities: string;
    speechPatterns: string;
    posture: string;
    gestures: string;
    combatStyle: string;
    expressions: string;
    relationships: string;
    secrets: string;
    arc: string;
  };
  interviewLog: { speaker: 'user' | 'assistant' | 'character'; text: string }[];
  isLocked: boolean;
  canonStatus: CanonStatus;
}

export interface CharacterReferenceSheet {
  id: string;
  characterId: string;
  name: string;
  views: {
    front: string;
    threeQuarter: string;
    side: string;
    rear: string;
    neutralPose: string;
    heightGuide: string;
    headTurnaround: string;
    facialConstruction: string;
    expressionSheet: string;
    handDetails: string;
    costumeDetails: string;
    colorPaletteHex: string[];
    materialsCallout: string;
    weaponCallout: string;
    silhouetteTest: string;
    continuityNotes: string;
  };
  createdAt: string;
  isApproved: boolean;
}

export interface CostumeAndForm {
  id: string;
  characterId: string;
  name: string;
  description: string;
  type: 'Costume' | 'Transformation' | 'Injury' | 'Emotional State' | 'Timeline appearance';
  visualPrompt: string;
  refImage: string;
  isLocked: boolean;
}

export interface Location {
  id: string;
  projectId: string;
  name: string;
  description: string;
  visualPrompt: string;
  refImage: string;
  timeOfDay: string;
  weather: string;
  canonStatus: 'Draft' | 'Approved' | 'Canon Locked';
  isLocked: boolean;
}

export interface Prop {
  id: string;
  projectId: string;
  name: string;
  description: string;
  visualPrompt: string;
  refImage: string;
  materials: string;
  canonStatus: 'Draft' | 'Approved' | 'Canon Locked';
  isLocked: boolean;
}

export interface Scene {
  id: string;
  projectId: string;
  episodeNumber: string;
  sceneNumber: string;
  title: string;
  purpose: string;
  locationId: string;
  timeOfDay: string;
  weather: string;
  charactersPresentIds: string[];
  costumesUsedIds: string[];
  propsIds: string[];
  emotionalStart: string;
  emotionalEnd: string;
  conflict: string;
  reveal: string;
  dialogue: string;
  action: string;
  continuityPrevious: string;
  requiredSetupLater: string;
  screenDurationSeconds: number;
  analysisResult: {
    literalWhatHappens: string;
    emotionalChange: string;
    purposeWhyExists: string;
    characterObjectives: string;
    subtext: string;
    expositionRisks: string;
    pacingRisks: string;
    continuityConflicts: string;
    missingVisualInfo: string;
    suggestedBeats: string[];
  } | null;
  approvedBeats: string[];
  status: 'Draft' | 'Approved' | 'Canon Locked';
}

export interface StoryboardPanel {
  id: string;
  sceneId: string;
  panelNumber: number;
  shotId: string;
  durationSeconds: number;
  shotSize: string;
  cameraAngle: string;
  lens: string;
  cameraMovement: string;
  characterBlocking: string;
  characterExpression: string;
  action: string;
  background: string;
  lighting: string;
  dialogue: string;
  soundEffects: string;
  musicCue: string;
  transition: string;
  generationPrompt: string;
  negativeConstraints: string;
  referenceAssetsIds: string[];
  generatedImage: string;
  isApproved: boolean;
  notes: string;
}

export interface ShotBuilder {
  id: string;
  projectId: string;
  name: string;
  startingFrame: string;
  endingFrame: string;
  referenceCharactersIds: string[];
  referenceLocationId: string;
  referencePropsIds: string[];
  cameraPosition: string;
  cameraMovement: string;
  subjectMovement: string;
  environmentalMovement: string;
  lighting: string;
  composition: string;
  dialogue: string;
  sound: string;
  durationSeconds: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  frameRate: number;
  styleStrength: number;
  continuityConstraints: string;
  negativeConstraints: string;
  finalPrompt: string;
}

export interface VideoClip {
  id: string;
  projectId: string;
  shotId: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
  modelUsed: string;
  sourcePrompt: string;
  resolution: string;
  isFastPreview: boolean;
  createdAt: string;
}

export interface VideoTimelineTrack {
  video: { clipId: string; start: number; duration: number }[];
  dialogue: { id: string; text: string; start: number; duration: number }[];
  music: { id: string; url: string; start: number; duration: number }[];
  soundEffects: { id: string; url: string; start: number; duration: number }[];
}

export interface VideoTimeline {
  projectId: string;
  tracks: VideoTimelineTrack;
}

export interface Asset {
  id: string;
  projectId: string;
  name: string;
  type: 'Reference' | 'Image' | 'CharacterSheet' | 'ExpressionSheet' | 'Location' | 'Prop' | 'Storyboard' | 'Video' | 'Audio' | 'Script';
  url: string;
  metadata: {
    modelUsed?: string;
    sourcePrompt?: string;
    seed?: string;
    referencesUsed?: string[];
    associatedId?: string;
    version: number;
    approvalStatus: CanonStatus;
    parentId?: string;
    notes?: string;
  };
  createdAt: string;
}

export interface ContinuityFinding {
  id: string;
  type:
    | 'Wrong costume for timeline'
    | 'Incorrect injury state'
    | 'Character knowledge mismatch'
    | 'Location mismatch'
    | 'Missing prop'
    | 'Incorrect time of day'
    | 'Visual identity drift'
    | 'Contradiction with locked lore'
    | 'Emotional discontinuity'
    | 'Broken screen direction'
    | 'Unexplained transformation'
    | 'Dialogue inconsistent with voice';
  severity: 'Critical contradiction' | 'Likely inconsistency' | 'Creative choice' | 'Minor visual drift';
  message: string;
}

export interface ContinuityCheckResult {
  id: string;
  projectId: string;
  targetType: 'Scene' | 'Storyboard' | 'Image' | 'Video';
  targetId: string;
  findings: ContinuityFinding[];
  checkedAt: string;
}

export interface CodexAuditLog {
  id: string;
  timestamp: string;
  endpoint: string;
  action: string;
  result: string;
  payload: string;
}
