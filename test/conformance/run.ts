import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as protobuf from "protobufjs";
import { Env, Struct, Variable } from "../../src/cel";
import {
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  DynType,
  ErrorType,
  IntType,
  ListType,
  MapType,
  NullType,
  OpaqueType,
  StringType,
  StructType,
  TimestampType,
  Type,
  TypeKind,
  TypeParamType,
  TypeTypeWithParam,
  UintType,
} from "../../src/checker/type";
import {
  BoolValue,
  BytesValue,
  DoubleValue,
  IntValue,
  ListValue,
  MapValue,
  NullValue,
  StringValue,
  TypeValue,
  UintValue,
  type MapEntry,
  type Value,
} from "../../src/interpreter/value";

type ProtoObject = Record<string, unknown>;

type SimpleTest = {
  name?: string;
  expr?: string;
  disable_macros?: boolean;
  disable_check?: boolean;
  check_only?: boolean;
  type_env?: ProtoObject[];
  container?: string;
  bindings?: Record<string, unknown>;
  typed_result?: ProtoObject;
  value?: ProtoObject;
  result_matcher?: string;
  resultMatcher?: string;
};

type SimpleTestSection = {
  name?: string;
  test?: SimpleTest[];
};

type SimpleTestFile = {
  section?: SimpleTestSection[];
};

const conformanceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const celSpecRoot = path.join(conformanceRoot, "cel-spec");
const celGoRoot = path.join(conformanceRoot, "cel-go");
const testdataRoot = path.join(celSpecRoot, "tests", "simple", "testdata");
const protoRoot = path.join(celSpecRoot, "proto");
const googleProtoRoot = path.join(conformanceRoot, "protobuf", "src", "google", "protobuf");
const proto2Root = path.join(celGoRoot, "test", "proto2pb");
const proto3Root = path.join(celGoRoot, "test", "proto3pb");

if (
  !fileExists(testdataRoot) ||
  !fileExists(protoRoot) ||
  !fileExists(proto2Root) ||
  !fileExists(proto3Root)
) {
  throw new Error(
    "Conformance submodules are missing. Run `git submodule update --init --recursive`."
  );
}

const skipFiles = new Set([
  "proto2.textproto",
  "proto2_ext.textproto",
  "proto3.textproto",
  "fields.textproto",
  "enums.textproto",
  "wrappers.textproto",
]);

const skipResultKinds = new Set([
  "eval_error",
  "any_eval_errors",
  "unknown",
  "any_unknowns",
]);

const root = new protobuf.Root();
root.resolvePath = (_origin, target) => {
  const normalizedTarget = normalizeAbsolutePath(target);
  if (target.startsWith("google/protobuf/")) {
    return path.join(googleProtoRoot, target.slice("google/protobuf/".length));
  }
  const direct = path.join(protoRoot, normalizedTarget);
  if (fileExists(direct)) {
    return direct;
  }
  const proto2Path = path.join(proto2Root, normalizedTarget);
  if (fileExists(proto2Path)) {
    return proto2Path;
  }
  const proto3Path = path.join(proto3Root, normalizedTarget);
  if (fileExists(proto3Path)) {
    return proto3Path;
  }
  return direct;
};

await root.load("cel/expr/conformance/test/simple.proto", { keepCase: true });
root.resolveAll();

const options = {
  defaults: true,
  longs: String,
  enums: String,
  bytes: Array,
  oneofs: true,
};

const files = readdirSync(testdataRoot)
  .filter((file) => file.endsWith(".textproto"))
  .sort();

let total = 0;
let passed = 0;
let skipped = 0;
let failed = 0;

for (const fileName of files) {
  if (skipFiles.has(fileName)) {
    skipped += 1;
    continue;
  }

  const filePath = path.join(testdataRoot, fileName);
  const testFile = decodeTextProto(filePath);
  const fileObj = testFile.type.toObject(testFile.message, options) as SimpleTestFile;

  const sections = fileObj.section ?? [];
  for (const section of sections) {
    for (const test of section.test ?? []) {
      total += 1;
      const skipReason = shouldSkipTest(test);
      if (skipReason) {
        skipped += 1;
        continue;
      }

      try {
        const result = runSimpleTest(test);
        if (result) {
          passed += 1;
        } else {
          failed += 1;
          console.error(
            `[FAIL] ${fileName} :: ${section.name ?? "<section>"} :: ${test.name ?? "<test>"}`
          );
        }
      } catch (error) {
        failed += 1;
        console.error(
          `[ERROR] ${fileName} :: ${section.name ?? "<section>"} :: ${test.name ?? "<test>"}`
        );
        console.error(error);
      }
    }
  }
}

console.log(
  `Conformance summary: ${passed} passed, ${failed} failed, ${skipped} skipped, ${total} total.`
);

process.exit(failed > 0 ? 1 : 0);

function decodeTextProto(filePath: string): { type: protobuf.Type; message: protobuf.Message } {
  const text = readFileSync(filePath, "utf8");
  const protoFile = extractHeader(text, "proto-file");
  const protoMessage = extractHeader(text, "proto-message");

  const type = root.lookupType(protoMessage);
  const resolvedProtoFile = resolveProtoFile(filePath, protoFile);
  const encoded = encodeTextProto(resolvedProtoFile, protoMessage, text);
  const message = type.decode(encoded);

  return { type, message };
}

function extractHeader(text: string, key: string): string {
  const match = text.match(new RegExp(`^#\\s*${key}:\\s*(.+)$`, "m"));
  if (!match) {
    throw new Error(`Missing ${key} header in testdata`);
  }
  return match[1]!.trim();
}

function resolveProtoFile(textProtoPath: string, headerPath: string): string {
  const normalizedHeader = normalizeAbsolutePath(headerPath);
  const baseDir = path.dirname(textProtoPath);
  const candidate = path.resolve(baseDir, normalizedHeader);
  if (fileExists(candidate)) {
    return candidate;
  }
  const protoMarker = normalizedHeader.indexOf("/proto/");
  if (protoMarker !== -1) {
    const suffix = normalizedHeader.slice(protoMarker + "/proto/".length);
    const protoCandidate = path.join(protoRoot, suffix);
    if (fileExists(protoCandidate)) {
      return protoCandidate;
    }
  }
  const fallback = path.join(protoRoot, normalizedHeader);
  if (fileExists(fallback)) {
    return fallback;
  }
  throw new Error(`Unable to resolve proto file: ${headerPath}`);
}

function fileExists(filePath: string): boolean {
  try {
    statSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeAbsolutePath(target: string): string {
  if (path.isAbsolute(target)) {
    return target;
  }
  const absoluteCandidate = path.join(path.sep, target);
  if (
    target.includes("cel-spec/proto/") &&
    !target.startsWith(".") &&
    !target.startsWith(path.sep)
  ) {
    return absoluteCandidate;
  }
  if (fileExists(absoluteCandidate)) {
    return absoluteCandidate;
  }
  return target;
}

function encodeTextProto(protoFile: string, protoMessage: string, text: string): Uint8Array {
  const result = spawnSync(
    "protoc",
    [
      `--proto_path=${protoRoot}`,
      `--proto_path=${googleProtoRoot}`,
      `--proto_path=${proto2Root}`,
      `--proto_path=${proto3Root}`,
      "--encode",
      protoMessage,
      protoFile,
    ],
    { input: text }
  );

  if (result.status !== 0) {
    throw new Error(
      `protoc encode failed: ${result.stderr?.toString() ?? "unknown error"}`
    );
  }

  if (!result.stdout) {
    throw new Error("protoc encode produced no output");
  }
  return new Uint8Array(result.stdout);
}

function shouldSkipTest(test: SimpleTest): string | null {
  if (test.disable_macros) {
    return "macros disabled not supported";
  }
  const resultKind = test.result_matcher ?? test.resultMatcher;
  if (typeof resultKind === "string" && skipResultKinds.has(resultKind)) {
    return `result matcher ${resultKind} not supported`;
  }

  const typeEnv = test.type_env ?? [];
  if (typeEnv.some((decl) => usesUnsupportedDecl(decl))) {
    return "unsupported decl in type_env";
  }

  const bindings = test.bindings ?? {};
  if (!bindings || typeof bindings !== "object") {
    return null;
  }
  for (const value of Object.values(bindings)) {
    if (typeof value === "object" && value !== null) {
      const kind = (value as { kind?: string }).kind;
      if (kind && kind !== "value") {
        return "non-value bindings not supported";
      }
    }
  }
  return null;
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
  if (kind === "message_type" || kind === "abstract_type") {
    return true;
  }
  return false;
}

function runSimpleTest(test: SimpleTest): boolean {
  const envOptions = buildEnvOptions(test);
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
  } catch (error) {
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
    return false;
  }

  const eq = expected.equal(actual);
  return eq instanceof BoolValue && eq.value();
}

function buildEnvOptions(test: SimpleTest): ConstructorParameters<typeof Env>[0] {
  const variables: Variable[] = [];
  const structs: Struct[] = [];
  const container = test.container as string | undefined;
  const typeEnv = test.type_env ?? [];

  for (const decl of typeEnv) {
    if (!decl["ident"]) {
      continue;
    }
    const ident = decl["ident"] as ProtoObject;
    const type = typeFromProto(ident["type"] as ProtoObject);
    const name = ident["name"] as string;
    if (!type || !name) {
      continue;
    }
    if (type.kind === TypeKind.Struct) {
      structs.push(new Struct(type.runtimeTypeName, []));
    }
    variables.push(new Variable(name, type));
  }

  const options: ConstructorParameters<typeof Env>[0] = {
    variables,
    structs,
    disableTypeChecking: Boolean(test.disable_check),
  };
  if (container !== undefined) {
    options.container = container;
  }
  return options;
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

function valueFromProto(value: ProtoObject): Value | null {
  const kind = value["kind"] as string | undefined;
  if (!kind) {
    return null;
  }

  switch (kind) {
    case "null_value":
      return NullValue.Instance;
    case "bool_value":
      return BoolValue.of(Boolean(value["bool_value"]));
    case "int64_value":
      return IntValue.of(toBigInt(value["int64_value"]));
    case "uint64_value":
      return UintValue.of(toBigInt(value["uint64_value"]));
    case "double_value":
      return DoubleValue.of(Number(value["double_value"]));
    case "string_value":
      return StringValue.of(String(value["string_value"] ?? ""));
    case "bytes_value": {
      const bytes = value["bytes_value"] as Uint8Array | number[] | undefined;
      return BytesValue.of(bytes ? new Uint8Array(bytes) : new Uint8Array());
    }
    case "list_value": {
      const list = value["list_value"] as ProtoObject | undefined;
      const values = (list?.["values"] ?? []) as ProtoObject[];
      return ListValue.of(values.map((entry) => valueFromProto(entry) ?? NullValue.Instance));
    }
    case "map_value": {
      const map = value["map_value"] as ProtoObject | undefined;
      const entries = (map?.["entries"] ?? []) as ProtoObject[];
      const mapEntries: MapEntry[] = entries.map((entry) => ({
        key: valueFromProto(entry["key"] as ProtoObject) ?? NullValue.Instance,
        value: valueFromProto(entry["value"] as ProtoObject) ?? NullValue.Instance,
      }));
      return MapValue.of(mapEntries);
    }
    case "type_value":
      return typeValueFromName(String(value["type_value"] ?? ""));
    default:
      return null;
  }
}

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(value);
  }
  if (typeof value === "string") {
    return BigInt(value);
  }
  if (value && typeof value === "object" && "toString" in value) {
    return BigInt(String(value));
  }
  return 0n;
}

function typeFromProto(type: ProtoObject): Type | null {
  const typeKind = (type["type_kind"] ?? type["typeKind"]) as string | undefined;
  if (!typeKind) {
    return null;
  }

  switch (typeKind) {
    case "dyn":
      return DynType;
    case "null":
      return NullType;
    case "primitive":
      return primitiveTypeFromProto(type["primitive"] as string);
    case "wrapper":
      return primitiveTypeFromProto(type["wrapper"] as string);
    case "well_known":
      return wellKnownTypeFromProto(type["well_known"] as string);
    case "list_type": {
      const listType = type["list_type"] as ProtoObject;
      const elem = listType?.["elem_type"]
        ? typeFromProto(listType["elem_type"] as ProtoObject)
        : DynType;
      return new ListType(elem ?? DynType);
    }
    case "map_type": {
      const mapType = type["map_type"] as ProtoObject;
      const key = mapType?.["key_type"]
        ? typeFromProto(mapType["key_type"] as ProtoObject)
        : DynType;
      const value = mapType?.["value_type"]
        ? typeFromProto(mapType["value_type"] as ProtoObject)
        : DynType;
      return new MapType(key ?? DynType, value ?? DynType);
    }
    case "message_type":
      return new StructType(String(type["message_type"] ?? ""));
    case "type_param":
      return new TypeParamType(String(type["type_param"] ?? ""));
    case "type": {
      const inner = type["type"] as ProtoObject;
      return new TypeTypeWithParam(typeFromProto(inner) ?? DynType);
    }
    case "error":
      return ErrorType;
    case "abstract_type": {
      const abstract = type["abstract_type"] as ProtoObject;
      const name = String(abstract?.["name"] ?? "");
      const params = (abstract?.["parameter_types"] ?? []) as ProtoObject[];
      return new OpaqueType(name, ...params.map((param) => typeFromProto(param) ?? DynType));
    }
    default:
      return null;
  }
}

function primitiveTypeFromProto(value: string | undefined): Type {
  switch (value) {
    case "BOOL":
      return BoolType;
    case "INT64":
      return IntType;
    case "UINT64":
      return UintType;
    case "DOUBLE":
      return DoubleType;
    case "STRING":
      return StringType;
    case "BYTES":
      return BytesType;
    default:
      return DynType;
  }
}

function wellKnownTypeFromProto(value: string | undefined): Type {
  switch (value) {
    case "TIMESTAMP":
      return TimestampType;
    case "DURATION":
      return DurationType;
    case "ANY":
      return DynType;
    default:
      return DynType;
  }
}

function typeValueFromName(name: string): Value | null {
  switch (name) {
    case "bool":
      return TypeValue.BoolType;
    case "int":
      return TypeValue.IntType;
    case "uint":
      return TypeValue.UintType;
    case "double":
      return TypeValue.DoubleType;
    case "string":
      return TypeValue.StringType;
    case "bytes":
      return TypeValue.BytesType;
    case "null_type":
      return TypeValue.NullType;
    case "list":
      return TypeValue.ListType;
    case "map":
      return TypeValue.MapType;
    case "type":
      return TypeValue.TypeType;
    case "google.protobuf.Duration":
      return TypeValue.DurationType;
    case "google.protobuf.Timestamp":
      return TypeValue.TimestampType;
    default:
      return null;
  }
}
