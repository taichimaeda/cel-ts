import { ConformanceReporter } from "./reporter";
import { runConformance } from "./runner";

const reporter = new ConformanceReporter();
const stats = await runConformance(reporter);
reporter.summarize(stats);

process.exit(stats.failed > 0 ? 1 : 0);
