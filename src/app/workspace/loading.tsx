import { PageHeader } from "@/components/layout/PageHeader";
import { Loading } from "@/components/ui/Loading";

/** Route-level fallback for the Territory Workspace, so navigating here never leaves a frozen page. */
export default function WorkspaceLoading() {
  return (
    <>
      <PageHeader title="Territory Workspace" compact />
      <div className="mt-5">
        <Loading
          title="Fetching the working map"
          lines={[
            "Loading districts, blocks and every workbook row.",
            "Fetching the provisional outlines.",
            "Almost there — bringing up the map.",
          ]}
        />
      </div>
    </>
  );
}
