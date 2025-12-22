import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type * as protobuf from "protobufjs";
import {
  type ProtoObject,
  type SimpleTest,
  type SimpleTestFile,
  type SimpleTestSection,
  existsPath,
  resolveAbsolutePath,
  runtime,
} from "./runtime";

export function decodeTextProto(filePath: string): {
  type: protobuf.Type;
  message: protobuf.Message;
} {
  const text = readFileSync(filePath, "utf8");
  const protoFile = headerToValue(text, "proto-file");
  const protoMessage = headerToValue(text, "proto-message");

  const resolvedMessage = runtime.protoMessageAliases.get(protoMessage) ?? protoMessage;
  const type = runtime.root.lookupType(resolvedMessage);
  const resolvedProtoFile = headerToProtoFilePath(filePath, protoFile);
  const encoded = encodeTextProto(resolvedProtoFile, resolvedMessage, text);
  const message = type.decode(encoded);

  return { type, message };
}

type RawSimpleTest = SimpleTest & {
  disable_macros?: boolean;
  disable_check?: boolean;
  check_only?: boolean;
  type_env?: ProtoObject[];
  typed_result?: ProtoObject;
  result_matcher?: string;
  eval_error?: ProtoObject;
  any_eval_errors?: ProtoObject;
  unknown?: ProtoObject;
  any_unknowns?: ProtoObject;
};

type RawSimpleTestSection = SimpleTestSection & { test?: RawSimpleTest[] };
type RawSimpleTestFile = SimpleTestFile & { section?: RawSimpleTestSection[] };

export function protoToSimpleTestFile(file: RawSimpleTestFile): SimpleTestFile {
  const sections = (file.section ?? []).map((section) => protoToSimpleTestSection(section));
  return sections.length ? { section: sections } : {};
}

function protoToSimpleTestSection(section: RawSimpleTestSection): SimpleTestSection {
  const tests = (section.test ?? []).map((test) => protoToSimpleTest(test));
  return {
    ...(section.name !== undefined ? { name: section.name } : {}),
    ...(tests.length ? { test: tests } : {}),
  };
}

function protoToSimpleTest(test: RawSimpleTest): SimpleTest {
  const name = test.name;
  const expr = test.expr;
  const disableMacros = test.disableMacros ?? test.disable_macros;
  const disableCheck = test.disableCheck ?? test.disable_check;
  const checkOnly = test.checkOnly ?? test.check_only;
  const typeEnv = test.typeEnv ?? test.type_env;
  const container = test.container;
  const bindings = test.bindings;
  const typedResult = test.typedResult ?? test.typed_result;
  const value = test.value;
  const evalError = test.evalError ?? test.eval_error;
  const anyEvalErrors = test.anyEvalErrors ?? test.any_eval_errors;
  const unknown = test.unknown;
  const anyUnknowns = test.anyUnknowns ?? test.any_unknowns;
  const resultMatcher = test.resultMatcher ?? test.result_matcher;

  const simple: SimpleTest = {};
  const assign = (target: SimpleTest, key: keyof SimpleTest, value: unknown) => {
    if (value !== undefined) {
      target[key] = value as never;
    }
  };
  assign(simple, "name", name);
  assign(simple, "expr", expr);
  assign(simple, "disableMacros", disableMacros);
  assign(simple, "disableCheck", disableCheck);
  assign(simple, "checkOnly", checkOnly);
  assign(simple, "typeEnv", typeEnv);
  assign(simple, "container", container);
  assign(simple, "bindings", bindings);
  assign(simple, "typedResult", typedResult);
  assign(simple, "value", value);
  assign(simple, "evalError", evalError);
  assign(simple, "anyEvalErrors", anyEvalErrors);
  assign(simple, "unknown", unknown);
  assign(simple, "anyUnknowns", anyUnknowns);
  assign(simple, "resultMatcher", resultMatcher);
  return simple;
}

export function encodeTextProto(protoFile: string, protoMessage: string, text: string): Uint8Array {
  const result = spawnSync(
    "protoc",
    [
      `--proto_path=${runtime.paths.protoRoot}`,
      `--proto_path=${runtime.paths.googleProtoRoot}`,
      `--proto_path=${runtime.paths.celGoRoot}`,
      `--proto_path=${runtime.paths.proto3Root}`,
      `--proto_path=${runtime.paths.proto2Root}`,
      `--descriptor_set_in=${runtime.paths.descriptorSetPath}`,
      "--encode",
      protoMessage,
      protoFile,
      ...runtime.protoFiles.extraProtoFiles,
      ...runtime.protoFiles.conformanceProtoFiles,
    ],
    { input: text }
  );

  if (result.status !== 0) {
    throw new Error(`protoc encode failed: ${result.stderr?.toString() ?? "unknown error"}`);
  }

  if (!result.stdout) {
    throw new Error("protoc encode produced no output");
  }
  return new Uint8Array(result.stdout);
}

export function ensureDescriptorSet(): void {
  mkdirSync(path.dirname(runtime.paths.descriptorSetPath), { recursive: true });
  const descriptorInputs = [
    path.join(runtime.paths.protoRoot, "cel/expr/conformance/test/simple.proto"),
    ...runtime.protoFiles.extraProtoFiles,
    ...runtime.protoFiles.conformanceProtoFiles,
  ];
  const result = spawnSync("protoc", [
    `--proto_path=${runtime.paths.protoRoot}`,
    `--proto_path=${runtime.paths.googleProtoRoot}`,
    `--proto_path=${runtime.paths.celGoRoot}`,
    `--proto_path=${runtime.paths.proto3Root}`,
    `--proto_path=${runtime.paths.proto2Root}`,
    "--include_imports",
    `--descriptor_set_out=${runtime.paths.descriptorSetPath}`,
    ...descriptorInputs,
  ]);
  if (result.status !== 0) {
    throw new Error(
      `protoc descriptor_set_out failed: ${result.stderr?.toString() ?? "unknown error"}`
    );
  }
}

export function stripTypeUrl(typeUrl: string): string {
  const trimmed = typeUrl.startsWith("/") ? typeUrl.slice(1) : typeUrl;
  const slash = trimmed.lastIndexOf("/");
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

export function headerToValue(text: string, key: string): string {
  const match = text.match(new RegExp(`^#\\s*${key}:\\s*(.+)$`, "m"));
  if (!match) {
    throw new Error(`Missing ${key} header in testdata`);
  }
  return match[1]!.trim();
}

export function headerToProtoFilePath(textProtoPath: string, headerPath: string): string {
  const normalizedHeader = resolveAbsolutePath(headerPath);
  const baseDir = path.dirname(textProtoPath);
  const candidate = path.resolve(baseDir, normalizedHeader);
  if (existsPath(candidate)) {
    return candidate;
  }
  const protoMarker = normalizedHeader.indexOf("/proto/");
  if (protoMarker !== -1) {
    const suffix = normalizedHeader.slice(protoMarker + "/proto/".length);
    const protoCandidate = path.join(runtime.paths.protoRoot, suffix);
    if (existsPath(protoCandidate)) {
      return protoCandidate;
    }
  }
  const fallback = path.join(runtime.paths.protoRoot, normalizedHeader);
  if (existsPath(fallback)) {
    return fallback;
  }
  throw new Error(`Unable to resolve proto file: ${headerPath}`);
}

export type { ProtoObject };
