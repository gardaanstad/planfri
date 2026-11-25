import { cn } from "../lib/cn";

/**
 * One choice of several: a ring on every row, filled in the middle once
 * chosen, both in the chosen row's ink. `large` on phones' sheets.
 */
// Drawn, not boxed, so the dot sits exactly in the middle at any scale.
export function Radio({
  chosen,
  large = false,
  className,
}: {
  chosen: boolean;
  large?: boolean;
  className?: string;
}) {
  const size = large ? 18 : 15;
  const middle = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      data-slot="choice-radio"
      // Its edge's smoothing may fall past a box at a fractional place.
      className={cn(
        "shrink-0 overflow-visible",
        chosen ? "text-ink" : "text-ink/35",
        className,
      )}
    >
      <circle
        cx={middle}
        cy={middle}
        r={middle - 1}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
      {chosen && (
        <circle cx={middle} cy={middle} r={large ? 5 : 4} fill="currentColor" />
      )}
    </svg>
  );
}
