-- Batch 5: safe text → timestamp for Thomax JSON values (Operations views). Returns NULL instead of failing.
-- Thomax times have no zone; they are Sydney wall-clock and are kept as timestamp without time zone.
CREATE OR REPLACE FUNCTION fa_try_ts(t text) RETURNS timestamp
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE ms text;
BEGIN
  IF t IS NULL OR btrim(t) = '' THEN RETURN NULL; END IF;
  ms := substring(t from '^/Date\((-?[0-9]+)');
  IF ms IS NOT NULL THEN RETURN to_timestamp(ms::bigint / 1000.0) AT TIME ZONE 'UTC'; END IF;
  IF t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN RETURN NULL; END IF;
  RETURN left(regexp_replace(t, '(Z|[+-][0-9]{2}:?[0-9]{2})$', ''), 26)::timestamp;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;
