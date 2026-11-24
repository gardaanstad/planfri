import Link from "next/link";
import { Children, type ComponentProps, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { textLink } from "../lib/ui";

/**
 * A centred icon and heading where a list has nothing to show, with an
 * optional line of explanation and, as children, `EmptyAction`s below.
 */
export default function EmptyState({
  icon,
  title,
  level = 3,
  description,
  className,
  children,
}: {
  icon: ReactNode;
  title: string;
  level?: 2 | 3;
  description?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  const actions = Children.toArray(children);
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2.5 px-4 py-10 text-center text-muted",
        className,
      )}
    >
      {icon}
      <Heading className="text-body font-medium text-ink">{title}</Heading>
      {description && (
        <div className="max-w-xs text-ui leading-normal text-muted max-md:text-xs">
          {description}
        </div>
      )}
      {actions.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {actions}
        </div>
      )}
    </div>
  );
}

const action =
  "group inline-flex items-center gap-1.5 text-ui leading-normal font-medium text-ink max-md:text-xs [&>svg]:shrink-0 [&>svg]:text-muted";

type ActionProps = { icon?: ReactNode; children: ReactNode };

/** A quiet link under an empty state; only its text is underlined. */
export function EmptyAction({
  icon,
  children,
  className,
  ...props
}: ActionProps &
  (
    | (Omit<ComponentProps<"button">, "children"> & { href?: undefined })
    | (Omit<ComponentProps<typeof Link>, "children"> & { href: string })
  )) {
  const content = (
    <>
      {icon}
      <span className={cn(textLink, "group-hover:decoration-current")}>
        {children}
      </span>
    </>
  );
  if (props.href !== undefined)
    return (
      <Link
        {...(props as ComponentProps<typeof Link>)}
        className={cn(action, className)}
      >
        {content}
      </Link>
    );
  return (
    <button
      type="button"
      {...(props as ComponentProps<"button">)}
      className={cn(action, className)}
    >
      {content}
    </button>
  );
}
