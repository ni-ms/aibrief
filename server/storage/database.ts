export type SqlValue = string | number | bigint | null | Uint8Array;
export interface SqlDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    run(...values: SqlValue[]): unknown;
    get(...values: SqlValue[]): unknown;
    all(...values: SqlValue[]): unknown[];
  };
  close(): void;
}
