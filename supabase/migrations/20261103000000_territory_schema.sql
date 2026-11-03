-- TerritoryIQ's own data, in one Supabase project next to the Visit Intelligence tables (those live in `public` and
-- are created by that service on startup).
--
-- Everything here sits in the `territory` schema, which Supabase does not expose through its Data API, and every table
-- also has row-level security with no policies, so the anon and authenticated keys read nothing even if the schema is
-- exposed later. Only server code connecting as the database owner can read or write.
--
-- Mirrors data/generated/dataset.json and customers.json, plus the allocation change log that today lives in one
-- browser's localStorage (src/features/allocation/overlay.ts).
--
-- unit_slots holds staff names. Do not load it until decisions B-16 and B-25 (docs/data-audit/open-business-decisions.md)
-- allow staff names to leave this machine.

create schema if not exists territory;
revoke all on schema territory from public, anon, authenticated;

-- One row per run of the offline build script, so every row below can be traced to the workbook it came from.
create table territory.dataset_builds (
  id            bigint generated always as identity primary key,
  generated_at  timestamptz not null,
  workbook_file text not null,
  workbook_sha256 text not null check (workbook_sha256 ~ '^[0-9a-f]{64}$'),
  report        jsonb not null default '{}'::jsonb,   -- build-report.json
  loaded_at     timestamptz not null default now()
);

create table territory.sales_territories (
  id     text primary key,                             -- ST-01
  label  text not null
);

-- Official LGD districts and blocks with their drawn boundaries.
create table territory.geo_features (
  id            text primary key,                      -- GD-664, GB-2961
  kind          text not null check (kind in ('district', 'block')),
  lgd_code      integer not null,
  name          text not null,
  district_id   text references territory.geo_features (id),
  village_rows  integer,
  boundary      jsonb,                                 -- source, relation id, encoded geometry
  boundary_gap  jsonb,
  unique (kind, lgd_code)
);

-- One row per workbook row: a sales unit inside a territory.
create table territory.units (
  id                 text primary key,                 -- TU-001
  source_row         integer not null,
  sales_territory_id text not null references territory.sales_territories (id),
  block_label        text not null,
  flags              text[] not null default '{}'
);
create index on territory.units (sales_territory_id);

-- Staff slots as the workbook has them (ASM 1, SECONDARY 1, ...). Holds staff names: see the note at the top.
create table territory.unit_slots (
  unit_id  text not null references territory.units (id) on delete cascade,
  role     text not null,
  slot     smallint not null check (slot > 0),
  status   text not null,                              -- named | vacant | blank ...
  names    text[] not null default '{}',
  primary key (unit_id, role, slot)
);

-- How each workbook unit was matched to an official block.
create table territory.crosswalk (
  unit_id     text primary key references territory.units (id) on delete cascade,
  status      text not null,                           -- exact | provisional | ambiguous | weak | none
  feature_id  text references territory.geo_features (id),
  candidates  jsonb not null default '[]'::jsonb,
  reason      text not null default ''
);

create table territory.customers (
  id          text primary key,                        -- CU-45
  type        text not null,                           -- Dealer | Retailer | Mason | IHB
  firm        text,
  name        text,
  erp_code    text,
  block_id    text references territory.geo_features (id),  -- null while unplaced
  confidence  text check (confidence in ('good', 'medium', 'low')),
  basis       text,
  village     text,
  flags       text[] not null default '{}'
);
create index on territory.customers (block_id);

-- Append-only allocation change log: the shared replacement for the per-browser log. Rows are never edited or
-- deleted; the effective state of a unit is the workbook row with its changes applied in order.
create table territory.allocation_changes (
  id           bigint generated always as identity primary key,
  unit_id      text not null references territory.units (id),
  kind         text not null check (kind in ('set-slot', 'mark-slot-vacant', 'clear-slot', 'confirm-unallocated',
                                             'withdraw-confirmation', 'review-link')),
  payload      jsonb not null default '{}'::jsonb,     -- role/slot/names, evidence, or decision/featureId by kind
  reason       text not null check (length(trim(reason)) > 0),
  recorded_by  text not null check (length(trim(recorded_by)) > 0),
  at           timestamptz not null default now()
);
create index on territory.allocation_changes (unit_id, id);

create function territory.reject_change() returns trigger language plpgsql as $$
begin
  raise exception 'allocation_changes is append-only; record a new change instead';
end $$;
create trigger allocation_changes_append_only
  before update or delete on territory.allocation_changes
  for each row execute function territory.reject_change();

do $$
declare t text;
begin
  foreach t in array array['dataset_builds', 'sales_territories', 'geo_features', 'units', 'unit_slots', 'crosswalk',
                           'customers', 'allocation_changes'] loop
    execute format('alter table territory.%I enable row level security', t);
    execute format('revoke all on territory.%I from public, anon, authenticated', t);
  end loop;
end $$;
