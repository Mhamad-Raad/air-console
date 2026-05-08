export interface GameCatalogEntry {
  slug: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  /** If true, the host UI shows a team picker for each player. */
  supportsTeams: boolean;
  /** If true, the start button is gated until every player is ready. */
  requireReady: boolean;
  iconUrl?: string;
  enabled: boolean;
}
