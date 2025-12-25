import path from "node:path";
import chalk from "chalk";
import { ContentType, LabelName, Stage, Status } from "allure-js-commons";
import { FileSystemWriter, ReporterRuntime } from "allure-js-commons/sdk/reporter";
import type { RunStats } from "./runtime";

type TestLocation = {
  fileName: string;
  sectionName: string;
  testName: string;
};

type TestContext = TestLocation & {
  expr?: string;
};

type StatusDetails = {
  message?: string;
  trace?: string;
};

type ReporterOptions = {
  resultsDir?: string;
};

export class ConformanceReporter {
  private readonly runtime: ReporterRuntime;
  private readonly resultsDir: string;

  constructor(options: ReporterOptions = {}) {
    const resultsDir =
      options.resultsDir ??
      process.env.ALLURE_RESULTS_DIR ??
      path.resolve(process.cwd(), "allure-results");
    this.resultsDir = resultsDir;
    this.runtime = new ReporterRuntime({
      writer: new FileSystemWriter({ resultsDir }),
      environmentInfo: {
        runner: "conformance",
        node: process.version,
      },
    });
  }

  startTest(context: TestContext): string {
    const testName = normalizeName(context.testName, "<test>");
    const sectionName = normalizeName(context.sectionName, "<section>");
    const fullName = `${context.fileName} :: ${sectionName} :: ${testName}`;
    const uuid = this.runtime.startTest({
      name: testName,
      fullName,
      labels: [
        { name: LabelName.PARENT_SUITE, value: "conformance" },
        { name: LabelName.SUITE, value: context.fileName },
        { name: LabelName.SUB_SUITE, value: sectionName },
      ],
    });
    if (context.expr) {
      this.runtime.updateTest(uuid, (result) => {
        result.parameters.push({ name: "expr", value: context.expr ?? "" });
      });
    }
    return uuid;
  }

  passTest(uuid: string): void {
    this.finalizeTest(uuid, Status.PASSED);
  }

  failTest(uuid: string, context: TestLocation, message: string): void {
    this.logFailure("FAIL", context, message);
    if (message) {
      this.writeAttachment(uuid, "failure", message);
    }
    this.finalizeTest(uuid, Status.FAILED, { message });
  }

  errorTest(uuid: string, context: TestLocation, error: unknown): void {
    const details = formatStatusDetails(error);
    this.logFailure("ERROR", context, details.message ?? "Error");
    if (details.trace) {
      console.error(details.trace);
    }
    if (details.message || details.trace) {
      this.writeAttachment(uuid, "error", details.trace ?? details.message ?? "");
    }
    this.finalizeTest(uuid, Status.BROKEN, details);
  }

  skipTest(context: TestContext, reason: string): void {
    const uuid = this.startTest(context);
    this.logSkip(context, reason);
    this.finalizeTest(uuid, Status.SKIPPED, { message: reason });
  }

  summarize(stats: RunStats): void {
    const summary = [
      `${chalk.green(stats.passed)} passed`,
      `${chalk.red(stats.failed)} failed`,
      `${chalk.yellow(stats.skipped)} skipped`,
      `${chalk.cyan(stats.total)} total`,
    ].join(", ");
    console.log(`Conformance summary: ${summary}.`);
    console.log(`Allure results: ${this.resultsDir}`);
    this.runtime.writeEnvironmentInfo();
  }

  private finalizeTest(uuid: string, status: Status, details?: StatusDetails): void {
    this.runtime.updateTest(uuid, (result) => {
      result.status = status;
      result.stage = Stage.FINISHED;
      if (details) {
        result.statusDetails = { ...result.statusDetails, ...details };
      }
    });
    this.runtime.stopTest(uuid);
    this.runtime.writeTest(uuid);
  }

  private logFailure(kind: "FAIL" | "ERROR", context: TestLocation, message: string): void {
    const prefix = kind === "FAIL" ? chalk.red("FAIL") : chalk.redBright("ERROR");
    console.error(
      `[${prefix}] ${context.fileName} :: ${context.sectionName || "<section>"} :: ${
        context.testName || "<test>"
      } - ${message}`
    );
  }

  private logSkip(context: TestLocation, reason: string): void {
    console.log(
      `[${chalk.yellow("SKIP")}] ${context.fileName} :: ${context.sectionName || "<section>"} :: ${
        context.testName || "<test>"
      } - ${reason}`
    );
  }

  private writeAttachment(uuid: string, name: string, content: string): void {
    this.runtime.writeAttachment(uuid, null, name, content, { contentType: ContentType.TEXT });
  }
}

function normalizeName(value: string | undefined, fallback: string): string {
  return value && value.length > 0 ? value : fallback;
}

function formatStatusDetails(error: unknown): StatusDetails {
  if (error instanceof Error) {
    return { message: error.message, trace: error.stack };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  return { message: String(error) };
}
