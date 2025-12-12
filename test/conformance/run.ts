import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { ConformanceReporter } from "./reporter";
import { runConformance } from "./runner";

const shouldServe = process.argv.includes("--serve");
const resultsDir = path.resolve(process.cwd(), "test/conformance/results");
const descriptorPath = path.resolve(process.cwd(), "test/conformance/conformance.desc");

// Clean up previous results
rmSync(resultsDir, { recursive: true, force: true });
rmSync(descriptorPath, { force: true });

const reporter = new ConformanceReporter({ resultsDir });
const startTime = performance.now();
const stats = await runConformance(reporter);
const duration = performance.now() - startTime;
reporter.printSummary(stats, duration);

if (shouldServe) {
  console.log("\nGenerating and serving Allure report...");
  const allureBin = path.resolve(process.cwd(), "node_modules/.bin/allure");
  const child = spawn(allureBin, ["serve", resultsDir, "-p", "8080"], {
    stdio: "inherit",
    shell: true,
  });
  child.on("error", (err) => {
    console.error("Failed to start Allure server:", err.message);
    process.exit(1);
  });
} else {
  console.log("\nRun with --serve to view the HTML report in your browser.");
  process.exit(stats.failed > 0 ? 1 : 0);
}
