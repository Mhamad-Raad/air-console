export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
