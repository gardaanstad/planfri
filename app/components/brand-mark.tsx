import { cn } from "../lib/cn";

/**
 * The logo in the header: a road bridge over a railway, drawn isometric.
 * It is the app icon (`app/icon.svg`) redrawn for about 28px, with fewer,
 * heavier sleepers, and in muted sage on a lighter tile for dark mode.
 *
 * Hovering its link (a `group`) sets things moving: the sleepers run under
 * the bridge and the road's centre line drives along. Each loops after one
 * sleeper or one dash, so both stop where they started. Motion is all it
 * adds, so reduced motion keeps it still.
 */
// The paths come from an isometric projection of a 64-unit tile; the hidden
// sleeper beneath the deck on each side is what lets the rail loop.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("shrink-0 overflow-hidden rounded-[23%]", className)}
      aria-hidden="true"
    >
      <rect width="64" height="64" className="fill-[#245b46] dark:fill-[#25423a]" />
      <path
        d="M-36.15 59.73L-16.04 71.34M-25.72 53.71L-5.61 65.32M-15.29 47.69L4.82 59.3M-4.87 41.67L15.24 53.28M5.56 35.66L25.67 47.27M15.99 29.63L36.1 41.24M27.9 22.75L48.01 34.37M38.33 16.73L58.44 28.34M48.76 10.71L68.87 22.32M59.18 4.7L79.29 16.3M69.61 -1.32L89.72 10.29M80.04 -7.34L100.15 4.27"
        strokeWidth="2.6"
        className="fill-none stroke-[#8fb8a5] group-hover:animate-mark-rail motion-reduce:animate-none dark:stroke-[#4a6a5d]"
      />
      <path
        d="M-50.89 73.15L83.17 -4.25M-39.28 79.86L94.79 2.46"
        strokeWidth="2.6"
        className="fill-none stroke-white dark:stroke-[#c3d3cb]"
      />
      <path
        d="M-53.65 -11.43L80.41 65.97L80.41 73.71L-53.65 -3.69Z"
        className="fill-[#79a691] dark:fill-[#6d8c7f]"
      />
      <path
        d="M-53.65 -11.43L80.41 65.97L97.54 56.08L-36.52 -21.32Z"
        className="fill-white dark:fill-[#b4c9be]"
      />
      <path
        d="M-45.08 -16.37L88.98 61.02"
        strokeWidth="2.1"
        strokeDasharray="4.4 3.4"
        className="fill-none stroke-[#245b46] group-hover:animate-mark-road motion-reduce:animate-none dark:stroke-[#25423a]"
      />
    </svg>
  );
}
