-- A customer's village comes from the build as {"code": <LGD village code>, "name": "..."} (or null), not plain text.
alter table territory.customers alter column village type jsonb using to_jsonb(village);
