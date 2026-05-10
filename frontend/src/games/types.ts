// Each game ships two React components — one for the host's big screen,
// one for the player's controller — both fed by the engine's view payload.

import type { ComponentType } from 'react';
import type { Player, Room } from '../types';

export interface HostViewProps<TView = unknown> {
  /** The full host projection from `engine.hostView(state)`. */
  view: TView;
  room: Room;
}

export interface ControllerViewProps<TView = unknown> {
  /** The per-player projection from `engine.view(state, playerId)`. */
  view: TView;
  /** The viewer's own player record. Always present in this branch. */
  me: Player;
  /** The room as the host last broadcast it (teams, names, etc.). */
  room: Room;
  /** Send a `game:action` — the engine validates it server-side. */
  emit: (action: { type: string; data?: unknown }) => void;
}

export interface GameRendererBundle {
  HostView: ComponentType<HostViewProps>;
  ControllerView: ComponentType<ControllerViewProps>;
}
