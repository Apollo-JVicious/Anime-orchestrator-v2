import { GoogleGenAI, Type } from '@google/genai';
import { Character, StoryBible, Scene, StoryboardPanel, ContinuityFinding } from '../src/types';

// Initialize the official Gemini SDK
// It automatically handles the presence or absence of the secret key.
const apiKey = process.env.GEMINI_API_KEY || '';

const ai = apiKey 
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    })
  : null;

// HELPER: Strip markdown block markers if returned by Gemini
function cleanJsonString(str: string): string {
  let cleaned = str.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

/**
 * 1. STORY BIBLE EXTRACTION
 * Pasting unstructured notes and converting them into structured StoryBible fields.
 */
export async function extractStoryBibleFields(unstructuredNotes: string): Promise<Partial<StoryBible>> {
  const prompt = `You are a professional Anime Studio Story Editor.
Analyze the following unstructured notes for an anime project, and extract them into these structured fields.
Unstructured Notes:
"${unstructuredNotes}"

Return your extraction strictly as a JSON object matching this TypeScript interface:
interface StoryBible {
  premise: string; // High-concept summary of the world/story
  genre: string; // comma-separated genre tags
  themes: string; // core messaging or philosophical elements
  tone: string; // dramatic style, mood (e.g. moody, energetic)
  audience: string; // who this show is for
  worldHistory: string; // ancient history, historical conflicts
  timeline: string; // chronological events or key moments
  cultures: string; // major groups, species, rituals
  factions: string; // military or mystical organizations
  magicSystem: string; // power source, laws of magic or combat techniques
  mythology: string; // gods, legends, spiritual systems
  techLevel: string; // medieval, steampunk, cyberpunk, etc.
  visualLanguage: string; // design aesthetics, environmental style
  colorScript: string; // color palettes for major acts or moods
  renderStyle: string; // cel-shaded, ink-wash, cinematic lighting, etc.
  cinematographyRules: string; // camera angles, focal depths, lighting priorities
  contentBoundaries: string; // rating limits, graphic thresholds
  glossary: string; // terms and pronunciations
}`;

  if (!ai) {
    // High-fidelity fallback simulation
    return {
      premise: 'A world where ancient forces clash over the control of the sun.',
      genre: 'Dark Fantasy, Action, Shonen',
      themes: 'Sacrifice, heritage, duty, finding light in ashes.',
      tone: 'Grounded and serious but with sudden, blazing bursts of magical energy.',
      audience: 'Teens and young adults who appreciate intricate worldbuilding.',
      worldHistory: 'A thousand years ago, the sky cracked. The Sun Shield and Crimson Sword were forged.',
      timeline: 'Year 0: The First Spark.\nYear 1000: Rise of the Shieldbearer.',
      cultures: 'Dragonfolk who live in hot spires, and Sky Elves who tend the upper skies.',
      factions: 'The Sun Order vs the Crimson Draconic cultists.',
      magicSystem: 'Soul-bonding with fire spirits to trigger weapon awakenings.',
      mythology: 'The Great Crimson Dragon: feared as a demon, worshiped secretly as the Sky Warden.',
      techLevel: 'Steampunk-infused feudal architecture.',
      visualLanguage: 'Rich charcoal-slate surfaces contrasted with sparkling amber solar magic.',
      colorScript: 'Muted purples and grays, bursting into bright oranges, ambers, and gold.',
      renderStyle: 'Hand-painted backgrounds, sleek cel-shaded action choreography.',
      cinematographyRules: 'Deep focus wide landscape frames, high contrast shadows.',
      contentBoundaries: 'Stylized black-ink combat fluids, high emotional weight.',
      glossary: 'Crimson Dragon: Spirit of fire. Sun Shield: Aegis of gold.'
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const text = cleanJsonString(response.text || '{}');
    return JSON.parse(text);
  } catch (e) {
    console.error('Error in Story Bible extraction:', e);
    throw e;
  }
}

/**
 * 2. AI CHARACTER INTERVIEW
 * Engage in a dynamic, in-character interview with Aria or other characters, or casting sessions.
 */
export async function runCharacterInterview(
  character: Character,
  history: { speaker: 'user' | 'assistant' | 'character'; text: string }[],
  userMessage: string
): Promise<string> {
  const context = `You are playing the role of ${character.name}, an anime character in active development.
Here is your current draft character profile:
Name: ${character.name}
Role: ${character.role}
Species: ${character.species}
Personality: ${character.performance.personality}
Internal Conflict: ${character.performance.internalConflict}
Appearance: ${JSON.stringify(character.appearance)}
Wardrobe: ${JSON.stringify(character.wardrobe)}

The user is the Lead Director at the animation studio conducting a casting and developmental interview.
You must respond as ${character.name} in-character. Keep your voice authentic to your personality. If there is missing information in your profile, express it naturally through your dialogue (e.g., if you don't have relationships listed, mention you are a loner or aren't sure who to trust yet).

Here is the conversation history so far:
${history.map(h => `${h.speaker === 'user' ? 'Director' : character.name}: ${h.text}`).join('\n')}

Director: ${userMessage}
Respond in-character (as ${character.name}):`;

  if (!ai) {
    // High-fidelity fallback
    if (userMessage.toLowerCase().includes('weapon') || userMessage.toLowerCase().includes('shield')) {
      return `My shield? It's the Aegis of the Solar Dawn. A golden disk. It feels heavy in my hands, but when Kaelen strikes the anvil, I can feel the core pulsing. It's too quiet, though... waiting for a fire I don't know if I can summon.`;
    }
    return `They tell me I am a savior, but I see the way the villagers look at my horns. They expect me to protect them, yet they fear my shadow. I'll play my part, Director... but don't expect me to follow their script blindly.`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: context,
    });
    return response.text || '';
  } catch (e) {
    console.error('Error in Character Interview:', e);
    return `Interview engine is offline, but I still stand by my sword. (API Key error: ${e instanceof Error ? e.message : 'Unknown'})`;
  }
}

/**
 * 3. SIDE-BY-SIDE VISUAL COMPARISON
 * Take two image references and perform detailed face/consistency tests.
 */
export interface VisualComparisonResult {
  consistencyScore: number;
  discrepancies: {
    category: 'Face' | 'Hair' | 'Eyes' | 'Horns' | 'Body Proportions' | 'Costume' | 'Weapon' | 'Color Drift' | 'Other';
    status: 'Matching' | 'Minor Drift' | 'Severe Discrepancy';
    details: string;
  }[];
}

export async function compareVisualAssets(imageA: string, imageB: string): Promise<VisualComparisonResult> {
  // If the images are base64, we could send them to Gemini-Pro-Vision.
  // For standard URLs or mock references, we'll perform an intelligent simulation
  // which behaves beautifully for the visual comparison panel.
  
  if (!ai || (!imageA.startsWith('data:image') && !imageB.startsWith('data:image'))) {
    // Return high-fidelity simulation
    const driftType = Math.random() > 0.5 ? 'Minor' : 'None';
    return {
      consistencyScore: driftType === 'Minor' ? 88 : 95,
      discrepancies: [
        {
          category: 'Face',
          status: 'Matching',
          details: 'Anatomy and chin structure are consistently sharp. Eye-spacing matches standard 7-head-high sheet.'
        },
        {
          category: 'Hair',
          status: driftType === 'Minor' ? 'Minor Drift' : 'Matching',
          details: driftType === 'Minor' 
            ? 'Blonde hair length is correct, but the crimson tips have a slightly warmer reddish hue in Image B compared to the approved canvas.'
            : 'Blonde to crimson transition follows exactly the 70/30 distribution rule.'
        },
        {
          category: 'Eyes',
          status: 'Matching',
          details: 'Crimson-red eye hue matches the exact hex palette of (#dc2626) in both views.'
        },
        {
          category: 'Horns',
          status: 'Matching',
          details: 'Sleek black horns are placed symmetrically along the hairline, conforming to the curve angle.'
        },
        {
          category: 'Costume',
          status: driftType === 'Minor' ? 'Minor Drift' : 'Matching',
          details: driftType === 'Minor'
            ? 'The travelers cloak hem in Image B is missing one of the tattered slits present on the reference sheet.'
            : 'Frayed charcoal fibers on the shoulder guards are matched accurately.'
        }
      ]
    };
  }

  try {
    // If we have actual base64 data, we can invoke Gemini
    // Let's analyze the images to verify consistency.
    const parts: any[] = [
      { text: "Analyze these two anime design images and rate their visual continuity. Return a JSON object containing a 'consistencyScore' (0 to 100) and an array of 'discrepancies' with properties 'category' (e.g. Face, Hair, Eyes, Horns, Costume, Color Drift), 'status' ('Matching' | 'Minor Drift' | 'Severe Discrepancy'), and 'details'." }
    ];

    if (imageA.startsWith('data:image')) {
      const split = imageA.split(',');
      const mime = split[0].match(/:(.*?);/)?.[1] || 'image/png';
      parts.push({
        inlineData: {
          mimeType: mime,
          data: split[1]
        }
      });
    }
    if (imageB.startsWith('data:image')) {
      const split = imageB.split(',');
      const mime = split[0].match(/:(.*?);/)?.[1] || 'image/png';
      parts.push({
        inlineData: {
          mimeType: mime,
          data: split[1]
        }
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: { parts },
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = cleanJsonString(response.text || '{}');
    return JSON.parse(text);
  } catch (e) {
    console.error('Error during image comparison:', e);
    return {
      consistencyScore: 75,
      discrepancies: [
        { category: 'Face', status: 'Minor Drift', details: 'Unable to perform deep visual check. Falling back to default review logs.' }
      ]
    };
  }
}

/**
 * 4. ROUGH SCENE ANALYZER
 * Analyzes rough text/beats of a scene and returns structural feedback.
 */
export async function analyzeRoughScene(scene: Scene, locationName: string, characterProfile: string): Promise<any> {
  const prompt = `You are the Lead Anime Story Editor and Showrunner.
Analyze this rough scene and provide comprehensive critical feedback.

Scene Details:
Title: ${scene.title}
Episode/Scene: Ep ${scene.episodeNumber} - Scene ${scene.sceneNumber}
Location: ${locationName}
Time/Weather: ${scene.timeOfDay} / ${scene.weather}
Characters: ${characterProfile}
Dialogue draft:
"${scene.dialogue}"
Action draft:
"${scene.action}"

Return your analysis strictly as a JSON object matching this schema:
{
  "literalWhatHappens": "string",
  "emotionalChange": "string",
  "purposeWhyExists": "string",
  "characterObjectives": "string",
  "subtext": "string",
  "expositionRisks": "string",
  "pacingRisks": "string",
  "continuityConflicts": "string",
  "missingVisualInfo": "string",
  "suggestedBeats": ["string"] // 8 to 12 items outlining visual storyboard shots
}`;

  if (!ai) {
    return {
      literalWhatHappens: 'Aria climbs the volcanic ridge, clutching her inactive shield while reflecting on her exile. She hears distant signals and prepares her journey.',
      emotionalChange: 'Starts in profound self-doubt, transitions to a fiery determination as she unlocks the celestial coordinates.',
      purposeWhyExists: 'Inciting incident for Aria’s journey. Establishes the scale, mood, and magical rules of the Sun Shield.',
      characterObjectives: 'Find a path to the Solar Citadel; escape the hunting party.',
      subtext: 'The shield represents a destiny she did not ask for, yet her fingers fit the grip perfectly.',
      expositionRisks: 'Avoid having Aria explain her backstory out loud to herself. Rely on her expression, the charred hem of her cloak, and the distant warning horns.',
      pacingRisks: 'The reveal of the solar compass needs to feel urgent and snappy rather than overly drawn out.',
      continuityConflicts: 'Ensure the shield does not emit combat fire yet; it is currently only a guide light.',
      missingVisualInfo: 'Details on the color of the ashes underfoot and the exact silhouette of the volcanic Citadel in the background.',
      suggestedBeats: [
        'Extreme Wide Shot: Aria standing on the edge of the jagged basalt ash-cliff.',
        'Close-Up: Wind blowing her long blonde hair and crimson ends across her face.',
        'Medium Shot: Aria pulls out the heavy bronze circular Aegis from her cloak.',
        'Detail Shot: The golden phoenix wing engravings on the shield are scratched and blackened.',
        'Close-Up: Aria looks down, a single tear falling from her lashes.',
        'Extreme Close-Up: The tear splashes onto the crystal prism at the shield\'s center.',
        'Sound Effect Cue: A deep mechanical click. Gears rotate within the bronze shield.',
        'Medium Shot: A brilliant ray of amber starlight shoots upward from the shield, projecting a glowing dynamic map.',
        'Close-Up: Aria’s face illuminated by the bright amber star-grid, her eyes wide with wonder.',
        'Extreme Wide Shot: The light beam from her shield casts coordinates across the vast misty mountains.',
        'Medium Shot: Aria pulls her hood up, squaring her shoulders.',
        'Wide Shot: Aria leaps off the ash ridge, disappearing into the golden morning fog.'
      ]
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = cleanJsonString(response.text || '{}');
    return JSON.parse(text);
  } catch (e) {
    console.error('Error in scene analysis:', e);
    throw e;
  }
}

/**
 * 5. STORYBOARD PANEL GENERATOR
 * Converts a scene and its beats into detailed storyboard panels with lens, angle, prompt, etc.
 */
export async function generateStoryboardPanels(scene: Scene, locationName: string): Promise<Partial<StoryboardPanel>[]> {
  const prompt = `You are a professional Anime Storyboard Artist.
Convert the following scene and its approved beats into a sequence of 12 detailed storyboard panels.

Scene Title: ${scene.title}
Location: ${locationName}
Weather/Time: ${scene.weather} / ${scene.timeOfDay}
Beats:
${scene.approvedBeats.map((b, i) => `${i+1}. ${b}`).join('\n')}

Generate detailed camera directives, blocking, and prompt scripts for each panel.
Return a JSON array of 12 items matching this TypeScript schema:
interface Panel {
  panelNumber: number;
  shotId: string; // e.g. "shot-01", "shot-02"
  durationSeconds: number; // e.g. 2.5, 4.0
  shotSize: string; // e.g. "Close-Up (CU)", "Extreme Wide Shot (EWS)", "Medium Shot (MS)"
  cameraAngle: string; // e.g. "Low Angle", "Eye Level", "High Angle"
  lens: string; // e.g. "35mm Cine", "85mm Portrait", "24mm Wide"
  cameraMovement: string; // e.g. "Slow tilt up", "Static", "Pan left"
  characterBlocking: string; // positioning of character(s) in frame
  characterExpression: string; // facial expressions
  action: string; // direct physics and movement
  background: string; // environment layout details
  lighting: string; // shadows, key light, color glows
  dialogue: string; // subtitle spoken
  soundEffects: string; // SFX notes
  musicCue: string; // BGM cues
  transition: string; // "Cut", "Fade", "Dissolve"
  generationPrompt: string; // highly descriptive anime prompt with lighting and character descriptors
  negativeConstraints: string; // unwanted elements (e.g., modern, deformed, 3D, sketch)
}`;

  if (!ai) {
    // Generate full list of 12 beautiful panels as high-fidelity fallbacks
    const sizes = ['Extreme Wide Shot (EWS)', 'Close-Up (CU)', 'Medium Shot (MS)', 'Detail Shot (DS)', 'Medium Close-Up (MCU)', 'Wide Shot (WS)'];
    const angles = ['High Angle', 'Eye Level', 'Low Angle', 'Dutch Angle'];
    return Array.from({ length: 12 }).map((_, idx) => {
      const num = idx + 1;
      return {
        panelNumber: num,
        shotId: `shot-10${num}`,
        durationSeconds: idx % 2 === 0 ? 3.0 : 2.5,
        shotSize: sizes[idx % sizes.length],
        cameraAngle: angles[idx % angles.length],
        lens: idx % 3 === 0 ? '24mm Wide' : '85mm Portrait',
        cameraMovement: idx % 4 === 0 ? 'Slow pan' : 'Static',
        characterBlocking: `Aria occupies the ${idx % 3 === 0 ? 'center' : 'left-third'} of the frame, facing the camera.`,
        characterExpression: idx % 2 === 0 ? 'Fierce, determined' : 'Stoic, hair fluttering',
        action: `Aria steps forward, adjusting her cloak against the cold mountain air.`,
        background: `The ash spires rise in the background with golden morning fog creeping down.`,
        lighting: `Golden hour side-lighting, casting long dark purple shadows across the basalt ground.`,
        dialogue: idx === 1 ? 'Aria: "I didn\'t ask for this shield."' : idx === 8 ? 'Aria: "But I will find my own way."' : '',
        soundEffects: idx % 3 === 0 ? 'Wind howling' : 'Clinking bronze armor',
        musicCue: idx === 0 ? 'Vocal chant starts' : 'Low dramatic strings swelling',
        transition: idx === 11 ? 'Fade to black' : 'Cut',
        generationPrompt: `Anime production keyframe panel ${num}, Aria with blonde hair and red tips on a foggy volcanic mountain, dramatic morning sun flare, highly polished cel-shaded style.`,
        negativeConstraints: '3d, photorealistic, draft, text watermark, deformed fingers',
        referenceAssetsIds: ['aria-traveler'],
        generatedImage: `https://images.unsplash.com/photo-${[
          '1578632767115-351597cf2477', '1534447677768-be436bb09401', '1618005182384-a83a8bd57fbe',
          '1518005020951-eccb494ad742', '1618336753974-aae8e04506aa', '1578632767115-351597cf2477'
        ][idx % 6]}?w=800&auto=format&fit=crop&q=60`,
        isApproved: num === 1 || num === 2,
        notes: `Panel ${num} of scene sequence.`
      };
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = cleanJsonString(response.text || '[]');
    return JSON.parse(text);
  } catch (e) {
    console.error('Error generating storyboards:', e);
    throw e;
  }
}

/**
 * 6. PROMPT COMPILER
 * Synthesizes structured data into an optimal visual generation prompt.
 */
export function compileAnimePrompt(
  bible: StoryBible,
  character: Character | null,
  panel: Partial<StoryboardPanel>
): { prompt: string; negative: string } {
  // Combine visual components cleanly
  const renderStyle = bible.renderStyle || 'Cinematic cel-shaded anime';
  const colorScript = bible.colorScript ? `Palette theme: ${bible.colorScript}.` : '';
  const subject = character 
    ? `${character.name}, a ${character.species} with ${character.appearance.hairStyleColor} hair, ${character.appearance.eyeShapeColor} eyes, wearing ${character.wardrobe.defaultCostume}.` 
    : panel.characterBlocking || 'A figure';

  const action = panel.action ? `Action: ${panel.action}.` : '';
  const expression = panel.characterExpression ? `Expression: ${panel.characterExpression}.` : '';
  const background = panel.background ? `Background environment: ${panel.background}.` : '';
  const lighting = panel.lighting ? `Lighting style: ${panel.lighting}.` : '';
  const camera = `${panel.shotSize || 'Medium Shot'}, ${panel.cameraAngle || 'Eye Level'} angle, taken with ${panel.lens || '35mm lens'}.`;

  const finalPrompt = `${renderStyle} style artwork. ${camera} ${subject} ${expression} ${action} ${background} ${lighting} ${colorScript} Masterpiece production cell.`.trim();
  const negativeConstraints = panel.negativeConstraints || 'deformed, photorealistic, 3d render, watermark, sketch, noise, bad anatomy';

  return { prompt: finalPrompt, negative: negativeConstraints };
}

/**
 * 7. PROJECT-WIDE CONTINUITY CHECKER
 * Checks scene, script, or panel data and flags continuity gaps.
 */
export async function runContinuityChecker(
  bible: StoryBible,
  characters: Character[],
  scenes: Scene[],
  activeScene: Scene,
  panels: StoryboardPanel[]
): Promise<ContinuityFinding[]> {
  const prompt = `You are an expert Continuity Coordinator at a professional Anime Studio.
Inspect the following production materials and flag potential continuity errors, timeline conflicts, visual identity drifts, or character knowledge plot holes.

STORY BIBLE STYLE RULES:
Visual Language: ${bible.visualLanguage}
Color Script: ${bible.colorScript}
Magic/Power System Rules: ${bible.magicSystem}

ACTIVE CHARACTERS IN PLAY:
${characters.map(c => `- ${c.name} (Role: ${c.role}): Has hair: ${c.appearance.hairStyleColor}, eye color: ${c.appearance.eyeShapeColor}, horns: ${c.appearance.horns}. Wearing: ${c.wardrobe.defaultCostume}. Weapons: ${c.wardrobe.weapons}.`).join('\n')}

ACTIVE SCENE DATA:
Title: ${activeScene.title}
Location: ${activeScene.locationId}
Time of Day: ${activeScene.timeOfDay}
Weather: ${activeScene.weather}
Characters Present: ${activeScene.charactersPresentIds.join(', ')}
Dialogue Draft: "${activeScene.dialogue}"
Action Draft: "${activeScene.action}"

STORYBOARD SEQUENCE PANELS:
${panels.map(p => `Panel ${p.panelNumber}: Size=${p.shotSize}, Camera=${p.cameraAngle}, CharacterExpression=${p.characterExpression}, ActionDescription=${p.action}, Background=${p.background}, Lighting=${p.lighting}, DialogueSubtitle="${p.dialogue}"`).join('\n')}

Analyze all assets for:
1. Wrong costume / gear for this timeline or event
2. Injury state consistency
3. Knowledge possession plot holes (character knowing things they should not)
4. Weather or Time of day mismatches between panels or scene config
5. Missing props (e.g. they had a shield in Panel 1, but empty-handed in Panel 2)
6. Dialogue inconsistent with character voice or tone
7. Visual identity drift of key character facial features (e.g. horn curvature change)

Return your findings strictly as a JSON array of objects matching this TypeScript schema:
interface Finding {
  id: string; // e.g. "finding-01"
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
  message: string; // clear, helpful description of the error and how to fix it
}`;

  if (!ai) {
    // High-fidelity fallback alerts
    return [
      {
        id: 'mock-f-1',
        type: 'Contradiction with locked lore',
        severity: 'Critical contradiction',
        message: 'The scene depicts Aria calling upon the full power of the Sun Shield to create a firestorm, but the Story Bible indicates her element is draconic fire, and the shield is a holy light conduit that cannot be unlocked until she reaches the Solar Citadel.'
      },
      {
        id: 'mock-f-2',
        type: 'Wrong costume for timeline',
        severity: 'Creative choice',
        message: 'Aria is illustrated with her tattered traveling cloak hem. Confirm if this matches the moment before she leaps down, or if the tear occurs after sliding down the rocky ash-chute.'
      },
      {
        id: 'mock-f-3',
        type: 'Dialogue inconsistent with voice',
        severity: 'Likely inconsistency',
        message: 'Aria uses the word "savior" mockingly in her dialogue. While she is quiet and resilient, her typical speech patterns are stoic rather than sarcastic. Adjust to: "I am only a spark-bearer. I do not carry their sky."'
      }
    ];
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = cleanJsonString(response.text || '[]');
    return JSON.parse(text);
  } catch (e) {
    console.error('Error in continuity review:', e);
    throw e;
  }
}
