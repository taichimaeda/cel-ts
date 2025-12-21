import { readdirSync } from "node:fs";
import path from "node:path";
import * as protobuf from "protobufjs";
import { Env, ProtobufTypeProvider, Struct, Variable } from "../../src/cel";
import {
  DynType,
  TypeKind,
} from "../../src/checker/types";
import {
  BindingsExtension,
  EncodersExtension,
  MathExtension,
  OptionalTypesExtension,
  StringsExtension,
  TwoVarComprehensionsExtension,
  applyExtensions,
  type Extension,
} from "../../src/extensions";
import {
  BoolValue,
  setAnyResolver,
  type Value,
} from "../../src/interpreter/values";
import {
  decodeTextProto,
  ensureDescriptorSet,
  stripTypeUrl,
} from "./proto";
import {
  runtime,
  type ProtoObject,
  type RunStats,
  type SimpleTest,
  type SimpleTestFile,
} from "./runtime";
import {
  messageToValue,
  typeFromProto,
  valueFromProto,
} from "./values";

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
    runTestFile(fileName, stats);
  }

  return stats;
}

function runTestFile(fileName: string, stats: RunStats): void {
  const filePath = path.join(runtime.paths.testdataRoot, fileName);
  const testFile = decodeTextProto(filePath);
  const fileObj = testFile.type.toObject(testFile.message, runtime.options) as SimpleTestFile;

  const sections = fileObj.section ?? [];
  for (const section of sections) {
    const sectionName = section.name ?? "";
    for (const test of section.test ?? []) {
      stats.total += 1;
      if (shouldSkipTest(test)) {
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

function shouldSkipTest(test: SimpleTest): boolean {
  if (test.disable_macros) {
    return true;
  }
  const resultKind = test.result_matcher ?? test.resultMatcher;
  if (typeof resultKind === "string" && runtime.skipResultKinds.has(resultKind)) {
    return true;
  }

  if (isProto2Test(test)) {
    return true;
  }

  const typeEnv = normalizeTypeEnv(test.type_env);
  if (typeEnv.some((decl) => usesUnsupportedDecl(decl))) {
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

function isProto2Test(test: SimpleTest): boolean {
  if (typeof test.container === "string" && test.container.includes(".proto2")) {
    return true;
  }
  const typeEnv = normalizeTypeEnv(test.type_env);
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

function usesUnsupportedDecl(decl: ProtoObject): boolean {
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

function runSimpleTest(test: SimpleTest, fileName: string, sectionName: string): boolean {
  const envOptions = buildEnvOptions(test, fileName, sectionName);
  const env = new Env(envOptions);

  const expr = test.expr;
  if (!expr) {
    return false;
  }
  const disableCheck = Boolean(test.disable_check);
  const checkOnly = Boolean(test.check_only);

  const ast = disableCheck ? env.parse(expr) : env.compile(expr);

  if (checkOnly) {
    const typedResult = test.typed_result;
    if (!typedResult?.["deduced_type"]) {
      return false;
    }
    const expectedType = typeFromProto(typedResult["deduced_type"] as ProtoObject);
    if (!expectedType) {
      return false;
    }
    const actualType = ast.outputType ?? DynType;
    return expectedType.isEquivalentType(actualType);
  }

  const program = env.program(ast);
  const bindings = valueBindings(test.bindings);
  let actual: Value;
  try {
    actual = program.eval(bindings);
  } catch {
    return false;
  }

  if (test.typed_result) {
    const typedResult = test.typed_result;
    const expectedType = typeFromProto(typedResult["deduced_type"] as ProtoObject);
    if (!expectedType) {
      return false;
    }
    const actualType = ast.outputType ?? DynType;
    if (!expectedType.isEquivalentType(actualType)) {
      return false;
    }
  }

  const expected = expectedValueFromTest(test);
  if (!expected) {
    return actual instanceof BoolValue && actual.value();
  }

  const eq = expected.equal(actual);
  return eq instanceof BoolValue && eq.value();
}

function buildEnvOptions(
  test: SimpleTest,
  fileName: string,
  sectionName: string
): ConstructorParameters<typeof Env>[0] {
  const variables: Variable[] = [];
  const structs: Struct[] = [];
  const container = test.container as string | undefined;
  const typeEnv = normalizeTypeEnv(test.type_env);

  for (const decl of typeEnv) {
    if (!decl["ident"]) {
      continue;
    }
    const ident = decl["ident"] as ProtoObject;
    const type = typeFromProto(ident["type"] as ProtoObject);
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
    disableTypeChecking: Boolean(test.disable_check),
    enumValuesAsInt: fileName === "enums.textproto" ? sectionName.startsWith("legacy_") : true,
  };
  if (container !== undefined) {
    baseOptions.container = container;
  }
  return applyExtensions(baseOptions, ...extensionOptionsForFile(fileName));
}

function normalizeTypeEnv(typeEnv: SimpleTest["type_env"]): ProtoObject[] {
  if (!typeEnv) return [];
  return Array.isArray(typeEnv) ? typeEnv : [typeEnv];
}

function extensionOptionsForFile(fileName: string): Extension[] {
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

function valueBindings(bindings: Record<string, unknown> | undefined): Map<string, Value> {
  const result = new Map<string, Value>();
  if (!bindings) return result;

  for (const [name, exprValue] of Object.entries(bindings)) {
    const value = exprValueToValue(exprValue as ProtoObject);
    if (value) {
      result.set(name, value);
    }
  }
  return result;
}

function exprValueToValue(exprValue: ProtoObject): Value | null {
  const kind = exprValue["kind"] as string | undefined;
  if (!kind || kind !== "value") {
    return null;
  }
  return valueFromProto(exprValue["value"] as ProtoObject);
}

function expectedValueFromTest(test: SimpleTest): Value | null {
  if (test.value) {
    return valueFromProto(test.value as ProtoObject);
  }
  if (test.typed_result) {
    const typed = test.typed_result;
    if (!typed["result"]) {
      return null;
    }
    return valueFromProto(typed["result"] as ProtoObject);
  }
  return null;
}

export type { RunStats };
