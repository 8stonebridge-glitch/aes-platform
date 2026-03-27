import { useState, useCallback } from "react";

export interface StateMachineConfig<S extends string> {
  initial: S;
  transitions: Record<S, S[]>;
  onTransition?: (from: S, to: S) => void;
}

export interface UseStateMachineReturn<S extends string> {
  current: S;
  canTransition: (to: S) => boolean;
  transition: (to: S) => boolean;
  availableTransitions: () => S[];
  reset: () => void;
}

export function useStateMachine<S extends string>(
  config: StateMachineConfig<S>
): UseStateMachineReturn<S> {
  const [current, setCurrent] = useState<S>(config.initial);

  const canTransition = useCallback(
    (to: S): boolean => {
      const allowed = config.transitions[current];
      return allowed?.includes(to) ?? false;
    },
    [current, config.transitions]
  );

  const transition = useCallback(
    (to: S): boolean => {
      if (!canTransition(to)) return false;
      const from = current;
      setCurrent(to);
      config.onTransition?.(from, to);
      return true;
    },
    [current, canTransition, config]
  );

  const availableTransitions = useCallback((): S[] => {
    return config.transitions[current] ?? [];
  }, [current, config.transitions]);

  const reset = useCallback(() => {
    setCurrent(config.initial);
  }, [config.initial]);

  return { current, canTransition, transition, availableTransitions, reset };
}
