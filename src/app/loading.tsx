import { PageHeader } from "@/components/layout/PageHeader";
import { Loading } from "@/components/ui/Loading";

/** Route-level fallback for the Overview, so navigating home never leaves the previous page frozen. */
export default function OverviewLoading() {
  return (
    <>
      <PageHeader title="Territory Overview" />
      <div className="mt-5">
        <Loading
          title="Fetching territory data"
          lines={[
            "Reading the workbook and the official block lists.",
            "Counting allocated, confirmed, missing and conflicting data.",
            "Almost there — assembling the overview.",
          ]}
        />
      </div>
    </>
  );
}
