import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isExplorerPath } from "../../lib/explore-route";

// Every explorer URL is this one route, so `next dev` compiles the explorer
// once instead of once per URL shape. The shared layout renders the explorer
// and keeps filters, map position and saved collections across URLs.
type Props = { params: Promise<{ path?: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path = [] } = await params;
  return path.length === 1 && path[0] === "forslag"
    ? { title: "Forslag · Varde" }
    : {};
}

export default async function ExplorePage({ params }: Props) {
  if (!isExplorerPath((await params).path ?? [])) notFound();
  return null;
}
