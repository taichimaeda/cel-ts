import path from "node:path";
import { ContentType, LabelName, Stage, Status } from "allure-js-commons";
import { FileSystemWriter, ReporterRuntime } from "allure-js-commons/sdk/reporter";
import Table from "cli-table3";
import { consola } from "consola";
import type { RunStats } from "./protos";

export type TestContext = {
  fileName: string;
  sectionName: string;
  testName: string;
  expr?: string;
  container?: string;
  bindings?: Record<string, unknown>;
  disableCheck?: boolean;
  disableMacros?: boolean;
  checkOnly?: boolean;
  expectedValue?: unknown;
  expectedError?: boolean;
};

type StatusDetails = {
  message?: string;
  trace?: string;
};

type ReporterOptions = {
  resultsDir?: string;
};

type FileStats = {
  passed: number;
  failed: number;
  skipped: number;
};

/**
 * Reporter for conformance tests with Allure integration and console table output.
 */
export class ConformanceReporter {
  private readonly allureRuntime: ReporterRuntime;
  private readonly resultsDir: string;
  private readonly fileStats = new Map<string, FileStats>();

  constructor(options: ReporterOptions = {}) {
    const env = process.env as { ALLURE_RESULTS_DIR?: string };
    const resultsDir =
      options.resultsDir ??
      env.ALLURE_RESULTS_DIR ??
      path.resolve(process.cwd(), "test/conformance/results");
    this.resultsDir = resultsDir;
    this.allureRuntime = new ReporterRuntime({
      writer: new FileSystemWriter({ resultsDir }),
      environmentInfo: {
        runner: "conformance",
        node: process.version,
      },
    });
  }

  onTestStart(context: TestContext): string {
    this.trackFile(context.fileName);
    const testName = normalizeString(context.testName, "<test>");
    const sectionName = normalizeString(context.sectionName, "<section>");
    const fullName = `${context.fileName} :: ${sectionName} :: ${testName}`;
    const uuid = this.allureRuntime.startTest({
      name: testName,
      fullName,
      labels: [
        { name: LabelName.PARENT_SUITE, value: "conformance" },
        { name: LabelName.SUITE, value: context.fileName },
        { name: LabelName.SUB_SUITE, value: sectionName },
      ],
    });

    this.allureRuntime.updateTest(uuid, (result) => {
      if (context.expr) {
        result.parameters.push({ name: "expr", value: context.expr });
      }
      if (context.container) {
        result.parameters.push({ name: "container", value: context.container });
      }
      if (context.disableCheck) {
        result.parameters.push({ name: "disableCheck", value: "true" });
      }
      if (context.disableMacros) {
        result.parameters.push({ name: "disableMacros", value: "true" });
      }
      if (context.checkOnly) {
        result.parameters.push({ name: "checkOnly", value: "true" });
      }
      if (context.expectedError) {
        result.parameters.push({ name: "expectedError", value: "true" });
      }
    });

    if (context.bindings && Object.keys(context.bindings).length > 0) {
      this.addAttachment(uuid, "bindings.json", JSON.stringify(context.bindings, null, 2));
    }
    if (context.expectedValue !== undefined) {
      this.addAttachment(uuid, "expected.json", JSON.stringify(context.expectedValue, null, 2));
    }

    return uuid;
  }

  onTestPass(uuid: string, fileName: string): void {
    this.incrementStat(fileName, "passed");
    this.finishTest(uuid, Status.PASSED);
  }

  onTestFail(uuid: string, context: TestContext, message: string): void {
    this.incrementStat(context.fileName, "failed");
    if (message) {
      this.addAttachment(uuid, "failure", message);
    }
    this.finishTest(uuid, Status.FAILED, { message });
  }

  onTestError(uuid: string, context: TestContext, error: unknown): void {
    this.incrementStat(context.fileName, "failed");
    const details = formatError(error);
    if (details.message || details.trace) {
      this.addAttachment(uuid, "error", details.trace ?? details.message ?? "");
    }
    this.finishTest(uuid, Status.BROKEN, details);
  }

  onTestSkip(context: TestContext, reason: string): void {
    this.trackFile(context.fileName);
    this.incrementStat(context.fileName, "skipped");
    const uuid = this.onTestStart(context);
    this.finishTest(uuid, Status.SKIPPED, { message: reason });
  }

  printSummary(stats: RunStats, durationMs?: number): void {
    console.log("");
    this.printTable();
    this.printOverallStats(stats, durationMs);
    console.log("");
    consola.info(`Allure results: ${this.resultsDir}`);
    this.allureRuntime.writeEnvironmentInfo();
  }

  private printOverallStats(stats: RunStats, durationMs?: number): void {
    const total = stats.total;
    const passed = stats.passed;
    const failed = stats.failed;
    const skipped = stats.skipped;

    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : "0.0";
    const status = failed > 0 ? "\x1b[31mFAILED\x1b[0m" : "\x1b[32mPASSED\x1b[0m";
    const duration = durationMs ? ` in ${formatDuration(durationMs)}` : "";

    console.log("");
    console.log(
      `${status} | ${total} tests | ${passed} passed | ${failed} failed | ${skipped} skipped | ${passRate}% pass rate${duration}`
    );
  }

  private printTable(): void {
    const files = [...this.fileStats.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    const table = new Table({
      head: ["File", "Passed", "Failed", "Skipped", "Status"],
      colAligns: ["left", "right", "right", "right", "center"],
      style: { head: ["cyan"] },
    });

    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    for (const [fileName, stats] of files) {
      totalPassed += stats.passed;
      totalFailed += stats.failed;
      totalSkipped += stats.skipped;

      const status = stats.failed > 0 ? "\x1b[31m✗\x1b[0m" : "\x1b[32m✓\x1b[0m";
      table.push([fileName, stats.passed, stats.failed, stats.skipped, status]);
    }

    table.push([
      { content: "Total", hAlign: "left" },
      { content: totalPassed, hAlign: "right" },
      { content: totalFailed, hAlign: "right" },
      { content: totalSkipped, hAlign: "right" },
      "",
    ]);

    console.log(table.toString());
  }

  private trackFile(fileName: string): void {
    if (!this.fileStats.has(fileName)) {
      this.fileStats.set(fileName, { passed: 0, failed: 0, skipped: 0 });
    }
  }

  private incrementStat(fileName: string, stat: keyof FileStats): void {
    const stats = this.fileStats.get(fileName);
    if (stats) {
      stats[stat] += 1;
    }
  }

  private finishTest(uuid: string, status: Status, details?: StatusDetails): void {
    this.allureRuntime.updateTest(uuid, (result) => {
      result.status = status;
      result.stage = Stage.FINISHED;
      if (details) {
        result.statusDetails = { ...result.statusDetails, ...details };
      }
    });
    this.allureRuntime.stopTest(uuid);
    this.allureRuntime.writeTest(uuid);
  }

  private addAttachment(uuid: string, name: string, content: string): void {
    const buffer = Buffer.from(content, "utf-8");
    this.allureRuntime.writeAttachment(uuid, null, name, buffer, { contentType: ContentType.TEXT });
  }
}

function normalizeString(value: string | undefined, fallback: string): string {
  return value && value.length > 0 ? value : fallback;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
}

function formatError(error: unknown): StatusDetails {
  if (error instanceof Error) {
    return { message: error.message, ...(error.stack && { trace: error.stack }) };
  }
  return { message: typeof error === "string" ? error : String(error) };
}
