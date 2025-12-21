import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as protobuf from "protobufjs";
import { ProtobufTypeProvider } from "../../src/cel";

export type ProtoObject = Record<string, unknown>;

export type SimpleTest = {
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

export type SimpleTestSection = {
  name?: string;
  test?: SimpleTest[];
};

export type SimpleTestFile = {
  section?: SimpleTestSection[];
};

export type RunStats = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
};

export type ConformancePaths = {
  conformanceRoot: string;
  celSpecRoot: string;
  celGoRoot: string;
  testdataRoot: string;
  protoRoot: string;
  googleProtoRoot: string;
  proto2Root: string;
  proto3Root: string;
  descriptorSetPath: string;
};

export type ProtoFileLists = {
  extraProtoFiles: string[];
  conformanceProtoFiles: string[];
};

export type ConformanceRuntime = {
  paths: ConformancePaths;
  protoFiles: ProtoFileLists;
  root: protobuf.Root;
  protobufTypeProvider: ProtobufTypeProvider;
  options: protobuf.IConversionOptions;
  protoMessageAliases: Map<string, string>;
  skipFiles: Set<string>;
  skipResultKinds: Set<string>;
};

export function createRuntime(): ConformanceRuntime {
  const conformanceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  const celSpecRoot = path.join(conformanceRoot, "cel-spec");
  const celGoRoot = path.join(conformanceRoot, "cel-go");
  const testdataRoot = path.join(celSpecRoot, "tests", "simple", "testdata");
  const protoRoot = path.join(celSpecRoot, "proto");
  const googleProtoRoot = path.join(conformanceRoot, "protobuf", "src", "google", "protobuf");
  const proto2Root = path.join(celGoRoot, "test", "proto2pb");
  const proto3Root = path.join(celGoRoot, "test", "proto3pb");
  const descriptorSetPath = path.join(conformanceRoot, "conformance.desc");
  const paths: ConformancePaths = {
    conformanceRoot,
    celSpecRoot,
    celGoRoot,
    testdataRoot,
    protoRoot,
    googleProtoRoot,
    proto2Root,
    proto3Root,
    descriptorSetPath,
  };

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

  const extraProtoFiles = listProtoFilesByRoot(proto3Root, proto2Root);
  const conformanceProtoFiles = listProtoFiles(path.join(protoRoot, "cel/expr/conformance"));
  const protoFiles: ProtoFileLists = { extraProtoFiles, conformanceProtoFiles };

  const root = new protobuf.Root();
  root.resolvePath = (_origin, target) => {
    const normalizedTarget = normalizeAbsolutePath(target);
    if (path.isAbsolute(normalizedTarget)) {
      return normalizedTarget;
    }
    if (target.startsWith("google/protobuf/")) {
      return path.join(googleProtoRoot, target.slice("google/protobuf/".length));
    }
    if (target.startsWith("test/proto3pb/")) {
      return path.join(celGoRoot, target);
    }
    if (target.startsWith("test/proto2pb/")) {
      return path.join(celGoRoot, target);
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

  const protoMessageAliases = new Map([
    ["google.api.expr.test.v1.SimpleTestFile", "cel.expr.conformance.test.SimpleTestFile"],
  ]);

  const skipFiles = new Set([
    "block_ext.textproto",
    "proto2.textproto",
    "proto2_ext.textproto",
  ]);

  const skipResultKinds = new Set([
    "eval_error",
    "any_eval_errors",
    "unknown",
    "any_unknowns",
  ]);

  const options: protobuf.IConversionOptions = {
    defaults: false,
    longs: String,
    enums: String,
    bytes: Array,
    oneofs: true,
  };

  return {
    paths,
    protoFiles,
    root,
    protobufTypeProvider: new ProtobufTypeProvider(root),
    options,
    protoMessageAliases,
    skipFiles,
    skipResultKinds,
  };
}

export const runtime = createRuntime();

export function fileExists(filePath: string): boolean {
  try {
    statSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function normalizeAbsolutePath(target: string): string {
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

export function listProtoFilesByRoot(primaryRoot: string, secondaryRoot: string): string[] {
  const seen = new Map<string, string>();
  for (const file of listProtoFiles(primaryRoot)) {
    const rel = path.relative(primaryRoot, file);
    seen.set(rel, file);
  }
  for (const file of listProtoFiles(secondaryRoot)) {
    const rel = path.relative(secondaryRoot, file);
    if (!seen.has(rel)) {
      seen.set(rel, file);
    }
  }
  return [...seen.values()];
}

export function listProtoFiles(rootDir: string): string[] {
  const files: string[] = [];
  const entries = statSync(rootDir).isDirectory()
    ? readdirSync(rootDir, { withFileTypes: true })
    : [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listProtoFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".proto")) {
      files.push(fullPath);
    }
  }
  return files;
}
