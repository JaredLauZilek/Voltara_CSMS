-- Demo history for the demo fleet (demo-fleet.sql): what a week of real OCPP
-- traffic leaves behind, so the charger detail tabs have something to show.
--
--   Sessions        a week of sessions per connector (workplace by day, condo
--                   overnight, DC rapid at lunch), each with its per-minute
--                   power curve; plus the live sessions behind the fleet's
--                   current statuses (Charging, SuspendedEV/EVSE, Finishing)
--   Configuration   an OCPP 1.6 GetConfiguration snapshot per charger
--   Logs            connection events, status changes, and the OCPP frames —
--                   BootNotification, GetConfiguration, Heartbeat every
--                   15 min, Authorize, Start/StopTransaction, MeterValues
--                   every 5 min, StatusNotification, ChangeAvailability,
--                   ReserveNow, TriggerMessage, and one CALLERROR
--
-- Dev-only, like demo-fleet.sql. Runs once: a fleet that already has history
-- is left alone (`pnpm db:reset` then `pnpm dev` to regenerate it fresh).
--
-- Frames exist only from each charger's last boot onward and within the
-- current month (ocpp_messages is partitioned monthly; older partitions are
-- not guaranteed). Status/connection logs and sessions are not partitioned
-- and go back the full week. Everything is staged and then inserted in time
-- order, because the log viewers order by id.

begin;

create temp table demo_boot (charge_point_id uuid primary key, at timestamptz, until timestamptz)
  on commit drop;
create temp table demo_frames (like public.ocpp_messages excluding identity) on commit drop;
create temp table demo_status (like public.charge_point_status_log excluding identity) on commit drop;
create temp table demo_conn (like public.charge_point_connection_log excluding identity) on commit drop;
alter table demo_frames drop column id;
alter table demo_status drop column id;
alter table demo_conn drop column id;
-- Chargers number their own CALLs; an incrementing counter, as most do.
create temp sequence demo_msg_id start 100000;

create function pg_temp.iso(t timestamptz) returns text language sql immutable as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
$$;

-- One OCPP exchange as the gateway logs it: the CALL, then its CALLRESULT
-- (or CALLERROR) carrying the same message id and action.
create function pg_temp.exchange(
  p_cp uuid, p_at timestamptz, p_from_charger boolean, p_action text,
  p_request jsonb, p_response jsonb,
  p_error_code text default null, p_error_desc text default null
) returns void language plpgsql as $$
declare
  b demo_boot;
  msg_id text;
begin
  select * into b from demo_boot where charge_point_id = p_cp;
  if p_at < b.at or p_at > b.until or p_at < date_trunc('month', now()) or p_at > now() then
    return;
  end if;
  msg_id := case when p_from_charger then nextval('demo_msg_id')::text
                 else gen_random_uuid()::text end;
  insert into demo_frames (tenant_id, charge_point_id, direction, message_type, action,
    ocpp_message_id, payload, error_code, error_description, recorded_at)
  values
    ('11111111-1111-4111-8111-111111111111', p_cp,
     case when p_from_charger then 'in' else 'out' end, 2, p_action, msg_id, p_request,
     null, null, p_at),
    ('11111111-1111-4111-8111-111111111111', p_cp,
     case when p_from_charger then 'out' else 'in' end,
     case when p_error_code is null then 3 else 4 end, p_action, msg_id,
     coalesce(p_response, '{}'::jsonb), p_error_code, p_error_desc,
     p_at + interval '180 milliseconds');
end $$;

create function pg_temp.status(
  p_cp uuid, p_conn int, p_status text, p_at timestamptz,
  p_error text default 'NoError', p_info text default null, p_vendor_error text default null
) returns void language plpgsql as $$
begin
  if p_at > now() then return; end if;
  insert into demo_status (tenant_id, charge_point_id, ocpp_connector_id, status, error_code,
    info, vendor_error_code, recorded_at)
  values ('11111111-1111-4111-8111-111111111111', p_cp, p_conn, p_status,
    nullif(p_error, 'NoError'), p_info, p_vendor_error, p_at);
  perform pg_temp.exchange(p_cp, p_at, true, 'StatusNotification',
    jsonb_strip_nulls(jsonb_build_object(
      'connectorId', p_conn, 'errorCode', p_error, 'status', p_status,
      'timestamp', pg_temp.iso(p_at), 'info', p_info, 'vendorErrorCode', p_vendor_error)),
    '{}'::jsonb);
end $$;

-- One charging session, start to finish (or up to now), with its frames,
-- status changes and per-minute meter rollup. Returns the meter register at
-- the end, so the next session on the connector continues from it.
create function pg_temp.play_session(
  p_identity text, p_conn int, p_txid int,
  p_start timestamptz,
  p_charge_minutes int,          -- planned minutes of energy flow
  p_unplug timestamptz,          -- StopTransaction; null = still plugged in
  p_kw numeric, p_meter_start bigint, p_id_tag text, p_source text,
  p_pause_status text default 'SuspendedEV',
  p_end_status text default 'Available',
  p_soc boolean default false,
  p_stop_reason text default 'EVDisconnected'
) returns bigint language plpgsql as $$
declare
  cp uuid := md5('demo-fleet:' || p_identity)::uuid;
  sess uuid := md5('demo-session:' || p_txid)::uuid;
  charge_end timestamptz := p_start + p_charge_minutes * interval '1 minute';
  t timestamptz := p_start;
  i int := 0;
  frac numeric;
  power numeric;
  energy numeric := 0;
  meter bigint := p_meter_start;
  soc_start numeric := 18 + abs(hashtext(p_txid::text)) % 35;
  soc numeric;
  kwh numeric;
begin
  if p_unplug is not null and charge_end > p_unplug then charge_end := p_unplug; end if;

  insert into public.charging_sessions (id, tenant_id, charge_point_id, evse_id, connector_id,
    ocpp_connector_id, ocpp_transaction_id, id_tag, status, started_at, meter_start_wh,
    start_source, currency)
  values (sess, '11111111-1111-4111-8111-111111111111', cp,
    md5('demo-fleet:' || p_identity || ':evse:' || p_conn)::uuid,
    md5('demo-fleet:' || p_identity || ':connector:' || p_conn)::uuid,
    p_conn, p_txid, p_id_tag, 'active', p_start, p_meter_start, p_source, 'MYR');

  perform pg_temp.status(cp, p_conn, 'Preparing', p_start - interval '40 seconds');
  if p_source = 'rfid' then
    perform pg_temp.exchange(cp, p_start - interval '25 seconds', true, 'Authorize',
      jsonb_build_object('idTag', p_id_tag),
      '{"idTagInfo": {"status": "Accepted"}}'::jsonb);
  else
    perform pg_temp.exchange(cp, p_start - interval '25 seconds', false, 'RemoteStartTransaction',
      jsonb_build_object('connectorId', p_conn, 'idTag', p_id_tag),
      '{"status": "Accepted"}'::jsonb);
  end if;
  perform pg_temp.exchange(cp, p_start, true, 'StartTransaction',
    jsonb_build_object('connectorId', p_conn, 'idTag', p_id_tag,
      'meterStart', p_meter_start, 'timestamp', pg_temp.iso(p_start)),
    jsonb_build_object('transactionId', p_txid, 'idTagInfo', jsonb_build_object('status', 'Accepted')));
  perform pg_temp.status(cp, p_conn, 'Charging', p_start + interval '3 seconds');

  while t < least(charge_end, now()) loop
    -- Constant current, then the taper as the battery fills.
    frac := i::numeric / greatest(p_charge_minutes, 1);
    power := p_kw * 1000
      * case when frac > 0.8 then greatest(0.12, (1 - frac) * 5) else 1 end
      * (0.97 + 0.03 * sin(i / 3.0));
    energy := energy + power / 60;
    meter := p_meter_start + round(energy);
    soc := least(100, soc_start + energy / 640);   -- a 64 kWh pack
    insert into public.meter_values_agg_1m (charging_session_id, minute, tenant_id,
      charge_point_id, ocpp_connector_id, avg_power_w, max_power_w, energy_wh, soc_percent)
    values (sess, date_trunc('minute', t), '11111111-1111-4111-8111-111111111111', cp, p_conn,
      round(power), round(power * 1.02), meter, case when p_soc then round(soc, 1) end)
    on conflict do nothing;
    if i % 5 = 0 then
      perform pg_temp.exchange(cp, t + interval '1 second', true, 'MeterValues',
        jsonb_build_object('connectorId', p_conn, 'transactionId', p_txid,
          'meterValue', jsonb_build_array(jsonb_build_object(
            'timestamp', pg_temp.iso(t),
            'sampledValue',
              jsonb_build_array(
                jsonb_build_object('value', meter::text, 'context', 'Sample.Periodic',
                  'measurand', 'Energy.Active.Import.Register', 'unit', 'Wh'),
                jsonb_build_object('value', round(power)::text, 'context', 'Sample.Periodic',
                  'measurand', 'Power.Active.Import', 'unit', 'W'))
              || case when p_soc then jsonb_build_array(jsonb_build_object(
                  'value', round(soc)::text, 'context', 'Sample.Periodic',
                  'measurand', 'SoC', 'unit', 'Percent', 'location', 'EV'))
                 else '[]'::jsonb end))),
        '{}'::jsonb);
    end if;
    i := i + 1;
    t := t + interval '1 minute';
  end loop;

  if charge_end <= now() and (p_unplug is null or p_unplug > charge_end + interval '2 minutes') then
    perform pg_temp.status(cp, p_conn, p_pause_status, charge_end);
  end if;

  kwh := (meter - p_meter_start) / 1000.0;
  if p_unplug is not null and p_unplug <= now() then
    perform pg_temp.exchange(cp, p_unplug, true, 'StopTransaction',
      jsonb_build_object('transactionId', p_txid, 'idTag', p_id_tag, 'meterStop', meter,
        'timestamp', pg_temp.iso(p_unplug), 'reason', p_stop_reason),
      '{"idTagInfo": {"status": "Accepted"}}'::jsonb);
    perform pg_temp.status(cp, p_conn, 'Finishing', p_unplug + interval '1 second');
    if p_end_status = 'Available' then
      perform pg_temp.status(cp, p_conn, 'Available', p_unplug + interval '35 seconds');
    end if;
    update public.charging_sessions set
      status = 'completed', ended_at = p_unplug, charging_ended_at = charge_end,
      meter_stop_wh = meter, energy_wh = meter - p_meter_start, stop_reason = p_stop_reason,
      idle_seconds = greatest(0, extract(epoch from p_unplug - charge_end))::int,
      amount_gross = round(kwh * 1.20, 2), amount_tax = 0
    where id = sess;
  else
    update public.charging_sessions set
      status = case when charge_end <= now() then 'suspended' else 'active' end,
      energy_wh = meter - p_meter_start,
      charging_ended_at = case when charge_end <= now() then charge_end end
    where id = sess;
  end if;
  return meter;
end $$;

do $$
declare
  t_id constant uuid := '11111111-1111-4111-8111-111111111111';
  kl constant text := 'Asia/Kuala_Lumpur';
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  c record;
  cfg jsonb;
  readonly_keys text[];
  boot timestamptz;
  until_ts timestamptz;
  meter bigint;
  txid int := 900000;
  d int;
  h int;
  s_start timestamptz;
  s_minutes int;
  s_unplug timestamptz;
  s_kw numeric;
  hb timestamptz;
begin
  if exists (select 1 from public.charge_point_connection_log
             where charge_point_id = md5('demo-fleet:VLT-HQ-02')::uuid) then
    raise notice 'demo history already loaded — skipping';
    return;
  end if;

  -- ── Boots, connection events, configuration ───────────────────────────
  for c in
    select cp.id, cp.ocpp_identity, cp.connection_state, l.site_type,
           v.name as vendor, m.name as model, m.power_kw,
           (select count(*) from public.connectors k where k.charge_point_id = cp.id)::int as n
    from public.charge_points cp
    join public.locations l on l.id = cp.location_id
    join public.charge_point_models m on m.id = cp.model_id
    join public.charge_point_vendors v on v.id = m.vendor_id
    where cp.ocpp_identity like 'VLT-%'
    order by cp.ocpp_identity
  loop
    -- Firmware updates reboot overnight at workplaces (no one charging at
    -- 03:00) and mid-afternoon at condos (everyone's car is out).
    boot := ((today + case when c.site_type = 'condo' then time '14:00' else time '03:00' end)
             at time zone kl) + (abs(hashtext(c.ocpp_identity)) % 9) * interval '1 minute';
    if boot > now() - interval '3 hours' then boot := boot - interval '1 day'; end if;
    until_ts := case when c.connection_state = 'online' then now() else now() - interval '3 hours' end;
    insert into demo_boot values (c.id, boot, until_ts);

    insert into demo_conn (tenant_id, charge_point_id, event, gateway_instance, remote_address,
      close_code, close_reason, recorded_at)
    values
      (t_id, c.id, 'connected', 'codespace-dev', '10.20.' || (abs(hashtext(c.ocpp_identity)) % 200) || '.17',
       null, null, now() - interval '8 days'),
      (t_id, c.id, 'disconnected', 'codespace-dev', null, 1001, 'Going away',
       boot - interval '45 seconds'),
      (t_id, c.id, 'connected', 'codespace-dev', '10.20.' || (abs(hashtext(c.ocpp_identity)) % 200) || '.17',
       null, null, boot);
    if c.connection_state <> 'online' then
      insert into demo_conn (tenant_id, charge_point_id, event, gateway_instance, remote_address,
        close_code, close_reason, recorded_at)
      values (t_id, c.id, 'disconnected', 'codespace-dev', null, 1006,
        'No heartbeat for 2 intervals', until_ts);
    end if;

    cfg := jsonb_build_object(
      'AllowOfflineTxForUnknownId', 'false',
      'AuthorizationCacheEnabled', 'true',
      'AuthorizeRemoteTxRequests', 'false',
      'ChargeProfileMaxStackLevel', '8',
      'ChargingScheduleAllowedChargingRateUnit', 'Current,Power',
      'ChargingScheduleMaxPeriods', '24',
      'ClockAlignedDataInterval', '0',
      'ConnectionTimeOut', '60',
      'ConnectorPhaseRotation', '0.RST,1.RST',
      'GetConfigurationMaxKeys', '50',
      'HeartbeatInterval', '900',
      'LocalAuthListEnabled', 'true',
      'LocalAuthListMaxLength', '1000',
      'LocalAuthorizeOffline', 'true',
      'LocalPreAuthorize', 'false',
      'MaxChargingProfilesInstalled', '8',
      'MeterValueSampleInterval', '300',
      'MeterValuesAlignedData', 'Energy.Active.Import.Register',
      'MeterValuesSampledData', case when c.power_kw >= 50
        then 'Energy.Active.Import.Register,Power.Active.Import,SoC'
        else 'Energy.Active.Import.Register,Power.Active.Import' end,
      'NumberOfConnectors', c.n::text,
      'ReserveConnectorZeroSupported', 'false',
      'ResetRetries', '3',
      'SendLocalListMaxLength', '100',
      'StopTransactionOnEVSideDisconnect', 'true',
      'StopTransactionOnInvalidId', 'true',
      'StopTxnAlignedData', '',
      'StopTxnSampledData', 'Energy.Active.Import.Register',
      'SupportedFeatureProfiles',
        'Core,FirmwareManagement,LocalAuthListManagement,Reservation,RemoteTrigger,SmartCharging',
      'TransactionMessageAttempts', '3',
      'TransactionMessageRetryInterval', '60',
      'UnlockConnectorOnEVSideDisconnect', 'true',
      'WebSocketPingInterval', '60'
    ) || case c.vendor
      when 'Autel' then jsonb_build_object('LedBrightness', '60', 'PlugAndChargeEnabled', 'false')
      when 'Star Charge' then jsonb_build_object('MaxPowerKw', '120', 'CoolingFanMode', 'Auto')
      else '{}'::jsonb end;
    readonly_keys := array['ChargeProfileMaxStackLevel', 'ChargingScheduleAllowedChargingRateUnit',
      'ChargingScheduleMaxPeriods', 'GetConfigurationMaxKeys', 'LocalAuthListMaxLength',
      'MaxChargingProfilesInstalled', 'NumberOfConnectors', 'ReserveConnectorZeroSupported',
      'SendLocalListMaxLength', 'SupportedFeatureProfiles'];

    update public.charge_points set
      config = cfg,
      config_readonly = (select array_agg(k order by k) from unnest(readonly_keys) k),
      heartbeat_interval_s = 900,
      last_boot_at = boot,
      last_seen_at = until_ts,
      serial_number = upper(left(c.vendor, 3)) || '-' || to_char(2400000 + abs(hashtext(c.ocpp_identity)) % 99999, 'FM0000000'),
      -- Registered with the same serial it reports: no mismatch in the demo.
      registered_serial = upper(left(c.vendor, 3)) || '-' || to_char(2400000 + abs(hashtext(c.ocpp_identity)) % 99999, 'FM0000000'),
      firmware_version = case c.vendor when 'Autel' then '1.4.12' when 'Star Charge' then 'V2.3.0_b118' else '0.9.0' end
    where id = c.id;

    perform pg_temp.exchange(c.id, boot + interval '1 second', true, 'BootNotification',
      jsonb_build_object('chargePointVendor', c.vendor, 'chargePointModel', c.model,
        'chargePointSerialNumber', upper(left(c.vendor, 3)) || '-' || to_char(2400000 + abs(hashtext(c.ocpp_identity)) % 99999, 'FM0000000'),
        'firmwareVersion', case c.vendor when 'Autel' then '1.4.12' when 'Star Charge' then 'V2.3.0_b118' else '0.9.0' end),
      jsonb_build_object('status', 'Accepted', 'currentTime', pg_temp.iso(boot + interval '1 second'), 'interval', 900));
    perform pg_temp.status(c.id, 0, 'Available', boot + interval '2 seconds');
    for d in 1..c.n loop
      perform pg_temp.status(c.id, d, 'Available', boot + interval '3 seconds');
    end loop;
    -- The gateway reads the configuration right after every boot.
    perform pg_temp.exchange(c.id, boot + interval '5 seconds', false, 'GetConfiguration', '{}'::jsonb,
      jsonb_build_object('configurationKey', (
        select jsonb_agg(jsonb_build_object('key', e.key, 'readonly', e.key = any (readonly_keys),
          'value', e.value) order by e.key)
        from jsonb_each_text(cfg) e)));

    hb := boot + interval '15 minutes';
    while hb < until_ts loop
      perform pg_temp.exchange(c.id, hb, true, 'Heartbeat', '{}'::jsonb,
        jsonb_build_object('currentTime', pg_temp.iso(hb)));
      hb := hb + interval '15 minutes';
    end loop;
  end loop;

  -- ── A week of sessions per connector ──────────────────────────────────
  for c in
    select cp.id, cp.ocpp_identity, k.ocpp_connector_id as conn, k.max_kw, l.site_type,
           b.at as boot, b.until
    from public.charge_points cp
    join public.connectors k on k.charge_point_id = cp.id
    join public.locations l on l.id = cp.location_id
    join demo_boot b on b.charge_point_id = cp.id
    order by cp.ocpp_identity, k.ocpp_connector_id
  loop
    meter := 1200000 + abs(hashtext(c.ocpp_identity || c.conn)) % 800000;
    for d in reverse 7..0 loop
      for h in 0..case when c.max_kw >= 50 then 2 else 0 end loop
        txid := txid + 1;
        if abs(hashtext('skip' || c.ocpp_identity || c.conn || d || h)) % 6 = 0 then continue; end if;
        if c.max_kw >= 50 then
          -- DC rapid: short top-ups through the day.
          s_start := ((today - d) + time '11:00' + (h * 180 + abs(hashtext(c.ocpp_identity || c.conn || d || h)) % 120) * interval '1 minute') at time zone 'Asia/Kuala_Lumpur';
          s_minutes := 18 + abs(hashtext('m' || c.ocpp_identity || c.conn || d || h)) % 28;
          s_unplug := s_start + (s_minutes + 2 + abs(hashtext('u' || c.conn || d || h)) % 6) * interval '1 minute';
          s_kw := 60 + abs(hashtext('k' || c.ocpp_identity || c.conn || d || h)) % 40;
        elsif c.site_type = 'condo' then
          -- Condo: plug in after dinner, unplug on the way out next morning.
          s_start := ((today - d) + time '19:30' + (abs(hashtext(c.ocpp_identity || c.conn || d)) % 120) * interval '1 minute') at time zone 'Asia/Kuala_Lumpur';
          s_minutes := 150 + abs(hashtext('m' || c.ocpp_identity || c.conn || d)) % 150;
          s_unplug := ((today - d + 1) + time '07:20' + (abs(hashtext('u' || c.ocpp_identity || c.conn || d)) % 70) * interval '1 minute') at time zone 'Asia/Kuala_Lumpur';
          s_kw := 7.2;
        else
          -- Workplace: weekdays, arrive in the morning, leave in the evening.
          if extract(isodow from today - d) >= 6 then continue; end if;
          s_start := ((today - d) + time '08:30' + (abs(hashtext(c.ocpp_identity || c.conn || d)) % 90) * interval '1 minute') at time zone 'Asia/Kuala_Lumpur';
          s_minutes := 100 + abs(hashtext('m' || c.ocpp_identity || c.conn || d)) % 140;
          s_unplug := ((today - d) + time '17:10' + (abs(hashtext('u' || c.ocpp_identity || c.conn || d)) % 80) * interval '1 minute') at time zone 'Asia/Kuala_Lumpur';
          s_kw := case when c.max_kw >= 22 then 11 else 7.2 end;
        end if;
        -- Keep clear of the live sessions below, the reboot, and the outage.
        if s_unplug > now() - interval '2 hours' or s_unplug > c.until
           or (s_start - interval '1 minute' <= c.boot and c.boot <= s_unplug + interval '1 minute') then
          continue;
        end if;
        meter := pg_temp.play_session(c.ocpp_identity, c.conn, txid, s_start, s_minutes, s_unplug,
          s_kw, meter,
          case when abs(hashtext('t' || txid)) % 3 = 0 then 'APP-7F3K2Q' else 'VLT-TAG-0001' end,
          case when abs(hashtext('t' || txid)) % 3 = 0 then 'app' else 'rfid' end,
          p_soc => c.max_kw >= 50);
      end loop;
    end loop;

    -- ── What each connector is doing right now (matches demo-fleet.sql) ──
    txid := txid + 1;
    case c.ocpp_identity || '/' || c.conn
      when 'VLT-HQ-02/2' then
        perform pg_temp.play_session(c.ocpp_identity, c.conn, txid, now() - interval '48 minutes',
          150, null, 11, meter, 'VLT-TAG-0001', 'rfid');
      when 'VLT-HQ-03/1' then
        perform pg_temp.status(c.id, 1, 'Preparing', now() - interval '2 minutes');
      when 'VLT-HQ-DC1/1' then
        perform pg_temp.play_session(c.ocpp_identity, c.conn, txid, now() - interval '38 minutes',
          30, null, 90, meter, 'APP-7F3K2Q', 'app', p_soc => true);
      when 'VLT-HQ-DC1/2' then
        perform pg_temp.play_session(c.ocpp_identity, c.conn, txid, now() - interval '52 minutes',
          35, now() - interval '6 minutes', 80, meter, 'VLT-TAG-0001', 'rfid',
          p_end_status => 'Finishing', p_soc => true, p_stop_reason => 'Local');
      when 'VLT-HQ-05/1' then
        perform pg_temp.exchange(c.id, now() - interval '12 minutes', false, 'ReserveNow',
          jsonb_build_object('connectorId', 1, 'expiryDate', pg_temp.iso(now() + interval '18 minutes'),
            'idTag', 'VLT-TAG-0001', 'reservationId', 4021),
          '{"status": "Accepted"}'::jsonb);
        perform pg_temp.status(c.id, 1, 'Reserved', now() - interval '12 minutes' + interval '1 second');
      when 'VLT-VR-02/1' then
        perform pg_temp.play_session(c.ocpp_identity, c.conn, txid, now() - interval '65 minutes',
          240, null, 7.2, meter, 'VLT-TAG-0001', 'rfid');
      when 'VLT-VR-03/1' then
        perform pg_temp.play_session(c.ocpp_identity, c.conn, txid, now() - interval '95 minutes',
          70, null, 7.2, meter, 'APP-7F3K2Q', 'app', p_pause_status => 'SuspendedEVSE');
      when 'VLT-VR-04/1' then
        perform pg_temp.exchange(c.id, now() - interval '2 hours', false, 'ChangeAvailability',
          '{"connectorId": 1, "type": "Inoperative"}'::jsonb, '{"status": "Accepted"}'::jsonb);
        perform pg_temp.status(c.id, 1, 'Unavailable', now() - interval '2 hours' + interval '1 second');
        insert into public.remote_commands (tenant_id, charge_point_id, action, payload, status,
          sent_at, responded_at, response, created_at)
        values (t_id, c.id, 'ChangeAvailability', '{"connectorId": 1, "type": "Inoperative"}',
          'accepted', now() - interval '2 hours', now() - interval '2 hours' + interval '180 milliseconds',
          '{"status": "Accepted"}', now() - interval '2 hours' - interval '1 second');
      when 'VLT-VR-05/1' then
        perform pg_temp.status(c.id, 1, 'Faulted', now() - interval '75 minutes',
          'GroundFailure', 'RCD tripped', 'E-07');
        -- The operator asked for a fresh status, then for diagnostics the
        -- firmware does not support — the CALLERROR example.
        perform pg_temp.exchange(c.id, now() - interval '70 minutes', false, 'TriggerMessage',
          '{"requestedMessage": "StatusNotification", "connectorId": 1}'::jsonb,
          '{"status": "Accepted"}'::jsonb);
        perform pg_temp.status(c.id, 1, 'Faulted', now() - interval '70 minutes' + interval '1 second',
          'GroundFailure', 'RCD tripped', 'E-07');
        perform pg_temp.exchange(c.id, now() - interval '68 minutes', false, 'GetDiagnostics',
          jsonb_build_object('location', 'ftp://diag.voltara.example/upload',
            'startTime', pg_temp.iso(now() - interval '1 day')),
          '{}'::jsonb, 'NotSupported', 'Diagnostics upload is not supported by this firmware');
        insert into public.remote_commands (tenant_id, charge_point_id, action, payload, status,
          sent_at, responded_at, response, created_at)
        values (t_id, c.id, 'TriggerMessage', '{"requestedMessage": "StatusNotification", "connectorId": 1}',
          'accepted', now() - interval '70 minutes', now() - interval '70 minutes' + interval '180 milliseconds',
          '{"status": "Accepted"}', now() - interval '70 minutes' - interval '1 second');
      else
        null;
    end case;

    update public.connectors k set status_updated_at = coalesce(
      (select max(recorded_at) from demo_status s
       where s.charge_point_id = c.id and s.ocpp_connector_id = c.conn), k.status_updated_at)
    where k.charge_point_id = c.id and k.ocpp_connector_id = c.conn;
  end loop;

  insert into public.charge_point_connection_log (tenant_id, charge_point_id, event,
    gateway_instance, remote_address, close_code, close_reason, recorded_at)
  select tenant_id, charge_point_id, event, gateway_instance, remote_address, close_code,
    close_reason, recorded_at
  from demo_conn order by recorded_at;

  insert into public.charge_point_status_log (tenant_id, charge_point_id, ocpp_connector_id,
    status, error_code, info, vendor_error_code, recorded_at)
  select tenant_id, charge_point_id, ocpp_connector_id, status, error_code, info,
    vendor_error_code, recorded_at
  from demo_status order by recorded_at;

  insert into public.ocpp_messages (tenant_id, charge_point_id, direction, message_type, action,
    ocpp_message_id, payload, error_code, error_description, recorded_at)
  select tenant_id, charge_point_id, direction, message_type, action, ocpp_message_id, payload,
    error_code, error_description, recorded_at
  from demo_frames order by recorded_at;
end $$;

commit;
