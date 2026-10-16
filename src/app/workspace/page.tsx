import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { DatasetMissing } from "@/features/territory/components/DatasetMissing";
import { Workspace } from "@/features/territory/components/Workspace";
import { getDataset } from "@/features/territory/dataset.server";

export const metadata: Metadata = {
  title: "Territory Workspace",
};

/**
 * The working map: official districts and blocks with provisional outlines, every workbook row, the four
 * allocation states kept apart, and local allocation and review forms. It stays useful when outlines are missing.
 */
export default function WorkspacePage() {
  const dataset = getDataset();
  return (
    <>
      <PageHeader
        title="Territory Workspace"
        aside={<Badge>Local prototype</Badge>}
      />
      {dataset ? <Workspace dataset={dataset} /> : <DatasetMissing />}
    </>
  );
}
