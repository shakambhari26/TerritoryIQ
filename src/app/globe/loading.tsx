import { Loading } from "@/components/ui/Loading";

/** Route-level fallback for the Globe, so navigating here never leaves the previous page frozen. */
export default function GlobeLoading() {
  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Globe</h1>
      </div>
      <div className="mt-4">
        <Loading
          title="Fetching the globe"
          lines={[
            "Loading the Earth textures and district outlines.",
            "Placing real GPS visits onto the map.",
            "Almost there — spinning up the globe.",
          ]}
        />
      </div>
    </>
  );
}
