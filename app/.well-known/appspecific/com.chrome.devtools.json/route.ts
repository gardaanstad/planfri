/** Chrome DevTools asks for this whenever it's open; answer before the not-found page renders. */
export function GET() {
  return new Response(null, { status: 204 });
}
