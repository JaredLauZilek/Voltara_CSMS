import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useCoords,
  useNearbyChargers,
  useSiteContext,
  useStartSession,
} from '@/features/chargers/hooks';
import { useActiveSession } from '@/features/sessions/hooks';
import { C, STATUS, ThemeContext, mergeTheme } from '@/lib/theme';
import { Badge, Body, Button, Card, Label, Screen, Title } from '@/lib/ui';

/** One charger: its connectors, the price you would pay, and Start. Branded by the site's operator. */
export default function Charger() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const coords = useCoords();
  const { data: chargers = [] } = useNearbyChargers(coords);
  const cp = chargers.find((r) => r.charge_point_id === id);
  const { data: site } = useSiteContext(cp?.location_id ?? null);
  const { data: active } = useActiveSession();
  const start = useStartSession();
  const [connector, setConnector] = useState<number | null>(null);
  const theme = useMemo(() => mergeTheme(site?.theme), [site?.theme]);

  if (!cp)
    return (
      <Screen>
        <Body muted style={{ padding: 24 }}>
          Loading charger…
        </Body>
      </Screen>
    );
  const online = cp.connection_state === 'online';
  const chosen =
    cp.connectors.find((k) => k.ocpp_connector_id === connector) ??
    cp.connectors.find((k) => online && k.status === 'Available') ??
    null;
  const member = Boolean(site?.member_tag_id);
  const canStart =
    online && chosen != null && chosen.status === 'Available' && !active && (member || cp.is_free);

  return (
    <ThemeContext.Provider value={theme}>
      <Screen>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          <Card style={{ gap: 6 }}>
            <Label>{site?.operator_name ?? cp.operator_name}</Label>
            <Title>{cp.site_name}</Title>
            <Body muted>
              {cp.address ?? ''}
              {cp.city ? `, ${cp.city}` : ''}
            </Body>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <Badge
                status={online ? 'Available' : 'Offline'}
                label={online ? 'Online' : 'Offline'}
              />
              {member && (
                <Badge status="Charging" label={site?.groups?.length ? site.groups[0] : 'Member'} />
              )}
            </View>
          </Card>

          <Card style={{ gap: 10 }}>
            <Label>Connectors · {cp.charge_point_name}</Label>
            {cp.connectors.map((k) => {
              const status = online ? k.status : 'Offline';
              const s = STATUS[status] ?? STATUS.Unknown;
              const selected = chosen?.id === k.id;
              return (
                <View
                  key={k.id}
                  onTouchEnd={() => status === 'Available' && setConnector(k.ocpp_connector_id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: selected ? theme.green : C.border,
                    backgroundColor: selected ? C.honeydew : C.white,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 44,
                      borderRadius: 8,
                      backgroundColor: s.bg,
                      borderWidth: 1.5,
                      borderColor: s.color,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: s.color }}>⚡</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>
                      Connector {k.ocpp_connector_id} · {k.type}
                    </Text>
                    <Body muted style={{ fontSize: 12 }}>
                      {k.max_kw ? `up to ${k.max_kw} kW` : ''}
                    </Body>
                  </View>
                  <Badge status={status} />
                </View>
              );
            })}
          </Card>

          <Card style={{ gap: 6 }}>
            <Label>Price</Label>
            <Text style={{ fontSize: 20, fontWeight: '800', color: theme.green }}>
              {cp.tariff_text ?? 'Set by the operator'}
            </Text>
            <Body muted style={{ fontSize: 12 }}>
              {member
                ? 'Your member rate applies if this site gave you one.'
                : cp.is_free
                  ? 'Free to charge.'
                  : 'Join this site with its code to charge here. Card payment for visitors arrives in a later release.'}
            </Body>
          </Card>

          {start.error && <Body style={{ color: C.error }}>{(start.error as Error).message}</Body>}
          {active && <Body style={{ color: C.warning }}>You already have a session running.</Body>}

          <Button
            title={
              start.isPending
                ? 'Starting…'
                : chosen
                  ? `Start on connector ${chosen.ocpp_connector_id}`
                  : 'Choose a connector'
            }
            onPress={() =>
              chosen &&
              start.mutate(
                { chargePointId: cp.charge_point_id, connectorId: chosen.ocpp_connector_id },
                { onSuccess: () => router.replace('/(tabs)/charging') },
              )
            }
            loading={start.isPending}
            disabled={!canStart}
          />
          {!member && !cp.is_free && (
            <Button
              title="Join this site"
              variant="secondary"
              onPress={() => router.push('/join')}
            />
          )}
          <Body muted style={{ fontSize: 12, textAlign: 'center' }}>
            Plug in first, then start. The charger confirms within a few seconds.
          </Body>
        </ScrollView>
      </Screen>
    </ThemeContext.Provider>
  );
}
