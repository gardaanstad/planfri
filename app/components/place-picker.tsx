"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "../lib/cn";
import { mainCities, placeName } from "../lib/places";
import ChoiceSelect from "./choice-select";
import { useCommunity } from "./community-provider";

/**
 * A project's place: the main cities, then every other place projects
 * name, A–Å. "Legg til sted" swaps the menu for a field to name a new one.
 */
export default function PlacePicker({
  value,
  onChange,
  id,
  className,
  triggerClassName,
  inputClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The control's id, for its field's label. */
  id?: string;
  className?: string;
  triggerClassName?: string;
  /** Classes for the field a new place is named in. */
  inputClassName?: string;
}) {
  const { projects } = useCommunity();
  // What the place was before adding one, to go back to.
  const [adding, setAdding] = useState<string | null>(null);
  const shown = placeName(value.trim());
  const options = useMemo(() => {
    const others = new Set(
      projects.map((project) => placeName(project.city.trim())),
    );
    if (shown) others.add(shown);
    for (const city of mainCities) others.delete(city);
    others.delete("");
    return [
      ...mainCities.map((city) => ({ value: city, label: city })),
      ...[...others]
        .sort((a, b) => a.localeCompare(b, "nb"))
        .map((city, index) => ({
          value: city,
          label: city,
          divider: index === 0,
        })),
    ];
  }, [projects, shown]);

  if (adding !== null) {
    const done = (keep: boolean) => {
      if (!keep || !value.trim()) onChange(adding);
      setAdding(null);
    };
    return (
      <input
        id={id}
        aria-label="Nytt sted"
        className={cn(inputClassName, className)}
        autoFocus
        maxLength={80}
        placeholder="Skriv inn stedet"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => done(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            done(true);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            done(false);
          }
        }}
      />
    );
  }

  return (
    <ChoiceSelect
      label="Sted"
      triggerId={id}
      value={shown}
      onChange={onChange}
      options={options}
      triggerLabel={shown || "Velg sted"}
      action={{
        label: "Legg til sted",
        icon: <Plus size={16} aria-hidden="true" />,
        onSelect: () => {
          setAdding(value);
          onChange("");
        },
      }}
      className={cn("w-full font-normal", className)}
      triggerClassName={cn(
        "font-normal",
        !shown && "text-muted",
        triggerClassName,
      )}
    />
  );
}
