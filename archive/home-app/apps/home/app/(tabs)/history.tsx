import { useMemo } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { DailyBars } from '@/components/DailyBars';
import { useSessions } from '@/features/sessions';
import type { ChargingSession } from '@/features/sessions';
import { useMyChargers } from '@/features/chargers';
import { formatDateTime, formatDuration } from '@/lib/format';
import { C, font } from '@/lib/theme';
import { Body, Card, Empty, Label, Numeral, Screen } from '@/lib/ui';

/** Every session across your chargers, newest first. */
export default function History() {
  const { data: sessions = [], isLoading, refetch, isRefetching } = useSessions(null);
  const { data: chargers = [] } = useMyChargers();
  const nameOf = (id: string) => chargers.find((c) => c.id === id)?.name ?? 'Charger';

  const month = new Date();
  month.setDate(1);
  month.setHours(0, 0, 0, 0);
  const thisMonth = sessions.filter((s) => new Date(s.started_at) >= month);
  const kwhMonth = thisMonth.reduce((a, s) => a + Number(s.kwh ?? 0), 0);

  // Last 14 days, Kuala Lumpur calendar days, oldest first.
  const bars = useMemo(() => {
    const dayKey = (d: Date) =>
      d.toLocaleDateString('en-GB', {
        timeZone: 'Asia/Kuala_Lumpur',
        day: '2-digit',
        month: '2-digit',
      });
    const out: { label: string; value: number; key: string }[] = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 86_400_000);
      const key = dayKey(d);
      out.push({ key, label: key.slice(0, 5).replace(/^0/, ''), value: 0 });
    }
    for (const s of sessions) {
      const key = dayKey(new Date(s.started_at));
      const b = out.find((x) => x.key === key);
      if (b) b.value += Number(s.kwh ?? 0);
    }
    return out;
  }, [sessions]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Card style={{ flex: 1, gap: 4, backgroundColor: C.green, borderColor: C.green }}>
            <Text style={{ fontSize: 11, ...font('bold'), color: C.honeydew, letterSpacing: 0.6 }}>
              THIS MONTH
            </Text>
            <Numeral value={kwhMonth.toFixed(1)} unit="kWh" accent />
          </Card>
          <Card style={{ flex: 1, gap: 4 }}>
            <Label>Sessions</Label>
            <Numeral value={String(thisMonth.length)} />
          </Card>
        </View>

        <Card style={{ gap: 10 }}>
          <Label>Energy · last 14 days</Label>
          <DailyBars bars={bars} />
        </Card>

        {isLoading && <Empty>Loading…</Empty>}
        {!isLoading && sessions.length === 0 && <Empty>No charging sessions yet.</Empty>}
        {sessions.map((s) => (
          <SessionRow key={s.id} session={s} chargerName={nameOf(s.charger_id)} />
        ))}
      </ScrollView>
    </Screen>
  );
}

function SessionRow({
  session: s,
  chargerName,
}: {
  session: ChargingSession;
  chargerName: string;
}) {
  const open = !s.ended_at;
  return (
    <Card style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Label>{chargerName}</Label>
        <Body muted style={{ fontSize: 12 }}>
          {formatDateTime(s.started_at)}
        </Body>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
        <Text style={{ fontSize: 24, ...font('extrabold'), color: C.green, letterSpacing: -0.6 }}>
          {open ? 'In progress' : `${Number(s.kwh ?? 0).toFixed(2)} kWh`}
        </Text>
        {!open && (
          <Body muted>
            {formatDuration(new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime())}
          </Body>
        )}
      </View>
      {s.max_power_kw != null && (
        <Body muted style={{ fontSize: 12 }}>
          Peak {Number(s.max_power_kw).toFixed(1)} kW
          {s.stop_reason ? ` · ${s.stop_reason}` : ''}
        </Body>
      )}
    </Card>
  );
}
