import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as protobuf from "protobufjs";
import { ProtobufTypeProvider } from "../../src/cel";

export type RunStats = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
};

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

// Raw proto type definitions (snake_case format from protobuf)
type RawSimpleTest = SimpleTest & {
  disable_macros?: boolean;
  disable_check?: boolean;
  check_only?: boolean;
  type_env?: ProtoObject[];
  typed_result?: ProtoObject;
  result_matcher?: string;
  eval_error?: ProtoObject;
  any_eval_errors?: ProtoObject;
  any_unknowns?: ProtoObject;
};

type RawSimpleTestSection = SimpleTestSection & { test?: RawSimpleTest[] };
type RawSimpleTestFile = SimpleTestFile & { section?: RawSimpleTestSection[] };

/**
 * Handles proto file loading, decoding, and protobuf environment setup.
 */
export class ProtoLoader {
  readonly root: protobuf.Root;
  readonly options: protobuf.IConversionOptions;
  readonly skipFiles = new Set<string>();

  private readonly paths: {
    conformanceRoot: string;
    testdataRoot: string;
    protoRoot: string;
    googleProtoRoot: string;
    proto2Root: string;
    proto3Root: string;
    descriptorSetPath: string;
  };
  private readonly protoFiles: {
    extraProtoFiles: string[];
    conformanceProtoFiles: string[];
  };
  private readonly messageAliases: Map<string, string>;
  private _typeProvider: ProtobufTypeProvider;

  constructor() {
    this.paths = this.buildPaths();
    this.protoFiles = this.buildProtoFileList();
    this.root = this.createRoot();
    this.options = { defaults: false, longs: String, enums: String, bytes: Array, oneofs: true };
    this.messageAliases = new Map([
      ["google.api.expr.test.v1.SimpleTestFile", "cel.expr.conformance.test.SimpleTestFile"],
    ]);
    this._typeProvider = new ProtobufTypeProvider(this.root);
  }

  get typeProvider(): ProtobufTypeProvider {
    return this._typeProvider;
  }

  /**
   * Initialize protobuf definitions - must be called before running tests.
   */
  async init(): Promise<void> {
    this.buildDescriptorSet();
    // Sort proto files to ensure stable loading order
    const filesToLoad = [
      ...this.protoFiles.conformanceProtoFiles,
      ...this.protoFiles.extraProtoFiles,
    ].sort();
    // Load synchronously to guarantee order (async load causes flaky tests)
    this.root.loadSync(filesToLoad, { keepCase: true });
    this.root.resolveAll();
    this.registerExtensions();
    this._typeProvider = new ProtobufTypeProvider(this.root, { legacyProto2: true });
  }

  /**
   * List all test files.
   */
  listTestFiles(): string[] {
    return readdirSync(this.paths.testdataRoot)
      .filter((f) => f.endsWith(".textproto"))
      .sort();
  }

  /**
   * Load and parse a test file.
   */
  loadTestFile(fileName: string): SimpleTestFile {
    const filePath = path.join(this.paths.testdataRoot, fileName);
    const text = readFileSync(filePath, "utf8");
    const protoFile = extractHeader(text, "proto-file");
    const protoMessage = extractHeader(text, "proto-message");

    const resolvedMessage = this.messageAliases.get(protoMessage) ?? protoMessage;
    const type = this.root.lookupType(resolvedMessage);
    const resolvedProtoFile = this.resolveProtoFilePath(filePath, protoFile);
    const encoded = this.encodeTextProto(resolvedProtoFile, resolvedMessage, text);
    const message = type.decode(encoded);
    const obj = type.toObject(message, this.options) as RawSimpleTestFile;

    return convertTestFile(obj);
  }

  private buildPaths() {
    const conformanceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
    const celSpecRoot = path.join(conformanceRoot, "cel-spec");

    const paths = {
      conformanceRoot,
      testdataRoot: path.join(celSpecRoot, "tests", "simple", "testdata"),
      protoRoot: path.join(celSpecRoot, "proto"),
      googleProtoRoot: path.join(conformanceRoot, "protobuf", "src", "google", "protobuf"),
      proto2Root: path.join(conformanceRoot, "proto2pb"),
      proto3Root: path.join(conformanceRoot, "proto3pb"),
      descriptorSetPath: path.join(conformanceRoot, "conformance.desc"),
    };

    for (const p of [
      paths.testdataRoot,
      paths.protoRoot,
      paths.googleProtoRoot,
      paths.proto2Root,
      paths.proto3Root,
    ]) {
      if (!fileExists(p)) {
        throw new Error(`Missing conformance dependency: ${p}`);
      }
    }
    return paths;
  }

  private buildProtoFileList() {
    const { proto3Root, proto2Root, protoRoot } = this.paths;
    return {
      extraProtoFiles: [...listProtoFiles(proto3Root), ...listProtoFiles(proto2Root)],
      conformanceProtoFiles: listProtoFiles(path.join(protoRoot, "cel/expr/conformance")),
    };
  }

  private createRoot(): protobuf.Root {
    const root = new protobuf.Root();
    root.resolvePath = (_origin, target) => this.resolveImportPath(target);
    return root;
  }

  private resolveImportPath(target: string): string {
    const { googleProtoRoot, proto3Root, proto2Root, protoRoot } = this.paths;
    const normalized = target.replace(/^\.\//, "");
    const fixture = normalized.startsWith("tests/")
      ? normalized.replace(/^tests\//, "test/")
      : normalized;

    if (path.isAbsolute(target)) return target;
    if (normalized.startsWith("google/protobuf/")) {
      return path.join(googleProtoRoot, normalized.slice("google/protobuf/".length));
    }

    const prefixes = [
      ["proto3pb/", proto3Root],
      ["proto2pb/", proto2Root],
      ["test/proto3pb/", proto3Root],
      ["test/proto2pb/", proto2Root],
    ] as const;

    for (const [prefix, root] of prefixes) {
      if (fixture.startsWith(prefix)) {
        return path.join(root, fixture.slice(prefix.length));
      }
    }

    for (const root of [protoRoot, proto2Root, proto3Root]) {
      const candidate = path.join(root, normalized);
      if (fileExists(candidate)) return candidate;
    }
    return path.join(protoRoot, normalized);
  }

  private resolveProtoFilePath(textProtoPath: string, headerPath: string): string {
    const baseDir = path.dirname(textProtoPath);
    const candidate = path.resolve(baseDir, headerPath);
    if (fileExists(candidate)) return candidate;

    const protoMarker = headerPath.indexOf("/proto/");
    if (protoMarker !== -1) {
      const suffix = headerPath.slice(protoMarker + "/proto/".length);
      const protoCandidate = path.join(this.paths.protoRoot, suffix);
      if (fileExists(protoCandidate)) return protoCandidate;
    }

    const fallback = path.join(this.paths.protoRoot, headerPath);
    if (fileExists(fallback)) return fallback;

    throw new Error(`Unable to resolve proto file: ${headerPath}`);
  }

  private buildDescriptorSet(): void {
    mkdirSync(path.dirname(this.paths.descriptorSetPath), { recursive: true });
    const inputs = [
      path.join(this.paths.protoRoot, "cel/expr/conformance/test/simple.proto"),
      ...this.protoFiles.extraProtoFiles,
      ...this.protoFiles.conformanceProtoFiles,
    ];
    const result = spawnSync("protoc", [
      `--proto_path=${this.paths.protoRoot}`,
      `--proto_path=${this.paths.googleProtoRoot}`,
      `--proto_path=${this.paths.conformanceRoot}`,
      "--include_imports",
      `--descriptor_set_out=${this.paths.descriptorSetPath}`,
      ...inputs,
    ]);
    if (result.status !== 0) {
      throw new Error(formatProtocError(result, "descriptor_set_out"));
    }
  }

  private encodeTextProto(protoFile: string, protoMessage: string, text: string): Uint8Array {
    const result = spawnSync(
      "protoc",
      [
        `--proto_path=${this.paths.protoRoot}`,
        `--proto_path=${this.paths.googleProtoRoot}`,
        `--proto_path=${this.paths.conformanceRoot}`,
        `--descriptor_set_in=${this.paths.descriptorSetPath}`,
        "--encode",
        protoMessage,
        protoFile,
        ...this.protoFiles.extraProtoFiles,
        ...this.protoFiles.conformanceProtoFiles,
      ],
      { input: text }
    );
    if (result.status !== 0) {
      throw new Error(formatProtocError(result, "encode"));
    }
    if (!result.stdout) {
      throw new Error("protoc encode produced no output");
    }
    return new Uint8Array(result.stdout);
  }

  private registerExtensions(): void {
    const extensions: protobuf.Field[] = [];
    const visit = (node: protobuf.ReflectionObject): void => {
      if (node instanceof protobuf.Field && node.extend) {
        extensions.push(node);
      }
      const nested = (node as { nestedArray?: protobuf.ReflectionObject[] }).nestedArray;
      if (Array.isArray(nested)) nested.forEach(visit);
    };
    visit(this.root);

    for (const field of extensions) {
      const targetName = extractExtensionTarget(field);
      if (!targetName) continue;

      let target: protobuf.Type;
      try {
        target = this.root.lookupType(targetName);
      } catch {
        continue;
      }

      const fullName = field.fullName ?? "";
      if (!fullName) continue;

      const exists = target.fieldsArray.some(
        (f) => f.name === fullName || f.name === fullName.replace(/^\./, "")
      );
      if (exists) continue;

      if (field.extensionField?.parent && field.extensionField.parent !== target) {
        field.extensionField.parent.remove(field.extensionField);
        field.extensionField = null;
      }

      const sister = new protobuf.Field(
        fullName,
        field.id,
        field.type,
        field.repeated ? "repeated" : undefined,
        undefined,
        field.options
      );
      sister.declaringField = field;
      field.extensionField = sister;
      target.add(sister);
    }
  }
}

// Utility functions

function fileExists(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

function listProtoFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fileExists(dir)) return files;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listProtoFiles(fullPath));
    } else if (entry.name.endsWith(".proto")) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractHeader(text: string, key: string): string {
  const match = text.match(new RegExp(`^#\\s*${key}:\\s*(.+)$`, "m"));
  if (!match) throw new Error(`Missing ${key} header`);
  return match[1]!.trim();
}

function formatProtocError(result: ReturnType<typeof spawnSync>, action: string): string {
  if (result.error) {
    const msg = result.error instanceof Error ? result.error.message : String(result.error);
    return msg.includes("ENOENT")
      ? `protoc ${action}: protoc not found`
      : `protoc ${action}: ${msg}`;
  }
  return `protoc ${action}: ${result.stderr?.toString() ?? "unknown error"}`;
}

function extractExtensionTarget(field: protobuf.Field): string | null {
  const extend = field.extend;
  if (!extend) return null;

  const stripDot = (s: string) => (s.startsWith(".") ? s.slice(1) : s);
  if (extend.startsWith(".")) return stripDot(extend);

  const parent = field.parent;
  const parentName = stripDot(parent?.fullName ?? "");
  return parentName ? `${parentName}.${extend}` : extend;
}

export function stripTypeUrl(typeUrl: string): string {
  const trimmed = typeUrl.startsWith("/") ? typeUrl.slice(1) : typeUrl;
  const slash = trimmed.lastIndexOf("/");
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

// Proto format conversion

function convertTestFile(file: RawSimpleTestFile): SimpleTestFile {
  const sections = (file.section ?? []).map(convertSection);
  return sections.length ? { section: sections } : {};
}

function convertSection(section: RawSimpleTestSection): SimpleTestSection {
  const tests = (section.test ?? []).map(convertTest);
  return {
    ...(section.name ? { name: section.name } : {}),
    ...(tests.length ? { test: tests } : {}),
  };
}

function convertTest(t: RawSimpleTest): SimpleTest {
  const result: SimpleTest = {};
  const set = <K extends keyof SimpleTest>(key: K, val: SimpleTest[K] | undefined) => {
    if (val !== undefined) result[key] = val;
  };

  set("name", t.name);
  set("expr", t.expr);
  set("disableMacros", t.disableMacros ?? t.disable_macros);
  set("disableCheck", t.disableCheck ?? t.disable_check);
  set("checkOnly", t.checkOnly ?? t.check_only);
  set("typeEnv", t.typeEnv ?? t.type_env);
  set("container", t.container);
  set("bindings", t.bindings);
  set("typedResult", t.typedResult ?? t.typed_result);
  set("value", t.value);
  set("evalError", t.evalError ?? t.eval_error);
  set("anyEvalErrors", t.anyEvalErrors ?? t.any_eval_errors);
  set("unknown", t.unknown);
  set("anyUnknowns", t.anyUnknowns ?? t.any_unknowns);
  set("resultMatcher", t.resultMatcher ?? t.result_matcher);

  return result;
}

// Singleton instance
export const protoLoader = new ProtoLoader();
