import type { AESStateType } from "../state.js";

export async function vetoChecker(state: AESStateType): Promise<Partial<AESStateType>> {
  // TODO: Implement - runs veto gates (auth, permissions, data ownership, destructive ops)
  return {};
}
