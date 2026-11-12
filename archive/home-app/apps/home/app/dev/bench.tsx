import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import type { ChargerStatus } from '@voltara/shared';
import { stateLabel } from '@voltara/shared';
import { getSimulatedLink, getSimulator } from '@/ble';
import { useMyChargers } from '@/features/chargers';
import { Badge, Body, Button, Card, KV, Label, Screen } from '@/lib/ui';

const SERIAL = 'SIM-0001';

/** Poke the in-memory charger the way a bench technician pokes a real one. */
export default function Bench() {
  const sim = getSimulator(SERIAL);
  const [s, setS] = useState<ChargerStatus>(sim.status);
  const { data: chargers = [] } = useMyChargers();
  const simRow = chargers.find((c) => c.serial === SERIAL);

  useEffect(() => sim.subscribe(setS), [sim]);
  useEffect(() => {
    // Keep physics moving even when no screen holds a link.
    const t = setInterval(() => {
      if (!getSimulatedLink(SERIAL)) sim.tick();
    }, 1000);
    return () => clearInterval(t);
  }, [sim]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Label>{SERIAL}</Label>
            <Badge status={s.state} label={stateLabel(s.state)} />
          </View>
          <KV k="Power" v={`${s.powerKw.toFixed(2)} kW`} />
          <KV k="Current L1" v={`${s.currentA[0].toFixed(1)} A`} />
          <KV k="Session" v={`${s.sessionKwh.toFixed(3)} kWh`} />
          <KV k="Lifetime" v={`${s.energyTotalKwh.toFixed(2)} kWh`} />
          <KV k="Limit" v={`${s.maxCurrentA} A`} />
          <KV k="Fault" v={s.faultCode ?? 'none'} />
          <KV k="Link held by a screen" v={getSimulatedLink(SERIAL) ? 'yes' : 'no'} />
        </Card>
        <Card style={{ gap: 10 }}>
          <Label>Vehicle</Label>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title="Plug in"
              variant="secondary"
              onPress={() => sim.plugIn()}
              style={{ flex: 1 }}
            />
            <Button
              title="Unplug"
              variant="secondary"
              onPress={() => sim.unplug()}
              style={{ flex: 1 }}
            />
          </View>
          <Button
            title="Car pauses (battery full)"
            variant="secondary"
            onPress={() => sim.vehiclePause()}
          />
          <Label>Faults</Label>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title="Inject E07"
              variant="danger"
              onPress={() => sim.injectFault('E07')}
              style={{ flex: 1 }}
            />
            <Button
              title="Clear"
              variant="secondary"
              onPress={() => sim.clearFault()}
              style={{ flex: 1 }}
            />
          </View>
          <Label>Radio</Label>
          <Button
            title="Drop the BLE link"
            variant="secondary"
            onPress={() => getSimulatedLink(SERIAL)?.dropped('Simulated radio loss')}
          />
        </Card>
        {simRow ? (
          <Button
            title="Open the simulator's charger screen"
            onPress={() => router.push(`/charger/${simRow.id}`)}
          />
        ) : (
          <Body muted>
            Sign in as owner@dev.voltara.com.my to see SIM-0001 as a claimed charger.
          </Body>
        )}
      </ScrollView>
    </Screen>
  );
}
