import type { AESStateType } from "./state.js";

function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function isAutonomousBuild(
  state?: Pick<AESStateType, "autonomous"> | { autonomous?: boolean | null },
): boolean {
  return !!state?.autonomous || envFlag("AES_AUTONOMOUS_MODE");
}

export function shouldAutoConfirmIntent(
  state?: Pick<AESStateType, "autonomous"> | { autonomous?: boolean | null },
): boolean {
  return isAutonomousBuild(state) || envFlag("AES_AUTO_CONFIRM");
}

export function shouldAutoApprovePlan(
  state?: Pick<AESStateType, "autonomous"> | { autonomous?: boolean | null },
): boolean {
  return isAutonomousBuild(state) || envFlag("AES_AUTO_APPROVE");
}
