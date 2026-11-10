import { PageHeader } from "@/components/layout/PageHeader";
import { InsightsLoader } from "@/features/visit-insights/components/InsightsLoader";

/** Shown while the Visit Insights route and its data load, so navigating here never leaves a frozen page. */
export default function Loading() {
  return (
    <>
      <PageHeader
        title="Visit Insights"
        description="What your sales team heard in the market, and what to do about it."
      />
      <div className="mt-5">
        <InsightsLoader label="Fetching visit insights" />
      </div>
    </>
  );
}
