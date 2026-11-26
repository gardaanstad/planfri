"use client";

import { memo, type KeyboardEvent } from "react";
import { Check, ChevronRight } from "lucide-react";
import { categoryTree, type MainCategory } from "../lib/data";
import { cn } from "../lib/cn";
import CategoryIcon from "./category-icon";

type Node = (typeof categoryTree)[number];

// Opening and closing, as the choice menus' groups do.
const ease =
  "duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

/**
 * The filter's categories, in its sheet (phones) or popover: each main
 * category a row; chosen, it becomes an outlined card with its
 * subcategories as chips under it. The whole main reads as a chosen chip the card's width, with a
 * check; choosing chips narrows it to them, and the row turns plain while
 * the chips fill. Choosing a narrowed main widens it back to all of it, and
 * once more clears it.
 */
export default memo(function CategoryFilter({
  value,
  onChange,
  compact = false,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  /** Desktop: sized for a pointer, in the interface's text size. */
  compact?: boolean;
}) {
  const chosen = new Set(value);
  const narrowed = (node: Node) =>
    node.subcategories.some((sub) => chosen.has(sub));

  function toggleMain(node: Node) {
    const subs = new Set<string>(node.subcategories);
    if (!chosen.has(node.name)) onChange([...value, node.name]);
    else if (narrowed(node))
      onChange(value.filter((item) => !subs.has(item)));
    else onChange(value.filter((item) => item !== node.name && !subs.has(item)));
  }

  function toggleSub(main: MainCategory, sub: string) {
    if (chosen.has(sub)) onChange(value.filter((item) => item !== sub));
    else onChange([...value, ...(chosen.has(main) ? [] : [main]), sub]);
  }

  /** Arrows, Home and End move between the options shown. */
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="option"]',
      ),
    ].filter((item) => !item.closest("[inert]"));
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      next = (current + 1) % items.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      next = (current - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    items[next]?.focus();
  }

  return (
    <div
      role="listbox"
      aria-label="Kategori"
      aria-multiselectable
      data-category-filter=""
      className={cn(
        "flex flex-col",
        compact ? "gap-0.5 px-1.5" : "gap-1 px-2 pb-1",
      )}
      onKeyDown={navigate}
    >
      {categoryTree.map((node, index) => {
        const open = chosen.has(node.name);
        const whole = open && !narrowed(node);
        return (
          <div
            key={node.name}
            role="group"
            aria-label={node.name}
            data-category-group={node.name}
            data-open={open}
            className={cn(
              // Outlined while chosen; a plain row, the same size, while not.
              "flex flex-col border p-1 transition-[border-color] motion-reduce:transition-none",
              ease,
              compact ? "rounded-[22px]" : "rounded-[26px]",
              open ? "border-border" : "border-transparent",
            )}
          >
            <button
              type="button"
              role="option"
              aria-selected={whole}
              data-label={node.name}
              tabIndex={index === 0 ? 0 : -1}
              className={cn(
                // A rectangle to hover, as menu rows are; a pill once open.
                // Only its shape eases; hover and fill are there at once.
                "flex w-full items-center text-left font-medium -outline-offset-2",
                "transition-[border-radius] motion-reduce:transition-none",
                ease,
                // Half its height: a pill, as a radius that can ease.
                open
                  ? compact
                    ? "rounded-[18px] pointer-coarse:rounded-[22px]"
                    : "rounded-[22px]"
                  : "rounded-lg",
                compact
                  ? "min-h-9 gap-2 px-1.75 text-ui pointer-coarse:min-h-11"
                  : "min-h-11 gap-3 px-2 text-body",
                whole
                  ? // A chosen chip, the card's width.
                    "bg-inverse text-on-inverse hover:bg-inverse/88 focus-visible:bg-inverse/88 active:bg-inverse/88"
                  : "hover:bg-surface-muted focus-visible:bg-surface-muted active:bg-surface-muted",
              )}
              onClick={() => toggleMain(node)}
            >
              <CategoryIcon
                category={node.name}
                size={compact ? 16 : 20}
                className={cn(
                  "shrink-0",
                  whole ? "text-on-inverse/75" : open ? "text-ink" : "text-muted",
                )}
              />
              <span className="min-w-0 truncate">{node.name}</span>
              {/* The chevron turns into the check as the whole main is
                  chosen; a narrowed main has neither. */}
              <span
                aria-hidden="true"
                className={cn(
                  "relative ml-auto shrink-0",
                  compact ? "size-4" : "size-4.5",
                )}
              >
                <ChevronRight
                  size={compact ? 16 : 18}
                  className={cn(
                    "absolute inset-0 text-muted transition-[opacity,rotate,scale] motion-reduce:transition-none",
                    ease,
                    open && "scale-60 rotate-90 opacity-0",
                  )}
                />
                <Check
                  size={compact ? 16 : 18}
                  strokeWidth={2.5}
                  className={cn(
                    "absolute inset-0 transition-[opacity,rotate,scale] motion-reduce:transition-none",
                    ease,
                    !whole && "scale-60 -rotate-20 opacity-0",
                  )}
                />
              </span>
            </button>
            {/* Rows ease from 0fr to 1fr, so the card opens smoothly. */}
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity,visibility]",
                ease,
                open
                  ? "grid-rows-[1fr] opacity-100"
                  : "invisible grid-rows-[0fr] opacity-0",
              )}
              inert={!open}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  className={cn(
                    "flex flex-wrap gap-1.5 px-1",
                    compact ? "pt-1.5 pb-1" : "pt-2 pb-1",
                  )}
                >
                  {node.subcategories.map((sub) => {
                    const on = chosen.has(sub);
                    return (
                      <button
                        key={sub}
                        type="button"
                        role="option"
                        aria-selected={on}
                        data-label={sub}
                        tabIndex={-1}
                        className={cn(
                          // Bare until hovered or chosen; hover is at once.
                          "relative inline-flex items-center gap-1 rounded-full whitespace-nowrap -outline-offset-2",
                          compact
                            ? "h-7.5 px-2.75 text-ui"
                            : "h-9 px-3.25 text-sm",
                          // Reaches 44px on a coarse pointer.
                          "pointer-coarse:after:absolute pointer-coarse:after:-inset-y-1 pointer-coarse:after:inset-x-0",
                          on
                            ? "bg-inverse font-medium text-on-inverse hover:bg-inverse/88 active:bg-inverse/88"
                            : "text-ink hover:bg-surface-muted focus-visible:bg-surface-muted active:bg-surface-muted",
                        )}
                        onClick={() => toggleSub(node.name, sub)}
                      >
                        {on && (
                          <Check
                            size={compact ? 12 : 14}
                            strokeWidth={2.75}
                            aria-hidden="true"
                            className="-ml-0.5 shrink-0"
                          />
                        )}
                        {sub}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});
