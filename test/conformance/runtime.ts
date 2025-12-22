import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as protobuf from "protobufjs";
import { ProtobufTypeProvider } from "../../src/cel";

export type ProtoObject = Record<string, unknown>;

export type SimpleTest = {
  name?: string;
  expr?: string;
  disableMacros?: boolean;
  disableCheck?: boolean;
  checkOnly?: boolean;
  typeEnv?: ProtoObject[];
  container?: string;
  bindings?: Record<string, unknown>;
  typedResult?: ProtoObject;
  value?: ProtoObject;
  evalError?: ProtoObject;
  anyEvalErrors?: ProtoObject;
  unknown?: ProtoObject;
  anyUnknowns?: ProtoObject;
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
  testdataRoot: string;
  protoRoot: string;
  googleProtoRoot: string;
  proto2Root: string;
  proto3Root: string;
  descriptorSetPath: string;
};

export type ConformanceProtoFiles = {
  extraProtoFiles: string[];
  conformanceProtoFiles: string[];
};

export type ConformanceRuntime = {
  paths: ConformancePaths;
  protoFiles: ConformanceProtoFiles;
  root: protobuf.Root;
  protobufTypeProvider: ProtobufTypeProvider;
  options: protobuf.IConversionOptions;
  protoMessageAliases: Map<string, string>;
  skipFiles: Set<string>;
};

export function registerExtensionFields(
  root: protobuf.Root,
  options: { legacyProto2?: boolean } = {}
): void {
  if (!options.legacyProto2) {
    return;
  }
  const extensions: protobuf.Field[] = [];
  const visit = (node: protobuf.ReflectionObject): void => {
    if (node instanceof protobuf.Field && node.extend) {
      extensions.push(node);
    }
    const nested = (node as { nestedArray?: protobuf.ReflectionObject[] }).nestedArray;
    if (Array.isArray(nested)) {
      for (const child of nested) {
        visit(child);
      }
    }
  };
  visit(root);

  for (const field of extensions) {
    const targetName = extensionTargetName(field);
    if (!targetName) {
      continue;
    }
    let target: protobuf.Type;
    try {
      target = root.lookupType(targetName);
    } catch {
      continue;
    }
    const fullName = field.fullName ?? "";
    if (!fullName) {
      continue;
    }
    const already = target.fieldsArray.some(
      (existing) =>
        existing.name === fullName || existing.name === stripLeadingDot(fullName)
    );
    if (already) {
      continue;
    }
    if (field.extensionField && field.extensionField.parent && field.extensionField.parent !== target) {
      field.extensionField.parent.remove(field.extensionField);
      field.extensionField = null;
    }
    const rule = field.repeated ? "repeated" : undefined;
    const sister = new protobuf.Field(fullName, field.id, field.type, rule, undefined, field.options);
    sister.declaringField = field;
    field.extensionField = sister;
    target.add(sister);
  }
}

export function createRuntime(): ConformanceRuntime {
  const conformanceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  const celSpecRoot = path.join(conformanceRoot, "cel-spec");
  const testdataRoot = path.join(celSpecRoot, "tests", "simple", "testdata");
  const protoRoot = path.join(celSpecRoot, "proto");
  const googleProtoRoot = path.join(conformanceRoot, "protobuf", "src", "google", "protobuf");
  const proto2Root = path.join(conformanceRoot, "proto2pb");
  const proto3Root = path.join(conformanceRoot, "proto3pb");
  const descriptorSetPath = path.join(conformanceRoot, "conformance.desc");
  const paths: ConformancePaths = {
    conformanceRoot,
    celSpecRoot,
    testdataRoot,
    protoRoot,
    googleProtoRoot,
    proto2Root,
    proto3Root,
    descriptorSetPath,
  };

  if (
    !existsPath(testdataRoot) ||
    !existsPath(protoRoot) ||
    !existsPath(googleProtoRoot) ||
    !existsPath(proto2Root) ||
    !existsPath(proto3Root)
  ) {
    throw new Error(
      "Conformance dependencies are missing. Ensure submodules and proto fixtures are populated."
    );
  }

  const extraProtoFiles = listProtoFilesAcrossRoots(proto3Root, proto2Root);
  const conformanceProtoFiles = listProtoFiles(path.join(protoRoot, "cel/expr/conformance"));
  const protoFiles: ConformanceProtoFiles = { extraProtoFiles, conformanceProtoFiles };

  const root = new protobuf.Root();
  root.resolvePath = (_origin, target) => {
    const normalizedTarget = resolveAbsolutePath(target);
    const relativeTarget = normalizedTarget.replace(/^\.\//, "");
    const fixtureTarget = relativeTarget.startsWith("tests/")
      ? relativeTarget.replace(/^tests\//, "test/")
      : relativeTarget;
    if (path.isAbsolute(normalizedTarget)) {
      return normalizedTarget;
    }
    if (relativeTarget.startsWith("google/protobuf/")) {
      return path.join(googleProtoRoot, relativeTarget.slice("google/protobuf/".length));
    }
    if (fixtureTarget.startsWith("proto3pb/")) {
      return path.join(proto3Root, fixtureTarget.slice("proto3pb/".length));
    }
    if (fixtureTarget.startsWith("proto2pb/")) {
      return path.join(proto2Root, fixtureTarget.slice("proto2pb/".length));
    }
    if (fixtureTarget.startsWith("test/proto3pb/")) {
      return path.join(proto3Root, fixtureTarget.slice("test/proto3pb/".length));
    }
    if (fixtureTarget.startsWith("test/proto2pb/")) {
      return path.join(proto2Root, fixtureTarget.slice("test/proto2pb/".length));
    }
    const direct = path.join(protoRoot, relativeTarget);
    if (existsPath(direct)) {
      return direct;
    }
    const proto2Path = path.join(proto2Root, relativeTarget);
    if (existsPath(proto2Path)) {
      return proto2Path;
    }
    const proto3Path = path.join(proto3Root, relativeTarget);
    if (existsPath(proto3Path)) {
      return proto3Path;
    }
    return direct;
  };

  const protoMessageAliases = new Map([
    ["google.api.expr.test.v1.SimpleTestFile", "cel.expr.conformance.test.SimpleTestFile"],
  ]);

  const skipFiles = new Set<string>();

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
  };
}

export const runtime = createRuntime();

export function existsPath(targetPath: string): boolean {
  try {
    statSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function resolveAbsolutePath(target: string): string {
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
  if (existsPath(absoluteCandidate)) {
    return absoluteCandidate;
  }
  return target;
}

function extensionTargetName(field: protobuf.Field): string | null {
  const extend = field.extend;
  if (!extend) {
    return null;
  }
  if (extend.startsWith(".")) {
    return stripLeadingDot(extend);
  }
  const parent = field.parent;
  if (parent instanceof protobuf.Type) {
    const parentPackage = stripLeadingDot(parent.parent?.fullName ?? "");
    return parentPackage ? `${parentPackage}.${extend}` : extend;
  }
  const parentFull = stripLeadingDot(parent?.fullName ?? "");
  return parentFull ? `${parentFull}.${extend}` : extend;
}

function stripLeadingDot(name: string): string {
  return name.startsWith(".") ? name.slice(1) : name;
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

export function listProtoFilesAcrossRoots(primaryRoot: string, secondaryRoot: string): string[] {
  const seen = new Set<string>();
  const files: string[] = [];
  for (const file of listProtoFiles(primaryRoot)) {
    if (!seen.has(file)) {
      seen.add(file);
      files.push(file);
    }
  }
  for (const file of listProtoFiles(secondaryRoot)) {
    if (!seen.has(file)) {
      seen.add(file);
      files.push(file);
    }
  }
  return files;
}
