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

/**
 * Each game ships whichever screens it actually uses:
 *  - Both — Dominos, Trivia, Tarneeb (board on host, hand/buttons on phone).
 *  - ControllerView only — phone-driven games like Imposter or Tap Race;
 *    the host falls back to a roster/status view so the screen still shows
 *    that a game is running.
 *  - HostView only — host-driven trivia/announcement modes; phones can be
 *    presence-only via the lobby UI.
 *
 * Rendering is the only seam that's optional per game; the engine is
 * always required server-side.
 */
export interface GameRendererBundle {
  HostView?: ComponentType<HostViewProps>;
  ControllerView?: ComponentType<ControllerViewProps>;
}
