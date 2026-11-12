import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { MY_STATES, PHASE_MODES, PHASE_MODE_LABELS, stateLabel } from '@voltara/shared';
import type { PhaseMode } from '@voltara/shared';
import { PHASE_LABEL, PHASE_PILL, useCharger as useChargerLink } from '@/ble';
import { useCharger, useChargerTarget } from '@/features/chargers';
import { useCommissionCharger } from '@/features/installer';
import { C, font } from '@/lib/theme';
import { Badge, Body, Button, Card, Empty, ErrorText, Input, KV, Label, Screen } from '@/lib/ui';

const RATINGS = [6, 10, 13, 16, 20, 25, 32, 40, 63];

/**
 * On-site commissioning: set the circuit rating and phase mode (the ceiling
 * the owner's limit can never exceed), record the site, and optionally
 * connect over BLE to read firmware and run a test.
 */
export default function Commission() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: charger } = useCharger(id ?? null);
  const target = useChargerTarget(charger);
  const conn = useChargerLink(target, { autoConnect: false });
  const commission = useCommissionCharger();

  const [rated, setRated] = useState(32);
  const [phase, setPhase] = useState<PhaseMode>('auto');
  const [siteLabel, setSiteLabel] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postcode, setPostcode] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!charger) return;
    setRated(charger.rated_current_a ?? charger.model_rated_amps ?? 32);
    setPhase((charger.phase_mode as PhaseMode) ?? 'auto');
    setSiteLabel(charger.site_label ?? '');
    setCity(charger.city ?? '');
    setState(charger.state ?? '');
    setPostcode(charger.postcode ?? '');
    setNotes(charger.notes ?? '');
  }, [charger]);

  if (!charger) {
    return (
      <Screen>
        <Empty>Loading…</Empty>
      </Screen>
    );
  }

  const ready = conn.phase === 'ready';
  const firmware: string | null = ready
    ? (conn.link?.info.firmware ?? charger.firmware_version)
    : charger.firmware_version;
  const maxRating = charger.model_rated_amps ?? 63;

  return (
    <Screen>
      <Stack.Screen options={{ title: charger.serial }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ gap: 8 }}>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Label>{charger.model_name}</Label>
            <Badge status={PHASE_PILL[conn.phase]} label={PHASE_LABEL[conn.phase]} />
          </View>
          <KV k="Lifecycle" v={charger.lifecycle} />
          <KV k="Firmware" v={firmware ?? '–'} />
          {ready && (
            <>
              <KV k="Charger state" v={stateLabel(conn.status.state)} />
              <KV k="Voltage L1" v={`${conn.status.voltageV[0].toFixed(0)} V`} />
              <KV k="Unit limit" v={`${conn.status.maxCurrentA} A`} />
            </>
          )}
          {conn.error && <ErrorText>{conn.error}</ErrorText>}
          {!ready ? (
            <Button
              title={
                conn.phase === 'idle' || conn.phase === 'error' || conn.phase === 'disconnected'
                  ? 'Connect to unit'
                  : PHASE_LABEL[conn.phase]
              }
              variant="secondary"
              onPress={conn.connect}
              disabled={!['idle', 'error', 'disconnected'].includes(conn.phase)}
            />
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                title="Test start"
                onPress={() => void conn.start().catch(() => {})}
                disabled={!conn.status.plugged}
                loading={conn.busy === 'start'}
                style={{ flex: 1 }}
              />
              <Button
                title="Stop"
                variant="danger"
                onPress={() => void conn.stop().catch(() => {})}
                loading={conn.busy === 'stop'}
                style={{ flex: 1 }}
              />
            </View>
          )}
          {!target?.pin && charger.protocol !== 'mock' && (
            <Body muted style={{ fontSize: 12 }}>
              No PIN on this phone for {charger.serial}. The driver will try without one; enter the
              claim code under Profile → dev if the unit refuses.
            </Body>
          )}
        </Card>

        <Card style={{ gap: 10 }}>
          <Label>Circuit rating · max the owner can select</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {RATINGS.filter((a) => a <= maxRating).map((a) => (
              <Chip key={a} label={`${a} A`} active={a === rated} onPress={() => setRated(a)} />
            ))}
          </View>
          <Label>Phase mode</Label>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {PHASE_MODES.map((p) => (
              <Chip
                key={p}
                label={PHASE_MODE_LABELS[p]}
                active={p === phase}
                onPress={() => setPhase(p)}
              />
            ))}
          </View>
        </Card>

        <Card style={{ gap: 10 }}>
          <Label>Site</Label>
          <Input value={siteLabel} onChangeText={setSiteLabel} placeholder="Taman / building" />
          <Input value={city} onChangeText={setCity} placeholder="City" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {MY_STATES.map((s) => (
              <Chip key={s} label={s} active={s === state} onPress={() => setState(s)} small />
            ))}
          </View>
          <Input
            value={postcode}
            onChangeText={setPostcode}
            placeholder="Postcode"
            keyboardType="number-pad"
          />
          <Label>Notes</Label>
          <Input
            value={notes}
            onChangeText={setNotes}
            placeholder="DB location, cable run, RCD type…"
            multiline
            style={{ minHeight: 72 }}
          />
        </Card>

        {commission.error && <ErrorText>{commission.error.message}</ErrorText>}
        <Button
          title={
            commission.isPending
              ? 'Saving…'
              : charger.lifecycle === 'registered'
                ? 'Mark commissioned'
                : 'Save commissioning'
          }
          loading={commission.isPending}
          onPress={() =>
            commission.mutate(
              {
                chargerId: charger.id,
                ratedCurrentA: rated,
                phaseMode: phase,
                firmwareVersion: firmware ?? null,
                site: {
                  site_label: siteLabel || undefined,
                  city: city || undefined,
                  state: state || undefined,
                  postcode: postcode || undefined,
                },
                notes,
              },
              { onSuccess: () => router.back() },
            )
          }
        />
      </ScrollView>
    </Screen>
  );
}

function Chip({
  label,
  active,
  onPress,
  small = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: small ? 5 : 8,
        paddingHorizontal: small ? 10 : 14,
        borderRadius: 99,
        backgroundColor: active ? C.honeydew : C.white,
        borderWidth: 1,
        borderColor: active ? C.green : C.border,
      }}
    >
      <Text style={{ ...font('bold'), fontSize: small ? 12 : 14, color: active ? C.green : C.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}
