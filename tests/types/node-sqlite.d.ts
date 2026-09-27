/**
 * node:sqlite 的最小类型声明。
 *
 * 项目运行时是 Node 24（内置 node:sqlite），但 devDependencies 里锁定的
 * @types/node 为 v20，尚未包含该模块的声明，导致 tsc 报 TS2307。
 * 这里只声明测试实际用到的子集，等 @types/node 升级到 v22+ 后可直接删除本文件。
 */
declare module "node:sqlite" {
  type SQLInputValue = null | number | bigint | string | Uint8Array;

  interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  interface StatementSync {
    get(...params: SQLInputValue[]): unknown;
    all(...params: SQLInputValue[]): unknown[];
    run(...params: SQLInputValue[]): StatementResultingChanges;
  }

  class DatabaseSync {
    constructor(location: string, options?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }

  export { DatabaseSync };
}