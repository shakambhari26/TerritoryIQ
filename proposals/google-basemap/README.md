# Google basemap: parked, not wired in

`google-maps.ts.txt` is a parked draft that loads the Google Maps JavaScript API from the
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` set in `.env.local`. It is a `.txt` so it is documentation: it is not typechecked,
linted or built, and nothing imports it. It holds an external URL, and `tests/unit/local-boundary.test.mts` allows none
under `src/`. To use it, rename it back to `google-maps.ts`, move it to `src/features/territory/`, and add the
`@types/google.maps` dev dependency it needs, only together with the decision to allow Google requests (and the
matching test and `docs/security-notes.md` updates). Still in place and tested: `src/features/geo/projection.ts`
(layer to Web Mercator maths). The module that used to sit beside it, `google-map-theme.ts` (basemap styles and
outline palettes), was removed in the Google cleanup; it would have to be written again.
Known: the key's Cloud project must have the Maps JavaScript API enabled (Google answered ApiNotActivatedMapError).
