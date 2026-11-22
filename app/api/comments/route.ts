import { readComments } from "@/app/lib/server/community";
import { api, conditionalJson, HttpError } from "@/app/lib/server/http";
import { id } from "@/app/lib/community-rules";

/** One project's comments (`?project=`), or one member's (`?author=`). */
export function GET(request: Request) {
  return api(async () => {
    const params = new URL(request.url).searchParams;
    const project = params.get("project");
    const author = params.get("author");
    if (!project === !author) throw new HttpError(400, "Ugyldig forespørsel.");
    const comments = await readComments(
      project ? `project:${id.parse(project)}` : `author:${id.parse(author)}`,
    );
    return conditionalJson(request, { comments });
  });
}
