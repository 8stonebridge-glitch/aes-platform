"use client";

import { motion, AnimatePresence } from "motion/react";

interface ThinkingLineProps {
  text: string;
  phase?: string;
}

export function ThinkingLine({ text, phase = "idle" }: ThinkingLineProps) {
  const isActive = phase !== "idle" && phase !== "complete";

  return (
    <div className="flex items-center gap-3">
      {/* Amber pulse dot — matches Paper design */}
      <motion.span
        className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--accent)]"
        animate={isActive ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
        transition={isActive ? { duration: 1.5, repeat: Infinity } : undefined}
      />

      <AnimatePresence mode="wait">
        <motion.p
          key={text}
          className="m-0 text-[13px] leading-5 text-[var(--text-primary)]"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          {text}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
