declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  interface Database {
    run(sql: string, params?: any[]): Database;
    exec(sql: string, params?: any[]): QueryExecResult[];
    /** Rows inserted/updated/deleted by the most recent statement. */
    getRowsModified(): number;
    export(): Uint8Array;
    close(): void;
  }

  export default function initSqlJs(config?: any): Promise<SqlJsStatic>;
  export { Database, QueryExecResult };
}
