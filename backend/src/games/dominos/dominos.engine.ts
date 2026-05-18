// Dominos engine — server-authoritative, Block + Draw hybrid.
//
// State machine: playing → roundEnd → playing → ... → finished.
//
// Rules summary:
// - Double-six set (28 tiles). Each player gets 7 tiles; leftovers form
//   the boneyard (2p → 14 boneyard, 3p → 7, 4p → 0).
// - Player holding the highest double opens the round by playing it.
// - On your turn, play any tile matching a chain end, OR draw from the
//   boneyard (Draw rule), OR pass — but pass is only legal when no
//   playable tile exists in your hand AND the boneyard is empty.
// - Drawing keeps the turn the same. The drawn tile is added to your hand;
//   you can play it on the next action if it matches.
// - Round ends when someone empties their hand (a "domino") OR the round
//   is blocked (everyone in a row had to pass).
// - Round winner = empty-hand player; blocked round → lowest pip-sum player
//   (ties → no winner this round, no points).
// - Winner's score increases by the sum of pips left in opponents' hands.
// - Match ends when any player crosses targetScore (default 100).
//
// 4-player games have an empty boneyard, so the Draw branch is a no-op
// and the game behaves exactly like classic Block.

import type { GameEngine } from '../engine.js';
import {
  fullSet,
  handPipSum,
  highestDouble,
  isDouble,
  matchesEnd,
  otherEnd,
  pipSum,
  shuffle,
  tile,
  tileEquals,
  type Pip,
  type Tile,
} from './tile.js';
import type {
  DominosAction,
  DominosState,
  PlacedTile,
  RoundResult,
} from './dominos.types.js';

const HAND_SIZE = 7;
const DEFAULT_TARGET = 100;

function dealHands(
  playerIds: string[],
  rng?: () => number,
): { hands: Record<string, Tile[]>; boneyard: Tile[] } {
  const deck = shuffle(fullSet(), rng);
  const hands: Record<string, Tile[]> = {};
  for (let i = 0; i < playerIds.length; i++) {
    hands[playerIds[i]!] = deck.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE);
  }
  const boneyard = deck.slice(playerIds.length * HAND_SIZE);
  return { hands, boneyard };
}

/** Pick the opener: the player holding the highest available double.
 *  Falls back to the highest pip-sum tile's owner if no doubles exist. */
function findOpener(hands: Record<string, Tile[]>, playerIds: string[]): string {
  let bestDoubleVal = -1;
  let opener: string | null = null;
  for (const id of playerIds) {
    const d = highestDouble(hands[id] ?? []);
    if (d && d[0] > bestDoubleVal) {
      bestDoubleVal = d[0];
      opener = id;
    }
  }
  if (opener) return opener;
  // No doubles dealt anywhere — fall back to whoever holds the heaviest
  // tile by pip sum (rare with 7-tile hands, but possible if dealing
  // changes later).
  let bestSum = -1;
  for (const id of playerIds) {
    for (const t of hands[id] ?? []) {
      if (pipSum(t) > bestSum) {
        bestSum = pipSum(t);
        opener = id;
      }
    }
  }
  return opener ?? playerIds[0]!;
}

function nextTurn(state: DominosState, fromId: string): string {
  const order = state.playerIds;
  const idx = order.indexOf(fromId);
  return order[(idx + 1) % order.length]!;
}

function hasLegalPlay(hand: readonly Tile[], state: DominosState): boolean {
  if (state.leftEnd === null) return hand.length > 0; // opening move
  return hand.some(
    (t) => matchesEnd(t, state.leftEnd as number) || matchesEnd(t, state.rightEnd as number),
  );
}

function removeTile(hand: Tile[], t: Tile): Tile[] {
  const i = hand.findIndex((h) => tileEquals(h, t));
  if (i < 0) throw new Error(`tile ${t[0]}-${t[1]} not in hand`);
  const out = hand.slice();
  out.splice(i, 1);
  return out;
}

function placeTile(
  state: DominosState,
  t: Tile,
  side: 'left' | 'right',
): { board: PlacedTile[]; leftEnd: Pip; rightEnd: Pip } {
  const placed: PlacedTile = {
    tile: t,
    side,
    orientation: isDouble(t) ? 'vertical' : 'horizontal',
  };

  if (state.leftEnd === null) {
    // Opening move — both ends become the tile's pips.
    return {
      board: [placed],
      leftEnd: t[0],
      rightEnd: t[1],
    };
  }

  const end = side === 'left' ? state.leftEnd : state.rightEnd;
  if (!matchesEnd(t, end as number)) {
    throw new Error(`tile ${t[0]}-${t[1]} does not match ${side} end ${end}`);
  }
  const newExposed = otherEnd(t, end as number);
  const board = side === 'left' ? [placed, ...state.board] : [...state.board, placed];
  return {
    board,
    leftEnd: side === 'left' ? newExposed : (state.leftEnd as Pip),
    rightEnd: side === 'right' ? newExposed : (state.rightEnd as Pip),
  };
}

// --- round end / scoring ----------------------------------------------------

function settleRound(state: DominosState, blocked: boolean): DominosState {
  const sums: Record<string, number> = {};
  for (const id of state.playerIds) sums[id] = handPipSum(state.hands[id] ?? []);

  let winnerId: string | null = null;
  let points = 0;

  if (!blocked) {
    // Whoever emptied their hand wins; they score the opponents' pips.
    winnerId = state.playerIds.find((id) => (state.hands[id] ?? []).length === 0) ?? null;
    if (winnerId) {
      points = state.playerIds
        .filter((id) => id !== winnerId)
        .reduce((acc, id) => acc + (sums[id] ?? 0), 0);
    }
  } else {
    // Blocked round: lowest pip sum wins; tie → no winner this round.
    const min = Math.min(...state.playerIds.map((id) => sums[id] ?? 0));
    const lowest = state.playerIds.filter((id) => (sums[id] ?? 0) === min);
    if (lowest.length === 1) {
      winnerId = lowest[0]!;
      points = state.playerIds
        .filter((id) => id !== winnerId)
        .reduce((acc, id) => acc + (sums[id] ?? 0), 0);
    }
  }

  const scores = { ...state.scores };
  if (winnerId) scores[winnerId] = (scores[winnerId] ?? 0) + points;

  const round: RoundResult = { winnerId, points, blocked };
  const rounds = [...state.rounds, round];

  const matchWinner = state.playerIds.find((id) => (scores[id] ?? 0) >= state.targetScore) ?? null;

  return {
    ...state,
    phase: matchWinner ? 'finished' : 'roundEnd',
    scores,
    rounds,
    winnerId: matchWinner,
    turn: null,
  };
}

function startNextRound(state: DominosState): DominosState {
  const { hands, boneyard } = dealHands(state.playerIds);
  const opener = findOpener(hands, state.playerIds);
  return {
    ...state,
    phase: 'playing',
    hands,
    boneyard,
    board: [],
    leftEnd: null,
    rightEnd: null,
    turn: opener,
    starterId: opener,
    passes: 0,
  };
}

// --- engine -----------------------------------------------------------------

export const DominosEngine: GameEngine<DominosState, DominosAction> = {
  init(playerIds) {
    if (playerIds.length < 2 || playerIds.length > 4) {
      throw new Error(`Dominos requires 2–4 players, got ${playerIds.length}`);
    }
    const { hands, boneyard } = dealHands(playerIds);
    const opener = findOpener(hands, playerIds);
    const scores: Record<string, number> = {};
    for (const id of playerIds) scores[id] = 0;
    return {
      phase: 'playing',
      playerIds: [...playerIds],
      hands,
      boneyard,
      board: [],
      leftEnd: null,
      rightEnd: null,
      turn: opener,
      starterId: opener,
      passes: 0,
      scores,
      rounds: [],
      targetScore: DEFAULT_TARGET,
      winnerId: null,
    };
  },

  applyAction(state, playerId, action) {
    if (!action || typeof action !== 'object') throw new Error('Invalid action');
    const a = action as DominosAction;

    if (a.type === 'continue') {
      // Idempotent on purpose: every controller schedules a `continue`
      // when it enters roundEnd, and the first one to arrive wins. Later
      // continues from peers (or duplicates from network retries) are
      // silently absorbed instead of throwing, mirroring how trivia's
      // `tick` is handled in this codebase. This lets any controller —
      // not just playerIds[0] — drive the round transition, so a single
      // disconnect doesn't strand the room.
      if (state.phase !== 'roundEnd') return state;
      return startNextRound(state);
    }

    if (state.phase !== 'playing') throw new Error('Game not in progress');
    if (state.turn !== playerId) throw new Error('Not your turn');

    const hand = state.hands[playerId] ?? [];

    if (a.type === 'draw') {
      // Drawing is only legal if there are still tiles in the boneyard
      // and the player has no playable tile in hand. Otherwise we'd let
      // a player stall indefinitely by drawing on every turn.
      if (state.boneyard.length === 0) {
        throw new Error('Boneyard is empty');
      }
      if (hasLegalPlay(hand, state)) {
        throw new Error('You have a legal play — cannot draw');
      }
      const drawn = state.boneyard[0]!;
      const newBoneyard = state.boneyard.slice(1);
      const newHand = [...hand, drawn];
      // The turn stays with the same player; they may now have a legal
      // play (or may need to draw again / pass).
      return {
        ...state,
        boneyard: newBoneyard,
        hands: { ...state.hands, [playerId]: newHand },
        passes: 0, // drawing isn't a pass; reset the blocked-round counter
      };
    }

    if (a.type === 'pass') {
      if (hasLegalPlay(hand, state)) {
        throw new Error('You have a legal play — cannot pass');
      }
      if (state.boneyard.length > 0) {
        throw new Error('Draw from the boneyard before passing');
      }
      const passes = state.passes + 1;
      if (passes >= state.playerIds.length) {
        // Everyone passed in a row → round is blocked.
        return settleRound({ ...state, passes }, true);
      }
      return { ...state, passes, turn: nextTurn(state, playerId) };
    }

    if (a.type === 'play') {
      const t = tile(a.data.tile[0], a.data.tile[1]);
      if (!hand.some((h) => tileEquals(h, t))) {
        throw new Error(`You do not hold tile ${t[0]}-${t[1]}`);
      }
      // Opener etiquette: when the board is empty (opening move), the
      // starter is REQUIRED to play their highest double. The starter was
      // picked precisely because they hold it; letting them open with
      // anything else is a real rule break, not stylistic — every other
      // hand was dealt assuming this constraint.
      if (state.leftEnd === null) {
        const required = highestDouble(hand);
        if (required && !tileEquals(t, required)) {
          throw new Error(
            `Opener must play the highest double (${required[0]}-${required[1]})`,
          );
        }
      }
      if (state.leftEnd !== null && !matchesEnd(t, a.data.side === 'left' ? state.leftEnd : (state.rightEnd as number))) {
        throw new Error(`Tile does not match the ${a.data.side} end`);
      }

      const placed = placeTile(state, t, a.data.side);
      const newHand = removeTile(hand, t);
      const hands = { ...state.hands, [playerId]: newHand };

      const baseNext: DominosState = {
        ...state,
        ...placed,
        hands,
        passes: 0,
      };

      if (newHand.length === 0) {
        // "Domino!" — player emptied their hand and wins the round.
        return settleRound(baseNext, false);
      }
      return { ...baseNext, turn: nextTurn(state, playerId) };
    }

    throw new Error('Unknown action type');
  },

  view(state, playerId) {
    return projectPlayerView(state, playerId);
  },

  hostView(state) {
    return projectHostView(state);
  },

  isFinished(state) {
    return state.phase === 'finished';
  },

  result(state) {
    if (state.phase !== 'finished') return null;
    const ranked = Object.entries(state.scores)
      .map(([id, score]) => ({ playerId: id, score }))
      .sort((a, b) => b.score - a.score);
    return {
      winnerId: state.winnerId,
      ranked,
      rounds: state.rounds.length,
    };
  },
};

// --- view projections -------------------------------------------------------

function commonHeader(state: DominosState) {
  return {
    phase: state.phase,
    board: state.board,
    leftEnd: state.leftEnd,
    rightEnd: state.rightEnd,
    turn: state.turn,
    starterId: state.starterId,
    scores: { ...state.scores },
    rounds: state.rounds,
    targetScore: state.targetScore,
    winnerId: state.winnerId,
    playerIds: state.playerIds,
    boneyardCount: state.boneyard.length,
  };
}

function projectPlayerView(state: DominosState, playerId: string) {
  const myHand = state.hands[playerId] ?? [];
  const handCounts: Record<string, number> = {};
  for (const id of state.playerIds) handCounts[id] = (state.hands[id] ?? []).length;

  const isMyTurn = state.turn === playerId && state.phase === 'playing';
  const canPlay = isMyTurn ? hasLegalPlay(myHand, state) : false;
  // Drawing is the only escape from a stuck hand when the boneyard isn't
  // empty — surface that to the controller so it can offer the affordance.
  const canDraw = isMyTurn && !canPlay && state.boneyard.length > 0;
  const canPass = isMyTurn && !canPlay && state.boneyard.length === 0;

  return {
    ...commonHeader(state),
    yourHand: myHand,
    handCounts,
    canPlay,
    canDraw,
    canPass,
  };
}

function projectHostView(state: DominosState) {
  const handCounts: Record<string, number> = {};
  for (const id of state.playerIds) handCounts[id] = (state.hands[id] ?? []).length;
  return {
    ...commonHeader(state),
    handCounts,
  };
}

export type { DominosState, DominosAction } from './dominos.types.js';
