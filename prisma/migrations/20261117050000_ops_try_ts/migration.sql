-- Batch 5: safe text → timestamp for Thomax JSON values (Operations views). Returns NULL instead of failing.
-- Same reading as the Order lookup (parseThomaxDate): zone-less values are Sydney wall-clock already; /Date(ms)/ and
-- values with a zone (Z, +11:00) are converted to Sydney wall-clock; years before 1900 (.NET's 0001-01-01) → NULL.
CREATE OR REPLACE FUNCTION fa_try_ts(t text) RETURNS timestamp
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE ms text; r timestamp;
BEGIN
  IF t IS NULL OR btrim(t) = '' THEN RETURN NULL; END IF;
  ms := substring(t from '^/Date\((-?[0-9]+)');
  IF ms IS NOT NULL THEN
    r := to_timestamp(ms::bigint / 1000.0) AT TIME ZONE 'Australia/Sydney';
  ELSIF t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
    RETURN NULL;
  ELSIF t ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' AND t ~ '[T ][0-9]{2}:' THEN
    r := (t::timestamptz) AT TIME ZONE 'Australia/Sydney';
  ELSE
    r := left(t, 26)::timestamp;
  END IF;
  IF extract(year FROM r) < 1900 THEN RETURN NULL; END IF;
  RETURN r;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;
