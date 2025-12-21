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
};

type RawSimpleTestSection = SimpleTestSection & { test?: RawSimpleTest[] };
type RawSimpleTestFile = SimpleTestFile & { section?: RawSimpleTestSection[] };

export function protoToSimpleTestFile(file: RawSimpleTestFile): SimpleTestFile {
  return {
    section: (file.section ?? []).map((section) => protoToSimpleTestSection(section)),
  };
}

function protoToSimpleTestSection(section: RawSimpleTestSection): SimpleTestSection {
  return {
    name: section.name,
    test: (section.test ?? []).map((test) => protoToSimpleTest(test)),
  };
}

function protoToSimpleTest(test: RawSimpleTest): SimpleTest {
  return {
    name: test.name,
    expr: test.expr,
    disableMacros: test.disableMacros ?? test.disable_macros,
    disableCheck: test.disableCheck ?? test.disable_check,
    checkOnly: test.checkOnly ?? test.check_only,
    typeEnv: test.typeEnv ?? test.type_env,
    container: test.container,
    bindings: test.bindings,
    typedResult: test.typedResult ?? test.typed_result,
    value: test.value,
    resultMatcher: test.resultMatcher ?? test.result_matcher,
  };
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
