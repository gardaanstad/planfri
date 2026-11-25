"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

type Manager = {
  add(options: {
    id: string;
    title: string;
    type: string;
    timeout: number;
    actionProps?: { children: string; onClick: () => void };
  }): string;
  close(id: string): void;
};

type Options = {
  /** Offers "Angre"; the toast closes as it runs. */
  undo?: () => void;
  error?: boolean;
  /** Names something rather than confirming it: no check mark. */
  info?: boolean;
};

// The toasts' code loads after the page (see `Toaster`), and their provider
// starts listening in an effect after that, so a toast shown first would be
// lost. Until then, toasts wait here.
let manager: Manager | null = null;
let waiting: { id: string; show: (manager: Manager) => void }[] = [];
let nextId = 0;
let requestView = () => {};

/** Shows a short confirmation, or an error, from anywhere on the client. */
export function notify(
  message: string,
  { undo, error, info }: Options = {},
) {
  const id = `toast-${++nextId}`;
  const show = (manager: Manager) =>
    manager.add({
      id,
      title: message,
      type: error ? "error" : info ? "info" : "success",
      timeout: undo ? 8000 : error ? 7000 : info ? 3000 : 5000,
      actionProps: undo && {
        children: "Angre",
        onClick: () => {
          manager.close(id);
          undo();
        },
      },
    });
  if (manager) show(manager);
  else {
    waiting.push({ id, show });
    requestView();
  }
  return id;
}

/** Closes a toast `notify` showed, if it is still up. */
export function dismiss(id: string) {
  if (manager) manager.close(id);
  else waiting = waiting.filter((toast) => toast.id !== id);
}

/** Called by the toasts' view once it listens; shows what waited. */
export function attachToasts(next: Manager) {
  manager = next;
  const queued = waiting;
  waiting = [];
  queued.forEach(({ show }) => show(next));
  return () => {
    manager = null;
  };
}

const ToastView = dynamic(() => import("./toast-view"), { ssr: false });

/**
 * Renders every toast. Mounted once, in the root layout. Nothing shows until
 * a toast does, so their code loads once the page is idle, or at once for
 * the first toast.
 */
export function Toaster() {
  const [load, setLoad] = useState(false);
  useEffect(() => {
    requestView = () => setLoad(true);
    if (waiting.length) requestView();
    const start = () => {
      const idle = () => setLoad(true);
      const timer = setTimeout(
        () =>
          "requestIdleCallback" in window
            ? requestIdleCallback(idle, { timeout: 2000 })
            : idle(),
        4000,
      );
      return () => clearTimeout(timer);
    };
    let stop = () => {};
    const onLoad = () => (stop = start());
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => {
      window.removeEventListener("load", onLoad);
      stop();
      requestView = () => {};
    };
  }, []);
  return load ? <ToastView /> : null;
}
