// CEL Type Checker
// Exports for the checker module

export { check, Checker } from "./checker";
export type { CheckResult, ReferenceInfo } from "./checker";

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
