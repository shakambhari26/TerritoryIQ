import { Card } from "@/components/ui/Card";

/** Shown when the local dataset has not been built. The app does not invent data. */
export function DatasetMissing() {
  return (
    <Card className="mt-6 p-6" data-testid="dataset-missing">
      <h2 className="text-base font-semibold text-ink">The local dataset has not been built</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
        This page reads <code>data/generated/dataset.json</code>, which is produced from the files in <code>data-source/</code>. Nothing is shown
        until it exists, rather than showing made-up figures.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink">
        <li>
          <code>npm run data:verify</code> checks the four source files against their recorded hashes.
        </li>
        <li>
          <code>npm run data:fetch-osm</code> downloads district and block outlines once (optional; the app works without outlines).
        </li>
        <li>
          <code>npm run data:build</code> builds the dataset, then restart the server.
        </li>
      </ol>
    </Card>
  );
}
