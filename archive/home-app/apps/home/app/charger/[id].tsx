import { useMemo } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { estimateSoc, formatEta, minutesToTarget, stateLabel } from '@voltara/shared';
import { PHASE_LABEL, PHASE_PILL, useCharger as useChargerLink, useTelemetrySync } from '@/ble';
import { SocRing } from '@/components/SocRing';
import {
  useApplySettings,
  useCharger,
  useChargerTarget,
  useSettings,
  useUpdateSettings,
} from '@/features/chargers';
import { useAuth } from '@/lib/auth';
import { C, font } from '@/lib/theme';
import { useVehicleProfile } from '@/lib/vehicle';
import { Badge, Body, Button, Card, Empty, ErrorText, KV, Label, Screen } from '@/lib/ui';

const AMP_PRESETS = [6, 10, 13, 16, 20, 25, 32];
const BATTERY_PRESETS = [40, 50, 60, 75, 100];
const TARGET_PRESETS = [80, 90, 100];

const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
const thump = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

/** The live screen: one charger over BLE, with the controls a homeowner needs. */
export default function ChargerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { data: charger, isLoading } = useCharger(id ?? null);
  const target = useChargerTarget(charger);
  const conn = useChargerLink(target, { autoConnect: true });
  const { data: settings } = useSettings(charger?.id ?? null);
  const updateSettings = useUpdateSettings(charger?.id ?? '');
  const { profile, update: updateVehicle } = useVehicleProfile(charger?.id ?? null);
  useTelemetrySync(charger?.id ?? null, conn, charger?.protocol === 'mock' ? 'sim' : 'ble');
  useApplySettings(charger?.id ?? null, settings, conn);

  const s = conn.status;
  const ready = conn.phase === 'ready';
  const charging = ready && s.charging;
  const rated = charger?.rated_current_a ?? 32;
  const phases = charger?.phases === 3 ? 3 : 1;
  const limit = settings?.max_current_a ?? s.maxCurrentA ?? rated;
  const presets = useMemo(() => AMP_PRESETS.filter((a) => a <= rated), [rated]);
  const isOwner = charger?.owner_user_id === session?.user.id;

  const soc = estimateSoc(profile, ready ? s.sessionKwh : 0);
  const eta = charging ? minutesToTarget(profile, soc, s.powerKw) : null;
  const limitKw = (limit * 230 * phases) / 1000;

  if (isLoading || !charger) {
    return (
      <Screen>
        <Empty>{isLoading ? 'Loading…' : 'Charger not found.'}</Empty>
      </Screen>
    );
  }

  const canStart = ready && s.plugged && !s.charging && s.state !== 'Faulted';
  const canStop = ready && (s.state === 'Charging' || s.state === 'SuspendedEV');
  const setLimit = (a: number) => {
    void tap();
    updateSettings.mutate({ max_current_a: Math.max(6, Math.min(rated, a)) });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: charger.name }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        {/* Hero */}
        <Card
          style={{
            gap: 16,
            backgroundColor: C.green,
            borderColor: C.green,
            alignItems: 'center',
            paddingVertical: 22,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              alignSelf: 'stretch',
            }}
          >
            <Text style={{ fontSize: 11, ...font('bold'), color: C.honeydew, letterSpacing: 0.6 }}>
              {(charger.model_name ?? 'CHARGER').toUpperCase()}
            </Text>
            <Badge status={PHASE_PILL[conn.phase]} label={PHASE_LABEL[conn.phase]} />
          </View>

          <SocRing
            progress={soc / 100}
            size={210}
            stroke={16}
            color={C.yellow}
            track="rgba(255,255,255,0.16)"
            glow={charging ? C.yellow : undefined}
          >
            <Text
              style={{
                fontSize: 52,
                ...font('extrabold'),
                color: C.yellow,
                letterSpacing: -2,
                lineHeight: 56,
              }}
            >
              {Math.round(soc)}
              <Text style={{ fontSize: 24, ...font('bold'), color: C.yellow }}>%</Text>
            </Text>
            <Text style={{ fontSize: 10, ...font('bold'), color: C.honeydew, letterSpacing: 0.8 }}>
              ESTIMATED CHARGE
            </Text>
            <Text style={{ fontSize: 13, ...font('semibold'), color: C.white, marginTop: 6 }}>
              {ready
                ? stateLabel(s.state)
                : conn.phase === 'unavailable'
                  ? 'Bluetooth unavailable'
                  : 'Not connected'}
            </Text>
          </SocRing>

          <View
            style={{ flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-around' }}
          >
            <Stat label="Power" value={ready ? s.powerKw.toFixed(1) : '–'} unit="kW" />
            <Stat label="Added" value={ready ? s.sessionKwh.toFixed(1) : '–'} unit="kWh" />
            <Stat label={`To ${profile.targetSocPct}%`} value={formatEta(eta)} />
          </View>

          {s.faultCode && <Badge status="Faulted" label={`Fault ${s.faultCode}`} />}
          {conn.error && (
            <Text
              style={{ fontSize: 12, ...font('semibold'), color: C.yellow, textAlign: 'center' }}
            >
              {conn.error}
            </Text>
          )}
          {(conn.phase === 'error' || conn.phase === 'disconnected' || conn.phase === 'idle') && (
            <Button
              title="Connect"
              variant="secondary"
              onPress={conn.connect}
              style={{ alignSelf: 'stretch' }}
            />
          )}
          {conn.phase === 'unavailable' && (
            <Text
              style={{
                fontSize: 12,
                ...font('regular'),
                color: C.honeydew,
                textAlign: 'center',
                lineHeight: 18,
              }}
            >
              Bluetooth needs a development build. The simulator charger works everywhere.
            </Text>
          )}
        </Card>

        {/* Charge control */}
        <Card style={{ gap: 14 }}>
          {canStop ? (
            <Button
              title="Stop charging"
              variant="danger"
              onPress={() => {
                void thump();
                void conn.stop().catch(() => {});
              }}
              loading={conn.busy === 'stop'}
            />
          ) : (
            <Button
              title="Start charging"
              onPress={() => {
                void thump();
                void conn.start().catch(() => {});
              }}
              disabled={!canStart}
              loading={conn.busy === 'start'}
            />
          )}
          {ready && !s.plugged && (
            <Body muted style={{ textAlign: 'center' }}>
              Plug the cable into the car to start.
            </Body>
          )}
          {ready && s.state === 'SuspendedEV' && (
            <Body muted style={{ textAlign: 'center' }}>
              The car has paused charging.
            </Body>
          )}

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <Label>Charging current</Label>
            <Text style={{ fontSize: 13, ...font('semibold'), color: C.slate }}>
              {limit} A · about {limitKw.toFixed(1)} kW
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Stepper
              label="−"
              onPress={() => setLimit(limit - 1)}
              disabled={!settings || limit <= 6}
            />
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 6,
                justifyContent: 'center',
              }}
            >
              {presets.map((a) => (
                <Chip
                  key={a}
                  label={`${a}`}
                  active={a === limit}
                  onPress={() => setLimit(a)}
                  disabled={!settings}
                />
              ))}
            </View>
            <Stepper
              label="+"
              onPress={() => setLimit(limit + 1)}
              disabled={!settings || limit >= rated}
            />
          </View>
          <Body muted style={{ fontSize: 12 }}>
            Your installer rated this circuit at {rated} A.
            {settings && settings.applied_version !== settings.version
              ? ' Saved · applies when the charger next connects.'
              : ''}
          </Body>

          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Body>Lock cable to charger</Body>
            <Switch
              value={settings?.cable_locked ?? false}
              onValueChange={(v) => {
                void tap();
                updateSettings.mutate({ cable_locked: v });
              }}
              trackColor={{ true: C.green, false: C.border }}
              disabled={!settings}
            />
          </View>
          {updateSettings.error && <ErrorText>{updateSettings.error.message}</ErrorText>}
        </Card>

        {/* Vehicle */}
        <Card style={{ gap: 12 }}>
          <Label>Your car</Label>
          <Body muted style={{ fontSize: 12 }}>
            The charger cannot read the battery, so the charge level is estimated from the energy
            delivered.
          </Body>
          <Row label="Battery">
            {BATTERY_PRESETS.map((k) => (
              <Chip
                key={k}
                label={`${k} kWh`}
                active={profile.batteryKwh === k}
                onPress={() => {
                  void tap();
                  updateVehicle({ batteryKwh: k });
                }}
                small
              />
            ))}
          </Row>
          <Row label="Plugged in at">
            <Stepper
              label="−"
              small
              onPress={() => {
                void tap();
                updateVehicle({ startSocPct: Math.max(0, profile.startSocPct - 5) });
              }}
            />
            <Text
              style={{
                fontSize: 16,
                ...font('bold'),
                color: C.ink,
                minWidth: 48,
                textAlign: 'center',
              }}
            >
              {profile.startSocPct}%
            </Text>
            <Stepper
              label="+"
              small
              onPress={() => {
                void tap();
                updateVehicle({ startSocPct: Math.min(100, profile.startSocPct + 5) });
              }}
            />
          </Row>
          <Row label="Charge to">
            {TARGET_PRESETS.map((t) => (
              <Chip
                key={t}
                label={`${t}%`}
                active={profile.targetSocPct === t}
                onPress={() => {
                  void tap();
                  updateVehicle({ targetSocPct: t });
                }}
                small
              />
            ))}
          </Row>
        </Card>

        {/* Details */}
        <Card>
          <Label>Details</Label>
          {Array.from({ length: phases }, (_, i) => (
            <KV
              key={i}
              k={`Phase L${i + 1}`}
              v={ready ? `${s.currentA[i].toFixed(1)} A · ${s.voltageV[i].toFixed(0)} V` : '–'}
            />
          ))}
          <KV
            k="Temperature"
            v={ready && s.temperatureC != null ? `${s.temperatureC.toFixed(0)} °C` : '–'}
          />
          <KV k="Lifetime energy" v={ready ? `${s.energyTotalKwh.toFixed(1)} kWh` : '–'} />
          <KV k="Firmware" v={charger.firmware_version ?? '–'} />
          <KV k="Serial" v={charger.serial} />
        </Card>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            title="Settings"
            variant="secondary"
            onPress={() => router.push(`/charger/${charger.id}/settings`)}
            style={{ flex: 1 }}
          />
          {isOwner && (
            <Button
              title="Household"
              variant="secondary"
              onPress={() => router.push(`/charger/${charger.id}/household`)}
              style={{ flex: 1 }}
            />
          )}
        </View>
        {ready && <Button title="Disconnect" variant="secondary" onPress={conn.disconnect} />}
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 10, ...font('bold'), color: C.honeydew, letterSpacing: 0.8 }}>
        {label.toUpperCase()}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Text style={{ fontSize: 22, ...font('extrabold'), color: C.white, letterSpacing: -0.6 }}>
          {value}
        </Text>
        {unit && (
          <Text style={{ fontSize: 12, ...font('semibold'), color: C.honeydew }}>{unit}</Text>
        )}
      </View>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ width: 96, fontSize: 13, ...font('regular'), color: C.slate }}>{label}</Text>
      <View
        style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}
      >
        {children}
      </View>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  disabled = false,
  small = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingVertical: small ? 6 : 9,
        paddingHorizontal: small ? 10 : 13,
        borderRadius: 99,
        backgroundColor: active ? C.green : C.white,
        borderWidth: 1,
        borderColor: active ? C.green : C.border,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{ fontSize: small ? 12 : 14, ...font('bold'), color: active ? C.yellow : C.ink }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Stepper({
  label,
  onPress,
  disabled = false,
  small = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  const size = small ? 32 : 40;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        backgroundColor: C.honeydew,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text
        style={{
          fontSize: small ? 18 : 22,
          ...font('bold'),
          color: C.green,
          lineHeight: small ? 20 : 24,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
