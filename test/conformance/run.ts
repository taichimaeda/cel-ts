import { runConformance } from "./runner";

const stats = await runConformance();
console.log(
  `Conformance summary: ${stats.passed} passed, ${stats.failed} failed, ${stats.skipped} skipped, ${stats.total} total.`
);

process.exit(stats.failed > 0 ? 1 : 0);
