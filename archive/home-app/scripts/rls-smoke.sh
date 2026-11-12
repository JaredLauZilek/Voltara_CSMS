#!/usr/bin/env bash
# RLS / RPC smoke test against a local Supabase Postgres container holding the
# migrations + a FRESH seed (docs/dev-setup.md → "Local alternative"). Every line should
# print the expected value; "expect error" lines should print an ERROR.
#
#   ./scripts/rls-smoke.sh            # container name voltara-home-pg
#   PG=mydb ./scripts/rls-smoke.sh
set -u
PG=${PG:-voltara-home-pg}
PSQL="docker exec -i $PG psql -v ON_ERROR_STOP=1 -U postgres -h 127.0.0.1 -d postgres"

# Runs $2 as auth user $1 inside a rolled-back transaction (read-only checks).
as_user() {
  $PSQL -tA -c "begin; set local role authenticated;
    select set_config('request.jwt.claims', json_build_object('sub','$1','role','authenticated')::text, true),
           set_config('request.jwt.claim.sub','$1',true);
    $2; rollback;" 2>&1 | grep -v '^BEGIN\|^SET\|^ROLLBACK\|^{"sub\|^$\|999999999'
}
# Same, but committed (mutations that later checks depend on).
as_user_commit() {
  $PSQL -tA -c "begin; set local role authenticated;
    select set_config('request.jwt.claims', json_build_object('sub','$1','role','authenticated')::text, true),
           set_config('request.jwt.claim.sub','$1',true);
    $2; commit;" 2>&1 | grep -v '^BEGIN\|^SET\|^COMMIT\|^{"sub\|^$\|999999999'
}

O=99999999-9999-4999-8999-999999999901  # owner
F=99999999-9999-4999-8999-999999999902  # family member
I=99999999-9999-4999-8999-999999999903  # installer (Voltara dealer)
D=99999999-9999-4999-8999-999999999904  # dealer admin (Demo Dealer)
A=99999999-9999-4999-8999-999999999905  # staff admin
HC1=33333333-3333-4333-8333-333333333301

echo "owner sees (expect HC-DEMO-0001,SIM-0001):";     as_user $O "select string_agg(serial, ',' order by serial) from public.vw_chargers"
echo "family sees (expect HC-DEMO-0001):";             as_user $F "select string_agg(serial, ',' order by serial) from public.vw_chargers"
echo "installer sees (expect HC-DEMO-0001,HC-DEMO-0003,SIM-0001):"; as_user $I "select string_agg(serial, ',' order by serial) from public.vw_chargers"
echo "dealer admin sees (expect HC-DEMO-0002):";       as_user $D "select string_agg(serial, ',' order by serial) from public.vw_chargers"
echo "staff sees (expect 4):";                         as_user $A "select count(*) from public.vw_chargers"
echo "anon sees (expect 0 or permission error):";      $PSQL -tA -c "set role anon; select count(*) from public.chargers" 2>&1 | tail -1
echo "family claims HC-DEMO-0003 with wrong code (expect error):"; as_user $F "select public.claim_charger('HC-DEMO-0003','000000')"
echo "owner changes circuit rating (expect error):";   as_user $O "update public.chargers set rated_current_a=16 where serial='HC-DEMO-0001' returning rated_current_a"
echo "owner renames (expect Porch):";                  as_user $O "update public.chargers set name='Porch' where serial='HC-DEMO-0001' returning name"
echo "dealer admin ingests on another dealer's unit (expect error):"; as_user $D "select public.ingest_readings('$HC1', '[]'::jsonb)"
echo "owner ingests 1 reading (expect 1):";            as_user $O "select public.ingest_readings('$HC1', '[{\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"state\":\"Charging\",\"power_kw\":7.1,\"i1\":31,\"i2\":0,\"i3\":0,\"v1\":230,\"v2\":0,\"v3\":0,\"energy_total_kwh\":1400.5,\"session_kwh\":1.2,\"temperature_c\":33,\"source\":\"ble\"}]'::jsonb)"
echo "owner sees fleet overview (expect null):";       as_user $O "select coalesce(public.fleet_overview()::text,'null')"
echo "staff sees fleet overview chargers_total (expect 4):"; as_user $A "select public.fleet_overview()->>'chargers_total'"
echo "owner registers a unit (expect error):";         as_user $O "select public.register_charger('HC-NEW-0002','22222222-2222-4222-8222-222222222201')"
echo "installer registers a unit (expect json without claim_code):"; as_user $I "select public.register_charger('HC-SMOKE-'||to_char(now(),'HH24MISS'),'22222222-2222-4222-8222-222222222201') - 'claim_code'"
echo "dealer admin reads readings (expect 0):";        as_user $D "select count(*) from public.charger_readings"
