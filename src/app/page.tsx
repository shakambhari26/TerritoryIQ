import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { DatasetMissing } from "@/features/territory/components/DatasetMissing";
import { OverviewDashboard } from "@/features/territory/components/OverviewDashboard";
import { getDataset, getLayerMeta } from "@/features/territory/dataset.server";

/**
 * Overview: real figures from the workbook and the official Local Government
 * Directory lists, with the four allocation states kept apart. It does not
 * depend on boundary data, so it is complete even where no outline exists.
 */
export default function OverviewPage() {
  const dataset = getDataset();
  return (
    <>
      <PageHeader
        title="Territory Overview"
        description="Company sales territories and their block rows, set against official Local Government Directory blocks. Allocated, confirmed unallocated, missing or unverified, and conflicting data are shown separately."
        aside={
          <div className="flex items-center gap-2">
            <Badge>Local prototype</Badge>
            <Link
              href="/workspace"
              className="inline-flex items-center rounded-md bg-navy-950 px-3 py-2 text-sm font-semibold text-on-navy hover:bg-navy-800"
            >
              Open the workspace
            </Link>
          </div>
        }
      />
      {dataset ? <OverviewDashboard dataset={dataset} layerMeta={getLayerMeta()} /> : <DatasetMissing />}
    </>
  );
}
