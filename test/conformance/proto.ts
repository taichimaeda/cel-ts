import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as protobuf from "protobufjs";
import { runtime, fileExists, normalizeAbsolutePath, type ProtoObject } from "./runtime";

export function decodeTextProto(filePath: string): { type: protobuf.Type; message: protobuf.Message } {
  const text = readFileSync(filePath, "utf8");
  const protoFile = extractHeader(text, "proto-file");
  const protoMessage = extractHeader(text, "proto-message");

  const resolvedMessage = runtime.protoMessageAliases.get(protoMessage) ?? protoMessage;
  const type = runtime.root.lookupType(resolvedMessage);
  const resolvedProtoFile = resolveProtoFile(filePath, protoFile);
  const encoded = encodeTextProto(resolvedProtoFile, resolvedMessage, text);
  const message = type.decode(encoded);

  return { type, message };
}

export function extractHeader(text: string, key: string): string {
  const match = text.match(new RegExp(`^#\\s*${key}:\\s*(.+)$`, "m"));
  if (!match) {
    throw new Error(`Missing ${key} header in testdata`);
  }
  return match[1]!.trim();
}

export function resolveProtoFile(textProtoPath: string, headerPath: string): string {
  const normalizedHeader = normalizeAbsolutePath(headerPath);
  const baseDir = path.dirname(textProtoPath);
  const candidate = path.resolve(baseDir, normalizedHeader);
  if (fileExists(candidate)) {
    return candidate;
  }
  const protoMarker = normalizedHeader.indexOf("/proto/");
  if (protoMarker !== -1) {
    const suffix = normalizedHeader.slice(protoMarker + "/proto/".length);
    const protoCandidate = path.join(runtime.paths.protoRoot, suffix);
    if (fileExists(protoCandidate)) {
      return protoCandidate;
    }
  }
  const fallback = path.join(runtime.paths.protoRoot, normalizedHeader);
  if (fileExists(fallback)) {
    return fallback;
  }
  throw new Error(`Unable to resolve proto file: ${headerPath}`);
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
    throw new Error(
      `protoc encode failed: ${result.stderr?.toString() ?? "unknown error"}`
    );
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

export type { ProtoObject };
