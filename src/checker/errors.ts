// CEL Checker Errors
// Error types and error collection for type checking

import { type Type, formatType } from "./types";

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
  exprId?: number | undefined;
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
  reportError(message: string, exprId?: number, location?: Location): void {
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report a type mismatch error
   */
  reportTypeMismatch(exprId: number, expected: Type, actual: Type, location?: Location): void {
    const message = `type mismatch: expected '${formatType(expected)}', got '${formatType(actual)}'`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report an incompatible type error (for operations)
   */
  reportIncompatibleTypes(
    exprId: number,
    operation: string,
    t1: Type,
    t2: Type,
    location?: Location
  ): void {
    const message = `incompatible types for '${operation}': '${formatType(t1)}' and '${formatType(t2)}'`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report an undeclared reference error
   */
  reportUndeclaredReference(
    exprId: number,
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
  reportUndefinedField(exprId: number, fieldName: string, location?: Location): void {
    const message = `undefined field '${fieldName}'`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report no matching overload error
   */
  reportNoMatchingOverload(
    exprId: number,
    functionName: string,
    argTypes: Type[],
    isMethodCall: boolean,
    location?: Location
  ): void {
    const args = argTypes.map(formatType).join(", ");
    const callStyle = isMethodCall ? "method" : "function";
    const message = `no matching overload for ${callStyle} '${functionName}' with arguments (${args})`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report not a type error
   */
  reportNotAType(exprId: number, name: string, location?: Location): void {
    const message = `'${name}' is not a type`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report not a message type error
   */
  reportNotAMessageType(exprId: number, typeName: string, location?: Location): void {
    const message = `'${typeName}' is not a message type`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report not iterable error (for comprehensions)
   */
  reportNotIterable(exprId: number, type: Type, location?: Location): void {
    const message = `expression of type '${formatType(type)}' is not iterable`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report unexpected type error
   */
  reportUnexpectedType(exprId: number, expected: string, actual: Type, location?: Location): void {
    const message = `expected ${expected}, got '${formatType(actual)}'`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report field redefinition error
   */
  reportFieldRedefinition(exprId: number, fieldName: string, location?: Location): void {
    const message = `field '${fieldName}' is already defined`;
    this.errors.push({ message, exprId, location });
  }

  /**
   * Report missing required field error
   */
  reportMissingField(
    exprId: number,
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
    return this.errors.map((e) => this.formatError(e)).join("\n");
  }

  /**
   * Format a single error
   */
  private formatError(error: CheckerError): string {
    if (error.location) {
      return `ERROR: ${error.location.line}:${error.location.column}: ${error.message}`;
    }
    return `ERROR: ${error.message}`;
  }
}
