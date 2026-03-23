import chalk from "chalk";

const GATE_COLORS: Record<string, (s: string) => string> = {
  gate_0: chalk.cyan,
  gate_1: chalk.blue,
  gate_2: chalk.magenta,
  gate_3: chalk.red,
  gate_4: chalk.yellow,
  gate_5: chalk.green,
  building: chalk.white,
  deploying: chalk.greenBright,
  complete: chalk.green,
  failed: chalk.redBright,
};

export function logGate(gate: string, message: string): void {
  const colorFn = GATE_COLORS[gate] || chalk.white;
  const label = gate.replace("_", " ").toUpperCase();
  console.log(`${colorFn(`[${label}]`)} ${message}`);
}

export function logStep(message: string): void {
  console.log(`  ${chalk.gray("→")} ${message}`);
}

export function logSuccess(message: string): void {
  console.log(`  ${chalk.green("✓")} ${message}`);
}

export function logFail(message: string): void {
  console.log(`  ${chalk.red("✗")} ${message}`);
}

export function logWarn(message: string): void {
  console.log(`  ${chalk.yellow("⚠")} ${message}`);
}

export function logPause(message: string): void {
  console.log(`\n${chalk.yellowBright("⏸")}  ${chalk.bold(message)}\n`);
}

export function logDivider(): void {
  console.log(chalk.gray("─".repeat(60)));
}

export function logHeader(title: string): void {
  console.log(`\n${chalk.bold.white(title)}`);
  logDivider();
}

export function logKeyValue(key: string, value: string): void {
  console.log(`  ${chalk.gray(key + ":")} ${value}`);
}

export function logFeatureStatus(
  featureId: string,
  name: string,
  status: string
): void {
  const statusIcons: Record<string, string> = {
    pending: chalk.gray("○"),
    draft: chalk.gray("○"),
    validated: chalk.blue("◐"),
    approved: chalk.cyan("●"),
    executing: chalk.yellow("◉"),
    passed: chalk.green("●"),
    failed: chalk.red("●"),
    blocked: chalk.red("◌"),
  };
  const icon = statusIcons[status] || chalk.gray("?");
  console.log(`  ${icon} ${name} ${chalk.gray(`(${featureId})`)} — ${status}`);
}
