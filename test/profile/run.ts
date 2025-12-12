import { cases } from "./cases.js";
import { ProfileRunner } from "./runner.js";

const iterations = 1_000_000;
const caseName = ""; // Runs all cases if caseName is empty

const warmupRunner = new ProfileRunner(cases.slice(0, 1), iterations / 10);
warmupRunner.run(caseName || undefined);

const runner = new ProfileRunner(cases, iterations);
runner.run(caseName || undefined);
