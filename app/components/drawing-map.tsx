"use client";
import {
  use,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Maximize2,
  Minimize2,
  Pentagon,
  Plus,
  Route,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { Point } from "../lib/data";
import type { MapView } from "../lib/explore-state";
import { cn } from "../lib/cn";
import { controlBase, fieldControl, iconButton } from "../lib/ui";
import { DrawSurfaceContext } from "./draw-surface";

const ProjectMap = dynamic(() => import("./project-map"), { ssr: false });

type Shape = "area" | "line";

const segment = cn(
  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted",
  "transition-[color,background-color,box-shadow] duration-150 motion-reduce:transition-none",
  "hover:text-ink aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-xs",
  "pointer-coarse:h-10",
);
const toolButton = cn(iconButton, "size-9 rounded-lg pointer-coarse:size-11");
const smallButton = cn(
  controlBase,
  "min-h-8 rounded-lg px-3 text-xs pointer-coarse:min-h-10",
);
const coordinatePattern = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/;

/**
 * The map a project's outline is drawn on, with its tools around it rather
 * than over it: area or route, which end of a route to extend, undo and clear
 * above; the point count and typed coordinates below. Clearing asks first
 * and can be undone. It can take the whole screen for detailed drawing,
 * tools and all; Escape or "Ferdig" brings it back. On desktop, in the
 * explorer, the map is the explorer's own map area instead (see
 * `DrawSurfaceContext`), and the tools stay in the sidebar.
 */
export default function DrawingMap({
  city,
  points,
  shape,
  onPointsChange,
  onShapeChange,
  compact = false,
  frameClassName,
  view,
}: {
  city: string;
  points: Point[];
  shape: Shape;
  onPointsChange: (points: Point[]) => void;
  onShapeChange: (shape: Shape) => void;
  /** No layer menu, for the small map in edit mode. */
  compact?: boolean;
  frameClassName?: string;
  /** Where to open, such as the spot the explorer's map was right-clicked. */
  view?: MapView;
}) {
  // Drawing edits can be undone one by one, moves and removals included.
  const [history, setHistory] = useState<Point[][]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [extendStart, setExtendStart] = useState(false);
  const [typing, setTyping] = useState(false);
  const [coordinate, setCoordinate] = useState("");
  const [coordinateError, setCoordinateError] = useState("");
  const [maximized, setMaximized] = useState(false);
  // Desktop: drawn on the explorer's map area, beside the form.
  const surface = use(DrawSurfaceContext);
  const keepClear = useRef<HTMLButtonElement>(null);
  const clearButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const maximizeButton = useRef<HTMLButtonElement>(null);
  const ids = useId();
  const minimum = shape === "area" ? 3 : 2;
  const enough = points.length >= minimum;
  const clearing = confirmClear && points.length > 0;
  // Only a route has two ends to choose between.
  const route = shape === "line" && points.length > 1;
  const fromStart = route && extendStart;

  useEffect(() => {
    if (clearing) keepClear.current?.focus();
  }, [clearing]);

  // In the top layer, the map escapes the panel and the drawer around it.
  useLayoutEffect(() => {
    if (maximized && !dialog.current?.open) dialog.current?.showModal();
  }, [maximized]);
  function minimize() {
    setMaximized(false);
    requestAnimationFrame(() => maximizeButton.current?.focus());
  }

  function change(next: Point[]) {
    setHistory((past) => [...past.slice(-49), points]);
    onPointsChange(next);
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory(history.slice(0, -1));
    onPointsChange(previous);
  }
  function cancelClear() {
    setConfirmClear(false);
    // The trigger is back once the confirmation is gone.
    requestAnimationFrame(() => clearButton.current?.focus());
  }
  function addCoordinate() {
    const match = coordinate.match(coordinatePattern);
    const point = match && ([Number(match[1]), Number(match[2])] as Point);
    if (
      !point ||
      point[0] < 57 ||
      point[0] > 81 ||
      point[1] < 3 ||
      point[1] > 36
    ) {
      setCoordinateError("Bruk breddegrad, lengdegrad i Norge, f.eks. 59.91, 10.75");
      return;
    }
    change(fromStart ? [point, ...points] : [...points, point]);
    setCoordinate("");
    setCoordinateError("");
  }

  const map = (
    <ProjectMap
      city={city}
      initialView={view}
      draw
      // On the explorer's map area there's room for the layer menu.
      compact={compact && !surface}
      points={points}
      geometryType={shape}
      onPointsChange={change}
      extendFromStart={fromStart}
    />
  );
  const onKeyDown = (event: React.KeyboardEvent) => {
        const target = event.target as HTMLElement;
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          event.key.toLowerCase() === "z" &&
          !target.closest("input, textarea")
        ) {
          event.preventDefault();
          undo();
        }
  };
  const clearTool = (
    <button
      ref={clearButton}
      type="button"
      className={cn(toolButton, "hover:bg-danger-soft hover:text-danger")}
      disabled={!points.length}
      onClick={() => setConfirmClear(true)}
      aria-label="Fjern alle punkter"
      data-tooltip="Fjern alle punkter"
    >
      <Trash2 size={18} aria-hidden="true" />
    </button>
  );
  // The tools: in the form above a small map, or floating over the
  // explorer's map area on desktop.
  const toolsInner = (
    <>
      {clearing ? (
        <div
          className="flex w-full items-center gap-1.5 motion-safe:animate-preview-in"
          role="group"
          aria-labelledby={`${ids}-clear`}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            cancelClear();
          }}
        >
          <p
            id={`${ids}-clear`}
            className={cn("mr-auto text-xs font-medium text-ink", surface && "pl-2")}
          >
            Fjerne alle {points.length} punkter?
          </p>
          <button
            type="button"
            className={cn(
              smallButton,
              "border border-danger/30 text-danger hover:bg-danger-soft",
            )}
            onClick={() => {
              change([]);
              setConfirmClear(false);
            }}
          >
            Fjern
          </button>
          {/* Last, where the trigger was, so a double click lands here. */}
          <button
            ref={keepClear}
            type="button"
            className={cn(
              smallButton,
              "border border-border-strong text-ink hover:bg-surface-muted",
            )}
            onClick={cancelClear}
          >
            Behold
          </button>
        </div>
      ) : (
        <>
          <div
            className="inline-flex rounded-lg bg-ink/[0.05] p-0.5"
            role="group"
            aria-label="Form"
          >
            <button
              type="button"
              className={segment}
              aria-pressed={shape === "area"}
              onClick={() => onShapeChange("area")}
            >
              <Pentagon size={16} aria-hidden="true" /> Område
            </button>
            <button
              type="button"
              className={segment}
              aria-pressed={shape === "line"}
              onClick={() => onShapeChange("line")}
            >
              <Route size={16} aria-hidden="true" /> Trasé
            </button>
          </div>
          <div className="ml-auto flex items-center gap-0.5">
            {route && (
              <>
                <button
                  type="button"
                  className={toolButton}
                  onClick={() => setExtendStart(!fromStart)}
                  aria-label={
                    fromStart
                      ? "Tegn videre fra slutten"
                      : "Tegn videre fra starten"
                  }
                  data-tooltip={
                    fromStart
                      ? "Tegn videre fra slutten"
                      : "Tegn videre fra starten"
                  }
                >
                  <ArrowLeftRight size={18} aria-hidden="true" />
                </button>
                <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
              </>
            )}
            <button
              type="button"
              className={toolButton}
              disabled={!history.length}
              onClick={undo}
              aria-label="Angre"
              data-tooltip="Angre"
            >
              <Undo2 size={18} aria-hidden="true" />
            </button>
            {/* Over the map, clearing stands apart from the band. */}
            {!surface && (
              <>
                <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
                {clearTool}
                <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
              </>
            )}
            {surface ? null : maximized ? (
              <button
                type="button"
                className={cn(
                  smallButton,
                  "ml-1 border border-border-strong bg-surface text-ink hover:bg-surface-muted",
                )}
                onClick={minimize}
              >
                <Minimize2 size={14} aria-hidden="true" />
                Ferdig
              </button>
            ) : (
              <button
                ref={maximizeButton}
                type="button"
                className={toolButton}
                onClick={() => setMaximized(true)}
                aria-label="Forstørr kartet"
                data-tooltip="Forstørr kartet"
              >
                <Maximize2 size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
  const content = (
    <>
      {!surface && (
        <div className="flex min-h-10 items-center gap-2" data-draw-tools="">
          {toolsInner}
        </div>
      )}
      {surface ? (
        createPortal(
          <div
            className="absolute inset-0 z-[700] bg-surface"
            data-draw-surface-map=""
          >
            {map}
            {/* The tools hover over the map's top, out of the way;
                clearing everything is a button of its own beside them. */}
            <div className="pointer-events-none absolute inset-x-0 top-3 z-[800] flex justify-center gap-2 px-3">
              <div
                className="pointer-events-auto flex min-h-11 max-w-full items-center gap-1 rounded-xl border border-border bg-surface py-1 pr-1 pl-1 shadow-popover"
                role="toolbar"
                aria-label="Tegneverktøy"
                data-draw-tools=""
              >
                {toolsInner}
                {!clearing && (
                  <>
                    <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
                    <span
                      className="flex items-center gap-1 pr-2 text-xs whitespace-nowrap text-muted data-[valid=true]:text-accent-strong"
                      data-valid={enough}
                    >
                      {enough && <Check size={14} aria-hidden="true" />}
                      {points.length === 0
                        ? "Klikk i kartet"
                        : `${points.length} ${points.length === 1 ? "punkt" : "punkter"}`}
                    </span>
                  </>
                )}
              </div>
              {!clearing && (
                <div
                  className="pointer-events-auto flex min-h-11 items-center rounded-xl border border-border bg-surface p-1 shadow-popover"
                  data-draw-clear=""
                >
                  {clearTool}
                </div>
              )}
            </div>
          </div>,
          surface,
        )
      ) : (
        <div
          className={cn(
            "relative overflow-hidden rounded-lg border border-border-strong",
            maximized ? "min-h-0 flex-1" : "h-80 max-md:h-72",
            frameClassName,
          )}
          data-base-ui-swipe-ignore
        >
          {map}
        </div>
      )}
      <div className="flex min-h-8 items-center gap-3 text-xs text-muted">
        <span
          className="mr-auto flex items-center gap-1.5 data-[valid=true]:text-accent-strong"
          data-valid={enough}
          role="status"
          aria-live="polite"
        >
          {enough && <Check size={14} aria-hidden="true" />}
          {points.length === 0 ? (
            surface ? (
              <span>Tegn i kartet til høyre</span>
            ) : (
              <>
                <span className="pointer-coarse:hidden">Klikk i kartet for å sette punkter</span>
                <span className="hidden pointer-coarse:inline">Trykk i kartet for å sette punkter</span>
              </>
            )
          ) : (
            <>
              {points.length} {points.length === 1 ? "punkt" : "punkter"}
              {!enough && ` · minst ${minimum}`}
            </>
          )}
        </span>
        <button
          type="button"
          className="-mr-1 inline-flex min-h-8 items-center gap-1 rounded-md px-1 font-medium text-muted hover:text-ink pointer-coarse:min-h-10"
          aria-expanded={typing}
          aria-controls={`${ids}-coordinates`}
          onClick={() => setTyping(!typing)}
        >
          Legg inn koordinater
          <ChevronDown
            size={14}
            className={cn("transition-transform motion-reduce:transition-none", typing && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>
      {typing && (
        <div
          id={`${ids}-coordinates`}
          className="rounded-lg border border-border bg-surface-muted/50 p-3 motion-safe:animate-preview-in"
        >
          <label htmlFor={`${ids}-input`} className="text-xs font-medium text-ink">
            Breddegrad, lengdegrad
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id={`${ids}-input`}
              className={cn(
                fieldControl,
                "min-h-9 min-w-0 flex-1 rounded-lg px-2.5 text-ui max-sm:text-base pointer-coarse:min-h-11",
              )}
              inputMode="decimal"
              autoComplete="off"
              placeholder="59.91, 10.75"
              value={coordinate}
              onChange={(event) => setCoordinate(event.target.value)}
              onKeyDown={(event) => {
                // Inside a form, Enter adds the point instead of submitting.
                if (event.key !== "Enter") return;
                event.preventDefault();
                addCoordinate();
              }}
              aria-invalid={coordinateError ? "true" : undefined}
              aria-describedby={coordinateError ? `${ids}-error` : undefined}
            />
            <button
              type="button"
              className={cn(
                smallButton,
                "min-h-9 shrink-0 border border-border-strong bg-surface text-ink hover:bg-surface-muted pointer-coarse:min-h-11",
              )}
              onClick={addCoordinate}
            >
              <Plus size={14} aria-hidden="true" />
              Legg til punkt
            </button>
          </div>
          {coordinateError && (
            <p id={`${ids}-error`} className="mt-1.5 text-xs text-danger" role="alert">
              {coordinateError}
            </p>
          )}
          {points.length > 0 && (
            <ol
              className="mt-3 max-h-44 overflow-y-auto border-t border-border scrollbar-thin"
              aria-label="Kartpunkter"
            >
              {points.map((point, index) => (
                <li
                  key={index}
                  className="flex min-h-9 items-center gap-2.5 border-b border-border text-xs last:border-b-0"
                >
                  <span className="w-4 shrink-0 text-right text-muted tabular-nums">
                    {index + 1}
                  </span>
                  <code className="min-w-0 flex-1 text-ink tabular-nums">
                    {point[0].toFixed(5)}, {point[1].toFixed(5)}
                  </code>
                  <button
                    type="button"
                    className={cn(toolButton, "size-8 hover:bg-danger-soft hover:text-danger")}
                    aria-label={`Fjern punkt ${index + 1}`}
                    onClick={() => change(points.filter((_, i) => i !== index))}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </>
  );

  if (!maximized)
    return (
      <div className="flex flex-col gap-2" onKeyDown={onKeyDown}>
        {content}
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      {/* Holds the map's place in the form while it's over everything. */}
      <div className="flex h-80 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong text-ui text-muted max-md:h-72">
        Kartet er forstørret
      </div>
      <dialog
        ref={dialog}
        aria-label="Tegn på kartet"
        className={cn(
          "fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none border-0 bg-surface text-ink",
          "open:flex open:flex-col open:gap-2",
          "px-[max(12px,env(safe-area-inset-left))] pt-[max(8px,env(safe-area-inset-top))] pb-[max(8px,env(safe-area-inset-bottom))]",
          "backdrop:bg-scrim/33",
        )}
        data-base-ui-swipe-ignore
        data-drawing-map-maximized=""
        onCancel={(event) => {
          event.preventDefault();
          minimize();
        }}
        onKeyDown={onKeyDown}
      >
        {content}
      </dialog>
    </div>
  );
}