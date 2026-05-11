// Maps a game's slug (as stored on the Room) to its engine. Adding a new
// game means: drop a folder under games/<slug>/, implement GameEngine,
// register it here. The realtime layer touches nothing.

import type { AnyGameEngine } from './engine.js';
import { DominosEngine } from './dominos/dominos.engine.js';
import { TriviaEngine } from './trivia/trivia.engine.js';

const registry = new Map<string, AnyGameEngine>([
  ['dominos', DominosEngine as AnyGameEngine],
  ['trivia', TriviaEngine as AnyGameEngine],
]);

export function getEngine(slug: string): AnyGameEngine | null {
  return registry.get(slug) ?? null;
}

export function requireEngine(slug: string): AnyGameEngine {
  const engine = getEngine(slug);
  if (!engine) throw new Error(`No engine registered for game "${slug}"`);
  return engine;
}
