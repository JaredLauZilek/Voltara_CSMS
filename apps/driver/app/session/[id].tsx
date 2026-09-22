import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { billing, formatDateTime, formatDuration, formatKwh } from '@voltara/shared';
import { useReceipt, useSession, useSessionCdr } from '@/features/sessions/hooks';
import { C } from '@/lib/theme';
import { Body, Card, Label, Screen, Title } from '@/lib/ui';

/** A finished session: the priced record and, when issued, the receipt. */
export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: s } = useSession(id);
  const done = Boolean(s?.ended_at);
  const { data: cdr } = useSessionCdr(id, done);
  const { data: receipt } = useReceipt(cdr?.id ?? null);
  if (!s) return <Screen />;
  const lines = (cdr?.lines as unknown as billing.CostLine[] | null) ?? [];
  const dur = s.ended_at
    ? (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000
    : 0;
  const seller = (receipt?.seller as { trading_name?: string; name?: string } | null) ?? null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Card style={{ gap: 4 }}>
          <Label>{formatDateTime(s.started_at)}</Label>
          <Title>{s.charge_points?.locations?.name ?? s.charge_points?.name ?? 'Charger'}</Title>
          <Body muted>
            {s.charge_points?.name} · connector {s.ocpp_connector_id} · {formatDuration(dur)}
          </Body>
        </Card>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Card style={{ flex: 1 }}>
            <Label>Energy</Label>
            <Text style={{ fontSize: 22, fontWeight: '800', color: C.green }}>
              {formatKwh(s.energy_wh, 2)}
            </Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Label>Total</Label>
            <Text
              style={{ fontSize: 22, fontWeight: '800', color: C.green, fontFamily: 'monospace' }}
            >
              {cdr
                ? cdr.billable
                  ? billing.formatSen(Number(cdr.total_sen))
                  : 'Free'
                : done
                  ? '…'
                  : '—'}
            </Text>
          </Card>
        </View>

        {cdr && (
          <Card style={{ gap: 8 }}>
            <Label>Charges</Label>
            {lines.length === 0 && (
              <Body muted>{cdr.billable ? 'No charges.' : 'Not billed for this session.'}</Body>
            )}
            {lines.map((l, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Body>{l.label}</Body>
                <Body style={{ fontFamily: 'monospace' }}>
                  {billing.formatSen(l.amountInclSen)}
                </Body>
              </View>
            ))}
            {Number(cdr.tax_sen) > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Body muted>of which tax</Body>
                <Body muted style={{ fontFamily: 'monospace' }}>
                  {billing.formatSen(Number(cdr.tax_sen))}
                </Body>
              </View>
            )}
            <Body muted style={{ fontSize: 12 }}>
              {(cdr.tariff_snapshot as { display_text?: string } | null)?.display_text ?? ''}
            </Body>
          </Card>
        )}

        {receipt ? (
          <Card style={{ gap: 4, borderColor: C.green }}>
            <Label>Receipt</Label>
            <Text
              style={{ fontSize: 16, fontWeight: '800', color: C.ink, fontFamily: 'monospace' }}
            >
              {receipt.number}
            </Text>
            <Body muted style={{ fontSize: 12 }}>
              {seller?.trading_name ?? seller?.name ?? ''}
              {receipt.issued_at ? ` · issued ${formatDateTime(receipt.issued_at)}` : ''}
            </Body>
          </Card>
        ) : done && cdr?.billable ? (
          <Body muted style={{ fontSize: 12, textAlign: 'center' }}>
            A receipt appears here once the operator issues it.
          </Body>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
