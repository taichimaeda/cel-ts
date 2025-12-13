// CEL Type Checker
// Exports for the checker module

export { check, Checker } from "./checker";
export type { CheckResult } from "./checker";

// Re-export ReferenceInfo from common/ast
export type { ReferenceInfo } from "../common/ast";
export { createIdentReference, createFunctionReference } from "../common/ast";

export { FunctionDecl, OverloadDecl, VariableDecl } from "./decls";

export { CheckerEnv, Container, DefaultTypeProvider } from "./env";
export type { LookupResult, TypeProvider } from "./env";

export { CheckerErrors } from "./errors";
export type { CheckerError, Location } from "./errors";

export { isAssignableWithMapping, joinTypes, substitute, TypeMapping } from "./mapping";

export {
  formatType,
  isAssignable,
  isDynOrError,
  mostGeneral,
  Type,
  TypeKind,
  typeKey,
  TypeTrait,
} from "./types";

export { getStandardFunctions } from "./stdlib";
