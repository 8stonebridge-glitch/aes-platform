/**
 * Builder Dispatcher — orchestrates a complete application build.
 *
 * ALL P0-P7 optimizations are wired and active:
 *   P0: Feature classification (build class → timeouts, concurrency, file limits)
 *   P1: Two-pass build (plan → validate scope → execute only if plan passes)
 *   P2: Slim bridge contracts (reduced prompt tokens passed to builder context)
 *   P3: Shared context precompute (cached route/schema/component maps)
 *   P4: Feature-class timeouts (per-class timeout enforcement)
 *   P5: Parallel execution (semaphore-based concurrency by dependency level)
 *   P6: Preflight gates (fast checks before each build)
 *   P7: Layered validation (L1 scope → L2 tests → L3 integration)
 *
 * Primary path: AppBuilder (single workspace, atomic commit).
 * Fallback: parallel per-feature builds with full optimization pipeline.
 */
import type { AESStateType } from "../state.js";
export declare function builderDispatcher(state: AESStateType): Promise<Partial<AESStateType>>;
