import { createFileRoute } from "@tanstack/react-router";
import { WallEditorPage } from "../../features/editor/WallEditorPage";

export const Route = createFileRoute("/walls/$wallId")({
  component: WallEditorRoute,
});

function WallEditorRoute() {
  const { wallId } = Route.useParams();
  return <WallEditorPage wallId={wallId} />;
}
