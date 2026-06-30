/** Spread onto `motion.div` in `App.tsx` (wrapped by `AnimatePresence mode="wait"`). */
export const pageTransitionProps = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.4, ease: 'easeOut' as const },
  className: 'w-full h-full',
} as const;
