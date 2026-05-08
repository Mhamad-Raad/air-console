export interface GameCatalogEntry {
  slug: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  iconUrl?: string;
  enabled: boolean;
}
