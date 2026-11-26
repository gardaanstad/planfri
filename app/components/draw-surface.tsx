"use client";
import { createContext } from "react";

/**
 * Desktop: the explorer's map area, where a project is drawn instead of on
 * a small map in the sidebar (see `DrawingMap`). Null on phones, and outside
 * the explorer.
 */
export const DrawSurfaceContext = createContext<HTMLElement | null>(null);
