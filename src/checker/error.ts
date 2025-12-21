// CEL Checker Errors
// Error types and error collection for type checking

import type { ExprId } from "../common/ast";
import type { Type } from "./types";

/**
 * Location information for error reporting
 */
export interface Location {
  line: number;
  column: number;
  offset?: number;
}

/**
 * Represents a single type checking error
 */
export interface CheckerError {
  message: string;
  location?: Location | undefined;
  exprId?: ExprId | undefined;
}

/**
 * Error collector for accumulating type checking errors
 */
export class CheckerErrors {
  private readonly errors: CheckerError[] = [];

  /**
   * Get all collected errors
   */
  getErrors(): readonly CheckerError[] {
    return this.errors;
  }

  /**
   * Check if any errors have been collected
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * Get the number of errors
   */
  count(): number {
    return this.errors.length;
  }

  /**
   * Add a generic error
   */
  reportError(message: string, exprId?: ExprId, location?: Location): void {
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report a type mismatch error
   */
  reportTypeMismatch(exprId: ExprId, expected: Type, actual: Type, location?: Location): void {
    const message = `type mismatch: expected '${expected.toString()}', got '${actual.toString()}'`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report an incompatible type error (for operations)
   */
  reportIncompatibleTypes(
    exprId: ExprId,
    operation: string,
    t1: Type,
    t2: Type,
    location?: Location
  ): void {
    const message = `incompatible types for '${operation}': '${t1.toString()}' and '${t2.toString()}'`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report an undeclared reference error
   */
  reportUndeclaredReference(
    exprId: ExprId,
    container: string,
    name: string,
    location?: Location
  ): void {
    const prefix = container ? `${container}.` : "";
    const message = `undeclared reference to '${prefix}${name}'`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report an undefined field error
   */
  reportUndefinedField(exprId: ExprId, fieldName: string, location?: Location): void {
    const message = `undefined field '${fieldName}'`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report no matching overload error
   */
  reportNoMatchingOverload(
    exprId: ExprId,
    functionName: string,
    argTypes: Type[],
    isMethodCall: boolean,
    location?: Location
  ): void {
    const args = argTypes.map((t) => t.toString()).join(", ");
    const callStyle = isMethodCall ? "method" : "function";
    const message = `no matching overload for ${callStyle} '${functionName}' with arguments (${args})`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report not a type error
   */
  reportNotAType(exprId: ExprId, name: string, location?: Location): void {
    const message = `'${name}' is not a type`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report not a message type error
   */
  reportNotAMessageType(exprId: ExprId, typeName: string, location?: Location): void {
    const message = `'${typeName}' is not a message type`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report not iterable error (for comprehensions)
   */
  reportNotIterable(exprId: ExprId, type: Type, location?: Location): void {
    const message = `expression of type '${type.toString()}' is not iterable`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report unexpected type error
   */
  reportUnexpectedType(exprId: ExprId, expected: string, actual: Type, location?: Location): void {
    const message = `expected ${expected}, got '${actual.toString()}'`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report field redefinition error
   */
  reportFieldRedefinition(exprId: ExprId, fieldName: string, location?: Location): void {
    const message = `field '${fieldName}' is already defined`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report missing required field error
   */
  reportMissingField(
    exprId: ExprId,
    typeName: string,
    fieldName: string,
    location?: Location
  ): void {
    const message = `missing required field '${fieldName}' in type '${typeName}'`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Format all errors as a string
   */
  toString(): string {
    return this.errors
      .map((error) => {
        if (error.location) {
          return `ERROR: ${error.location.line}:${error.location.column}: ${error.message}`;
        }
        return `ERROR: ${error.message}`;
      })
      .join("\n");
  }
}
