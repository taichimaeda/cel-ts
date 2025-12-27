// Source information for error reporting and unparsing.

import type { Expr, ExprId } from "./ast";

/**
 * Offset range in source.
 */
interface SourceRange {
  start: number;
  end: number;
}

/**
 * Source information for error reporting and unparsing.
 */
export class SourceInfo {
  /** Original source expression */
  /** Description (filename, etc.) */
  /** Line offsets for computing location */
  private readonly lineOffsets: number[];
  /** Map from expression ID to offset range */
  private readonly positions: Map<ExprId, SourceRange> = new Map();
  /** Map from expression ID to macro call (original call before expansion) */
  private readonly macroCalls: Map<ExprId, Expr> = new Map();

  constructor(
    readonly source: string,
    readonly description = "<input>"
  ) {
    // Compute line offsets.
    const offsets: number[] = [];
    for (let i = 0; i < source.length; i++) {
      if (source[i] === "\n") {
        offsets.push(i + 1);
      }
    }
    this.lineOffsets = offsets;
  }

  /**
   * Set position for an expression ID.
   */
  setPosition(id: ExprId, range: SourceRange): void {
    this.positions.set(id, range);
  }

  /**
   * Get position for an expression ID.
   */
  getPosition(id: ExprId): SourceRange | undefined {
    return this.positions.get(id);
  }

  /**
   * Get all positions.
   */
  getPositions(): Map<ExprId, SourceRange> {
    return this.positions;
  }

  /**
   * Record a macro call (original call expression before expansion).
   */
  setMacroCall(id: ExprId, call: Expr): void {
    this.macroCalls.set(id, call);
  }

  /**
   * Get the original macro call for an expression ID.
   */
  getMacroCall(id: ExprId): Expr | undefined {
    return this.macroCalls.get(id);
  }

  /**
   * Check if an expression ID was a macro call.
   */
  isMacroCall(id: ExprId): boolean {
    return this.macroCalls.has(id);
  }

  /**
   * Get all macro calls.
   */
  getMacroCalls(): Map<ExprId, Expr> {
    return this.macroCalls;
  }

  /**
   * Clear a macro call.
   */
  clearMacroCall(id: ExprId): void {
    this.macroCalls.delete(id);
  }

  /**
   * Compute offset from line and column (1-based line, 0-based column).
   */
  getOffset(line: number, column: number): number {
    if (line === 1) {
      return column;
    }
    if (line < 1 || line > this.lineOffsets.length + 1) {
      return -1;
    }
    const lineOffset = this.lineOffsets[line - 2];
    if (lineOffset === undefined) {
      return -1;
    }
    return lineOffset + column;
  }

  /**
   * Get location (line, column) from offset.
   */
  getLocation(offset: number): { line: number; column: number } {
    let line = 1;
    let col = offset;
    for (const lineOffset of this.lineOffsets) {
      if (lineOffset > offset) {
        break;
      }
      line++;
      col = offset - lineOffset;
    }
    return { line, column: col };
  }

  /**
   * Get the start location for an expression ID.
   */
  getStartLocation(id: ExprId): { line: number; column: number } | undefined {
    const range = this.positions.get(id);
    if (range === undefined) {
      return undefined;
    }
    return this.getLocation(range.start);
  }
}
