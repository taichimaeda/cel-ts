import { readdirSync } from "node:fs";
import path from "node:path";
import type * as protobuf from "protobufjs";
import { Env, ProtobufTypeProvider, Struct, Variable } from "../../src/cel";
import { DynType, TypeKind } from "../../src/checker/types";
import {
  BindingsExtension,
  EncodersExtension,
  type Extension,
  MathExtension,
  OptionalTypesExtension,
  StringsExtension,
  TwoVarComprehensionsExtension,
  applyExtensions,
} from "../../src/extensions";
import { BoolValue, type Value, ValueUtil, setAnyResolver } from "../../src/interpreter/values";
import { decodeTextProto, ensureDescriptorSet, protoToSimpleTestFile, stripTypeUrl } from "./proto";
import {
  type ProtoObject,
  type RunStats,
  type SimpleTest,
  type SimpleTestFile,
  runtime,
} from "./runtime";
import { messageToValue, protoToType, protoToValue } from "./values";

export async function runConformance(): Promise<RunStats> {
  ensureDescriptorSet();

  await runtime.root.load(
    [...runtime.protoFiles.conformanceProtoFiles, ...runtime.protoFiles.extraProtoFiles],
    { keepCase: true }
  );
  runtime.root.resolveAll();
  runtime.protobufTypeProvider = new ProtobufTypeProvider(runtime.root);

  setAnyResolver((typeUrl, bytes) => {
    const typeName = stripTypeUrl(typeUrl);
    let messageType: protobuf.Type;
    try {
      messageType = runtime.root.lookupType(typeName);
    } catch {
      return null;
    }
    const decoded = messageType.decode(bytes);
    const object = messageType.toObject(decoded, runtime.options) as ProtoObject;
    return messageToValue(messageType, object);
  });

  const files = readdirSync(runtime.paths.testdataRoot)
    .filter((file) => file.endsWith(".textproto"))
    .sort();

  const stats: RunStats = { total: 0, passed: 0, failed: 0, skipped: 0 };

  for (const fileName of files) {
    if (runtime.skipFiles.has(fileName)) {
      stats.skipped += 1;
      continue;
    }
    runSimpleTestFile(fileName, stats);
  }

  return stats;
}

function runSimpleTestFile(fileName: string, stats: RunStats): void {
  const filePath = path.join(runtime.paths.testdataRoot, fileName);
  const testFile = decodeTextProto(filePath);
  const fileObj = protoToSimpleTestFile(
    testFile.type.toObject(testFile.message, runtime.options) as SimpleTestFile
  );

  const sections = fileObj.section ?? [];
  for (const section of sections) {
    const sectionName = section.name ?? "";
    for (const test of section.test ?? []) {
      stats.total += 1;
      if (isTestSkippable(test)) {
        stats.skipped += 1;
        continue;
      }

      try {
        const result = runSimpleTest(test, fileName, sectionName);
        if (result) {
          stats.passed += 1;
        } else {
          stats.failed += 1;
          console.error(
            `[FAIL] ${fileName} :: ${section.name ?? "<section>"} :: ${test.name ?? "<test>"}`
          );
        }
      } catch (error) {
        stats.failed += 1;
        console.error(
          `[ERROR] ${fileName} :: ${section.name ?? "<section>"} :: ${test.name ?? "<test>"}`
        );
        console.error(error);
      }
    }
  }
}

function runSimpleTest(test: SimpleTest, fileName: string, sectionName: string): boolean {
  const envOptions = testToEnvOptions(test, fileName, sectionName);
  const env = new Env(envOptions);

  const expr = test.expr;
  if (!expr) {
    return false;
  }
  const disableCheck = Boolean(test.disableCheck);
  const checkOnly = Boolean(test.checkOnly);

  const ast = disableCheck ? env.parse(expr) : env.compile(expr);

  if (checkOnly) {
    const typedResult = test.typedResult;
    if (!typedResult?.["deduced_type"]) {
      return false;
    }
    const expectedType = protoToType(typedResult["deduced_type"] as ProtoObject);
    if (!expectedType) {
      return false;
    }
    const actualType = ast.outputType ?? DynType;
    return expectedType.isEquivalentType(actualType);
  }

  const program = env.program(ast);
  const bindings = bindingsToValueMap(test.bindings);
  const evalResult = evalProgram(program, bindings);
  const resultKind = test.resultMatcher;

  if (resultKind === "eval_error" || test.evalError) {
    if (!evalResult.error) {
      return false;
    }
    return matchesEvalError(test.evalError, evalResult.error);
  }
  if (resultKind === "any_eval_errors" || test.anyEvalErrors) {
    if (!evalResult.error) {
      return false;
    }
    return matchesAnyEvalErrors(test.anyEvalErrors, evalResult.error);
  }
  if (resultKind === "unknown" || test.unknown) {
    return matchesUnknown(test.unknown, evalResult.value);
  }
  if (resultKind === "any_unknowns" || test.anyUnknowns) {
    return matchesAnyUnknowns(test.anyUnknowns, evalResult.value);
  }

  if (evalResult.error || !evalResult.value) {
    return false;
  }
  const actual = evalResult.value;

  if (test.typedResult) {
    const typedResult = test.typedResult;
    const expectedType = protoToType(typedResult["deduced_type"] as ProtoObject);
    if (!expectedType) {
      return false;
    }
    const actualType = ast.outputType ?? DynType;
    if (!expectedType.isEquivalentType(actualType)) {
      return false;
    }
  }

  const expected = testToExpectedValue(test);
  if (!expected) {
    return actual instanceof BoolValue && actual.value();
  }

  const eq = expected.equal(actual);
  return eq instanceof BoolValue && eq.value();
}

function testToEnvOptions(
  test: SimpleTest,
  fileName: string,
  sectionName: string
): ConstructorParameters<typeof Env>[0] {
  const variables: Variable[] = [];
  const structs: Struct[] = [];
  const container = test.container as string | undefined;
  const typeEnv = typeEnvToList(test.typeEnv);

  for (const decl of typeEnv) {
    if (!decl["ident"]) {
      continue;
    }
    const ident = decl["ident"] as ProtoObject;
    const type = protoToType(ident["type"] as ProtoObject);
    const name = decl["name"] as string;
    if (!type || !name) {
      continue;
    }
    if (type.kind === TypeKind.Struct) {
      structs.push(new Struct(type.runtimeTypeName, []));
    }
    variables.push(new Variable(name, type));
  }

  const baseOptions: ConstructorParameters<typeof Env>[0] = {
    variables,
    structs,
    typeProvider: runtime.protobufTypeProvider,
    disableTypeChecking: Boolean(test.disableCheck),
    enumValuesAsInt: fileName === "enums.textproto" ? sectionName.startsWith("legacy_") : true,
  };
  if (container !== undefined) {
    baseOptions.container = container;
  }
  return applyExtensions(baseOptions, ...fileToExtensions(fileName));
}

function typeEnvToList(typeEnv: SimpleTest["typeEnv"]): ProtoObject[] {
  if (!typeEnv) return [];
  return Array.isArray(typeEnv) ? typeEnv : [typeEnv];
}

function fileToExtensions(fileName: string): Extension[] {
  const options: Extension[] = [new OptionalTypesExtension()];
  switch (fileName) {
    case "bindings_ext.textproto":
      options.push(new BindingsExtension());
      return options;
    case "encoders_ext.textproto":
      options.push(new EncodersExtension());
      return options;
    case "math_ext.textproto":
      options.push(new MathExtension());
      return options;
    case "string_ext.textproto":
      options.push(new StringsExtension());
      return options;
    case "macros2.textproto":
      options.push(new TwoVarComprehensionsExtension());
      return options;
    default:
      return options;
  }
}

function bindingsToValueMap(bindings: Record<string, unknown> | undefined): Map<string, Value> {
  const result = new Map<string, Value>();
  if (!bindings) return result;

  for (const [name, exprValue] of Object.entries(bindings)) {
    const value = bindingExprToValue(exprValue as ProtoObject);
    if (value) {
      result.set(name, value);
    }
  }
  return result;
}

function bindingExprToValue(exprValue: ProtoObject): Value | null {
  const kind = exprValue["kind"] as string | undefined;
  if (!kind || kind !== "value") {
    return null;
  }
  return protoToValue(exprValue["value"] as ProtoObject);
}

function testToExpectedValue(test: SimpleTest): Value | null {
  if (test.value) {
    return protoToValue(test.value as ProtoObject);
  }
  if (test.typedResult) {
    const typed = test.typedResult;
    if (!typed["result"]) {
      return null;
    }
    return protoToValue(typed["result"] as ProtoObject);
  }
  return null;
}

function isTestSkippable(test: SimpleTest): boolean {
  if (test.disableMacros) {
    return true;
  }

  if (isProto2Test(test)) {
    return true;
  }

  const typeEnv = typeEnvToList(test.typeEnv);
  if (typeEnv.some((decl) => isDeclUnsupported(decl))) {
    return true;
  }

  const bindings = test.bindings ?? {};
  if (!bindings || typeof bindings !== "object") {
    return false;
  }
  for (const value of Object.values(bindings)) {
    if (typeof value === "object" && value !== null) {
      const kind = (value as { kind?: string }).kind;
      if (kind && kind !== "value") {
        return true;
      }
    }
  }
  return false;
}

function evalProgram(
  program: ReturnType<Env["program"]>,
  bindings: Map<string, Value>
): { value?: Value; error?: string } {
  try {
    return { value: program.eval(bindings) };
  } catch (error) {
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: String(error) };
  }
}

function matchesEvalError(expected: ProtoObject | undefined, actualError: string): boolean {
  const messages = errorSetToMessages(expected);
  if (messages.length === 0) {
    return actualError.length > 0;
  }
  return messages.every((message) => actualError.includes(message));
}

function matchesAnyEvalErrors(expected: ProtoObject | undefined, actualError: string): boolean {
  const errorSets = errorSetMatcherToList(expected);
  if (errorSets.length === 0) {
    return actualError.length > 0;
  }
  return errorSets.some((errorSet) => matchesEvalError(errorSet, actualError));
}

function matchesUnknown(expected: ProtoObject | undefined, actual: Value | undefined): boolean {
  if (!actual || !ValueUtil.isUnknown(actual)) {
    return false;
  }
  const expectedIds = unknownSetToIds(expected);
  if (expectedIds.length === 0) {
    return true;
  }
  const actualIds = actual.value() as readonly number[];
  return expectedIds.every((id) => actualIds.includes(id));
}

function matchesAnyUnknowns(expected: ProtoObject | undefined, actual: Value | undefined): boolean {
  const unknownSets = unknownSetMatcherToList(expected);
  if (unknownSets.length === 0) {
    return matchesUnknown(undefined, actual);
  }
  return unknownSets.some((unknownSet) => matchesUnknown(unknownSet, actual));
}

function errorSetToMessages(errorSet: ProtoObject | undefined): string[] {
  if (!errorSet) return [];
  const errors = errorSet["errors"];
  if (!Array.isArray(errors)) return [];
  return errors
    .map((entry) => entry?.message)
    .filter((message): message is string => typeof message === "string");
}

function errorSetMatcherToList(matcher: ProtoObject | undefined): ProtoObject[] {
  if (!matcher) return [];
  const errors = matcher["errors"];
  return Array.isArray(errors) ? (errors as ProtoObject[]) : [];
}

function unknownSetToIds(unknownSet: ProtoObject | undefined): number[] {
  if (!unknownSet) return [];
  const exprs = unknownSet["exprs"];
  if (!Array.isArray(exprs)) return [];
  return exprs
    .map((id) => (typeof id === "string" || typeof id === "number" ? Number(id) : NaN))
    .filter((id) => Number.isFinite(id));
}

function unknownSetMatcherToList(matcher: ProtoObject | undefined): ProtoObject[] {
  if (!matcher) return [];
  const unknowns = matcher["unknowns"];
  return Array.isArray(unknowns) ? (unknowns as ProtoObject[]) : [];
}

function isProto2Test(test: SimpleTest): boolean {
  if (typeof test.container === "string" && test.container.includes(".proto2")) {
    return true;
  }
  const typeEnv = typeEnvToList(test.typeEnv);
  for (const decl of typeEnv) {
    const ident = decl["ident"] as ProtoObject | undefined;
    const type = ident?.["type"] as ProtoObject | undefined;
    const messageType = type?.["message_type"] ?? type?.["messageType"];
    if (typeof messageType === "string" && messageType.includes(".proto2")) {
      return true;
    }
  }
  return false;
}

function isDeclUnsupported(decl: ProtoObject): boolean {
  if (decl["function"]) {
    return true;
  }
  if (!decl["ident"]) {
    return true;
  }
  const ident = decl["ident"] as ProtoObject;
  if (ident["value"]) {
    return true;
  }
  const type = ident["type"] as ProtoObject | undefined;
  if (!type) {
    return true;
  }
  const kind = type["type_kind"] ?? type["typeKind"];
  if (kind === "abstract_type") {
    return true;
  }
  return false;
}

export type { RunStats };
