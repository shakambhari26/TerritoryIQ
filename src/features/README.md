# Features

Domain modules. Each feature owns its components, data access and types. Shared
primitives stay in `src/components/`; cross-feature utilities in `src/lib/`.

- `territory/`: the prototype's domain types, allocation-state rules, derived model, selection,
  and its UI (`components/`: map, details panel, forms, lists, overview). `dataset.server.ts` is
  server-only because it holds staff names, and is imported only by server pages and the boundary
  route handler. `overview-data.ts` is the Overview's data boundary: the server turns the dataset into a
  name-free `OverviewData` (people become opaque keys) and only that reaches `OverviewDashboard`.
- `geo/`: name matching and crosswalk, geometry, OpenStreetMap linking, layer encoding, viewport maths.
  Pure modules shared by the data scripts, the app and the tests (relative imports with `.ts` extensions).
- `allocation/`: the append-only local change log (pure reducer and validation) and its browser storage.
- `territory-allocation/`: allocation workflows beyond the local prototype (planned)
- `analytics/`: analytics views and Power BI embedding (planned)
