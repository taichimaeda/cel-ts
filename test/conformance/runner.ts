import type * as protobuf from "protobufjs";
import { Env, Function, MemberOverload, Overload, Struct, Variable } from "../../src/cel";
import { PrimitiveTypes, type Type } from "../../src/checker/types";
import {
  BindingsExtension,
  EncodersExtension,
  type Extension,
  MathExtension,
  OptionalTypesExtension,
  ProtosExtension,
  StringsExtension,
  TwoVarComprehensionsExtension,
  applyExtensions,
} from "../../src/extensions";
import { BoolValue, type Value, isUnknownValue, setAnyResolver } from "../../src/interpreter/values";
import {
  type ProtoLoader,
  type ProtoObject,
  type RunStats,
  type SimpleTest,
  type SimpleTestFile,
  protoLoader,
  stripTypeUrl,
} from "./protos";
import { ConformanceReporter, type TestContext } from "./reporter";
import { messageToValue, protoToType, protoToValue } from "./values";

/**
 * Test runner for CEL conformance tests.
 */
export class TestRunner {
  private readonly stats: RunStats = { total: 0, passed: 0, failed: 0, skipped: 0 };

  constructor(
    private readonly loader: ProtoLoader,
    private readonly reporter?: ConformanceReporter
  ) { }

  /**
   * Run all conformance tests.
   */
  async run(): Promise<RunStats> {
    await this.loader.init();
    this.setupAnyResolver();

    for (const fileName of this.loader.listTestFiles()) {
      this.processFile(fileName);
    }

    return this.stats;
  }

  private setupAnyResolver(): void {
    setAnyResolver((typeUrl, bytes) => {
      const typeName = stripTypeUrl(typeUrl);
      let messageType: protobuf.Type;
      try {
        messageType = this.loader.root.lookupType(typeName);
      } catch {
        return undefined;
      }
      const decoded = messageType.decode(bytes);
      const object = messageType.toObject(decoded, this.loader.options) as ProtoObject;
      return messageToValue(messageType, object, decoded as unknown as ProtoObject);
    });
  }

  private processFile(fileName: string): void {
    const file = this.loader.loadTestFile(fileName);

    if (this.loader.skipFiles.has(fileName)) {
      this.skipAllTests(fileName, file);
      return;
    }

    for (const { sectionName, test } of flattenTests(file)) {
      this.stats.total += 1;
      const ctx = buildTestContext(fileName, sectionName, test);
      const uuid = this.reporter?.onTestStart(ctx);

      try {
        if (this.executeTest(test, fileName, sectionName)) {
          this.stats.passed += 1;
          uuid && this.reporter?.onTestPass(uuid, fileName);
        } else {
          this.stats.failed += 1;
          uuid && this.reporter?.onTestFail(uuid, ctx, "assertion failed");
        }
      } catch (err) {
        this.stats.failed += 1;
        uuid && this.reporter?.onTestError(uuid, ctx, err);
      }
    }
  }

  private skipAllTests(fileName: string, file: SimpleTestFile): void {
    for (const { sectionName, test } of flattenTests(file)) {
      this.stats.skipped += 1;
      this.reporter?.onTestSkip(buildTestContext(fileName, sectionName, test), "file skipped");
    }
  }

  private executeTest(test: SimpleTest, fileName: string, sectionName: string): boolean {
    const expr = test.expr;
    if (!expr) return false;

    const env = new Env(this.buildEnvOptions(test, fileName, sectionName));
    const ast = test.disableCheck ? env.parse(expr) : env.compile(expr);

    // Check-only test: verify deduced type
    if (test.checkOnly) {
      const deducedType = test.typedResult?.["deduced_type"] as ProtoObject | undefined;
      if (!deducedType) return false;
      const expectedType = protoToType(deducedType);
      if (!expectedType) return false;
      return expectedType.isEquivalentType(ast.outputType ?? PrimitiveTypes.Dyn);
    }

    // Evaluate
    const program = env.program(ast);
    const bindings = convertBindings(test.bindings);
    const { value, error } = tryEval(program, bindings);

    // Check error expectations
    if (test.resultMatcher === "eval_error" || test.evalError) {
      return !!error;
    }
    if (test.resultMatcher === "any_eval_errors" || test.anyEvalErrors) {
      return !!error;
    }

    // Check unknown expectations
    if (test.resultMatcher === "unknown" || test.unknown) {
      return checkUnknown(test.unknown, value);
    }
    if (test.resultMatcher === "any_unknowns" || test.anyUnknowns) {
      return checkAnyUnknowns(test.anyUnknowns, value);
    }

    if (error || !value) return false;

    // Check typed result type
    if (test.typedResult) {
      const deducedType = test.typedResult["deduced_type"] as ProtoObject | undefined;
      if (deducedType) {
        const expectedType = protoToType(deducedType);
        if (!expectedType?.isEquivalentType(ast.outputType ?? PrimitiveTypes.Dyn)) {
          return false;
        }
      }
    }

    // Check expected value
    const expected = extractExpectedValue(test);
    if (!expected) {
      return value instanceof BoolValue && value.value();
    }

    const eq = expected.equal(value);
    return eq instanceof BoolValue && eq.value();
  }

  private buildEnvOptions(
    test: SimpleTest,
    fileName: string,
    sectionName: string
  ): ConstructorParameters<typeof Env>[0] {
    const variables: Variable[] = [];
    const structs: Struct[] = [];
    const functions = new Map<string, Overload[]>();

    for (const decl of test.typeEnv ?? []) {
      if (decl["function"]) {
        const func = convertFunctionDecl(decl);
        if (func) {
          const existing = functions.get(func.name) ?? [];
          functions.set(func.name, [...existing, ...func.overloads]);
        }
        continue;
      }

      const ident = decl["ident"] as ProtoObject | undefined;
      if (!ident) continue;

      const type = protoToType(ident["type"] as ProtoObject);
      const name = decl["name"] as string;
      if (!type || !name) continue;

      if (type.kind === "struct") {
        structs.push(new Struct(type.runtimeTypeName, []));
      }
      variables.push(new Variable(name, type));
    }

    const base: ConstructorParameters<typeof Env>[0] = {
      variables,
      structs,
      functions: [...functions].map(([name, overloads]) => new Function(name, ...overloads)),
      typeProvider: this.loader.typeProvider,
      disableTypeChecking: !!test.disableCheck,
      enumValuesAsInt: fileName === "enums.textproto" ? sectionName.startsWith("legacy_") : true,
      ...(test.container && { container: test.container as string }),
    };

    return applyExtensions(base, ...extensionsForFile(fileName));
  }
}

// Public entry point
export async function runConformance(reporter?: ConformanceReporter): Promise<RunStats> {
  const runner = new TestRunner(protoLoader, reporter);
  return runner.run();
}

// Helper functions

function flattenTests(file: SimpleTestFile): Array<{ sectionName: string; test: SimpleTest }> {
  const result: Array<{ sectionName: string; test: SimpleTest }> = [];
  for (const section of file.section ?? []) {
    for (const test of section.test ?? []) {
      result.push({ sectionName: section.name ?? "", test });
    }
  }
  return result;
}

function buildTestContext(fileName: string, sectionName: string, test: SimpleTest): TestContext {
  return {
    fileName,
    sectionName,
    testName: test.name ?? "<test>",
    ...(test.expr !== undefined && { expr: test.expr }),
    ...(test.container !== undefined && { container: test.container as string }),
    ...(test.bindings !== undefined && { bindings: test.bindings }),
    ...(test.disableCheck && { disableCheck: true }),
    ...(test.disableMacros && { disableMacros: true }),
    ...(test.checkOnly && { checkOnly: true }),
    ...(test.value !== undefined && { expectedValue: test.value }),
    ...(test.typedResult !== undefined && { expectedValue: test.typedResult }),
    ...((test.evalError !== undefined || test.anyEvalErrors !== undefined) && { expectedError: true }),
  };
}

function extensionsForFile(fileName: string): Extension[] {
  const base: Extension[] = [new OptionalTypesExtension()];
  const map: Record<string, Extension> = {
    "bindings_ext.textproto": new BindingsExtension(),
    "block_ext.textproto": new BindingsExtension(),
    "encoders_ext.textproto": new EncodersExtension(),
    "math_ext.textproto": new MathExtension(),
    "string_ext.textproto": new StringsExtension(),
    "macros2.textproto": new TwoVarComprehensionsExtension(),
    "proto2_ext.textproto": new ProtosExtension(),
  };
  const ext = map[fileName];
  return ext ? [...base, ext] : base;
}

function convertBindings(bindings?: Record<string, unknown>): Map<string, Value> {
  const result = new Map<string, Value>();
  if (!bindings) return result;

  for (const [name, expr] of Object.entries(bindings)) {
    const obj = expr as ProtoObject;
    if (obj["kind"] === "value") {
      const val = protoToValue(obj["value"] as ProtoObject);
      if (val) result.set(name, val);
    }
  }
  return result;
}

function extractExpectedValue(test: SimpleTest): Value | null {
  if (test.value) return protoToValue(test.value);
  if (test.typedResult?.["result"]) {
    return protoToValue(test.typedResult["result"] as ProtoObject);
  }
  return null;
}

function tryEval(
  program: ReturnType<Env["program"]>,
  bindings: Map<string, Value>
): { value?: Value; error?: string } {
  try {
    return { value: program.eval(bindings) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function extractUnknownIds(obj: ProtoObject | undefined): number[] {
  const exprs = obj?.["exprs"];
  if (!Array.isArray(exprs)) return [];
  return exprs.map((id) => Number(id)).filter((n) => Number.isFinite(n));
}

function checkUnknown(expected: ProtoObject | undefined, actual: Value | undefined): boolean {
  if (!actual || !isUnknownValue(actual)) return false;
  const ids = extractUnknownIds(expected);
  if (!ids.length) return true;
  const actualIds = actual.value() as readonly number[];
  return ids.every((id) => actualIds.includes(id));
}

function checkAnyUnknowns(expected: ProtoObject | undefined, actual: Value | undefined): boolean {
  const unknowns = (expected?.["unknowns"] ?? []) as ProtoObject[];
  if (!unknowns.length) return checkUnknown(undefined, actual);
  return unknowns.some((u) => checkUnknown(u, actual));
}

function convertFunctionDecl(decl: ProtoObject): { name: string; overloads: Overload[] } | null {
  const name = decl["name"];
  if (typeof name !== "string") return null;

  const func = decl["function"] as ProtoObject | undefined;
  const overloads = (func?.["overloads"] ?? func?.["overload"]) as ProtoObject[] | undefined;
  if (!overloads?.length) return null;

  const result: Overload[] = [];
  for (const overload of overloads) {
    const id = (overload["overload_id"] ?? overload["overloadId"]) as string | undefined;
    if (!id) continue;

    const params = (overload["params"] ?? []) as ProtoObject[];
    const argTypes = params.map((p) => protoToType(p) ?? PrimitiveTypes.Dyn);
    const resultType = protoToType((overload["result_type"] ?? overload["resultType"]) as ProtoObject) ?? PrimitiveTypes.Dyn;
    const typeParams = extractTypeParams(overload, argTypes, resultType);
    const isInstance = !!(overload["is_instance_function"] ?? overload["isInstanceFunction"]);

    result.push(
      isInstance
        ? new MemberOverload(id, argTypes as Type[], resultType, undefined, { typeParams })
        : new Overload(id, argTypes as Type[], resultType, undefined, { typeParams })
    );
  }

  return { name, overloads: result };
}

function extractTypeParams(overload: ProtoObject, argTypes: Type[], resultType: Type): string[] {
  const declared = (overload["type_params"] ?? overload["typeParams"]) as string[] | undefined;
  if (declared?.length) return declared;

  const params = new Set<string>();
  const collect = (t: Type) => {
    if (t.kind === "type_param") params.add(t.runtimeTypeName);
    t.parameters.forEach(collect);
  };
  [...argTypes, resultType].forEach(collect);
  return [...params];
}

export type { RunStats, TestContext };
