// Maps a game's slug to the React components that render its host + controller
// screens. The realtime layer routes engine views into whichever bundle is
// registered here. Adding a new game means: implement the engine on the
// backend, drop a HostView + ControllerView under games/<slug>/, register here.

import type { GameRendererBundle } from './types';
import { HostView as DominosHostView } from './dominos/HostView';
import { ControllerView as DominosControllerView } from './dominos/ControllerView';
import { HostView as TriviaHostView } from './trivia/HostView';
import { ControllerView as TriviaControllerView } from './trivia/ControllerView';

const registry: Record<string, GameRendererBundle> = {
  dominos: {
    HostView: DominosHostView as GameRendererBundle['HostView'],
    ControllerView: DominosControllerView as GameRendererBundle['ControllerView'],
  },
  trivia: {
    HostView: TriviaHostView as GameRendererBundle['HostView'],
    ControllerView: TriviaControllerView as GameRendererBundle['ControllerView'],
  },
};

export function getRenderer(slug: string): GameRendererBundle | null {
  return registry[slug] ?? null;
}
