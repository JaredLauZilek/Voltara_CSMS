import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { billing } from '@voltara/shared';
import { useStopSession } from '@/features/chargers/hooks';
import { useActiveSession, useSessionMinutes } from '@/features/sessions/hooks';
import { C } from '@/lib/theme';
import { Body, Button, Card, Empty, Label, Screen, Title } from '@/lib/ui';

/**
 * The live session. Running cost is computed on the phone with the same
 * engine the gateway will use at stop, from the tariff frozen into the
 * session — so the number here is the number on the receipt.
 */
export default function Charging() {
  const { data: session, isLoading } = useActiveSession();
  const { data: minutes = [] } = useSessionMinutes(session?.id ?? '', Boolean(session));
  const stop = useStopSession();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const latest = minutes[minutes.length - 1];
  const energyWh = latest ? Math.max(0, Number(latest.energy_wh ?? 0) - Number(session?.meter_start_wh ?? 0)) : 0;
  const powerW = latest ? Number(latest.avg_power_w ?? 0) : 0;
  const elapsedS = session ? Math.max(0, (now - new Date(session.started_at).getTime()) / 1000) : 0;

  const cost = useMemo(() => {
    const snapshot = session?.tariff_snapshot as unknown as billing.TariffSnapshot | null;
    if (!session || !snapshot) return null;
    try {
      const periods = billing.periodsFromSession({
        startedAt: session.started_at,
        endedAt: new Date(now).toISOString(),
        chargingEndedAt: session.charging_ended_at,
        totalEnergyWh: energyWh,
      });
      return billing.priceSession(periods, billing.tariffSnapshotSchema.parse(snapshot));
    } catch {
      return null;
    }
  }, [session, energyWh, now]);

  if (isLoading) return <Screen />;
  if (!session) {
    return (
      <Screen>
        <Empty>No session running.{'\n'}Pick a charger, plug in, and press Start.</Empty>
        <View style={{ padding: 16 }}><Button title="Find a charger" onPress={() => router.replace('/(tabs)')} /></View>
      </Screen>
    );
  }

  const mm = Math.floor(elapsedS / 60);
  const ss = Math.floor(elapsedS % 60);
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Card style={{ backgroundColor: C.green, borderColor: C.green, gap: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{session.status === 'active' ? 'Charging' : session.status === 'suspended' ? 'Paused by the car' : session.status}</Text>
          <Text style={{ fontSize: 44, fontWeight: '800', color: C.yellow, letterSpacing: -1 }}>{(energyWh / 1000).toFixed(2)} <Text style={{ fontSize: 20 }}>kWh</Text></Text>
          <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>{powerW > 0 ? `${(powerW / 1000).toFixed(1)} kW now · ` : ''}{mm}:{String(ss).padStart(2, '0')} elapsed</Text>
        </Card>

        <Card style={{ gap: 6 }}>
          <Label>Running cost</Label>
          <Text style={{ fontSize: 30, fontWeight: '800', color: C.green, fontFamily: 'monospace' }}>{cost ? billing.formatSen(cost.totalSen) : '—'}</Text>
          <Body muted style={{ fontSize: 12 }}>{(session.tariff_snapshot as { display_text?: string } | null)?.display_text ?? 'Priced by the operator when the session ends'}{cost && cost.taxSen > 0 ? ` · incl. ${billing.formatSen(cost.taxSen)} tax` : ''}</Body>
          {cost?.lines.map((l, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Body muted style={{ fontSize: 12 }}>{l.label}</Body><Body style={{ fontSize: 12, fontFamily: 'monospace' }}>{billing.formatSen(l.amountInclSen)}</Body></View>
          ))}
        </Card>

        <Card style={{ gap: 4 }}>
          <Label>Where</Label>
          <Title>{session.charge_points?.locations?.name ?? session.charge_points?.name ?? 'Charger'}</Title>
          <Body muted>{session.charge_points?.name} · connector {session.ocpp_connector_id}</Body>
        </Card>

        {stop.error && <Body style={{ color: C.error }}>{(stop.error as Error).message}</Body>}
        <Button title={stop.isPending ? 'Stopping…' : 'Stop charging'} variant="danger" onPress={() => stop.mutate(session.id, { onSuccess: () => router.replace(`/session/${session.id}`) })} loading={stop.isPending} />
        <Body muted style={{ fontSize: 12, textAlign: 'center' }}>Energy updates about once a minute. Idle time after charging ends may be charged — check the site's rate.</Body>
      </ScrollView>
    </Screen>
  );
}
