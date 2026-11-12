import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { hici } from '@voltara/shared';
import {
  BleTransport,
  bytesToAscii,
  bytesToHex,
  hexToBytes,
  type ConnectedDevice,
  type GattService,
  type ScannedDevice,
} from '@/ble';
import { C, font } from '@/lib/theme';
import { Body, Button, Card, ErrorText, Input, Label, Screen } from '@/lib/ui';

type Line = { t: number; text: string };

/**
 * Bench tool for unknown hardware: scan, connect, walk every service and
 * characteristic, read, subscribe, write hex. Use it on a HiCi unit to fill in
 * packages/shared/src/charger/hici/gatt.ts and codec.ts.
 */
export default function GattExplorer() {
  const transport = BleTransport.shared;
  const [devices, setDevices] = useState<Map<string, ScannedDevice>>(new Map());
  const [scanning, setScanning] = useState(false);
  const [device, setDevice] = useState<ConnectedDevice | null>(null);
  const [services, setServices] = useState<GattService[]>([]);
  const [log, setLog] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hex, setHex] = useState('5a a5 01 01 00');
  const [filter, setFilter] = useState('');
  const stopScan = useRef<(() => void) | null>(null);
  const subs = useRef(new Map<string, () => void>());

  const append = (text: string) => setLog((l) => [{ t: Date.now(), text }, ...l].slice(0, 200));

  // Latest device in a ref so the unmount cleanup can drop the link without
  // re-running on every connect.
  const deviceRef = useRef<ConnectedDevice | null>(null);
  deviceRef.current = device;
  useEffect(() => {
    const subsAtMount = subs.current;
    const scanAtMount = stopScan;
    return () => {
      scanAtMount.current?.();
      subsAtMount.forEach((u) => u());
      void deviceRef.current?.disconnect();
    };
  }, []);

  const scan = async () => {
    setError(null);
    try {
      await transport.ensureReady();
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setDevices(new Map());
    setScanning(true);
    stopScan.current = transport.scan(
      {},
      (d) => setDevices((m) => new Map(m).set(d.id, d)),
      (e) => {
        setError(e.message);
        setScanning(false);
      },
    );
    setTimeout(() => {
      stopScan.current?.();
      setScanning(false);
    }, 12_000);
  };

  const connect = async (d: ScannedDevice) => {
    stopScan.current?.();
    setScanning(false);
    setError(null);
    try {
      const dev = await transport.connect(d.id, { mtu: 247 });
      setDevice(dev);
      append(`connected ${d.name ?? d.id} · mtu ${dev.mtu}`);
      dev.onDisconnected((r) => {
        append(`disconnected ${r ?? ''}`);
        setDevice(null);
        setServices([]);
      });
      setServices(await dev.services());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const read = async (svc: string, chr: string) => {
    try {
      const b = await device!.read(svc, chr);
      append(`read ${short(chr)} → ${bytesToHex(b)}  "${bytesToAscii(b)}"`);
    } catch (e) {
      append(`read ${short(chr)} failed: ${(e as Error).message}`);
    }
  };

  const toggleSub = (svc: string, chr: string) => {
    const k = `${svc}/${chr}`;
    const existing = subs.current.get(k);
    if (existing) {
      existing();
      subs.current.delete(k);
      append(`unsubscribed ${short(chr)}`);
      return;
    }
    const parser = new hici.FrameParser();
    const stop = device!.monitor(
      svc,
      chr,
      (b) => {
        append(`notify ${short(chr)} ← ${bytesToHex(b)}`);
        for (const f of parser.push(b))
          append(`  hici frame cmd=0x${f.cmd.toString(16)} payload=${bytesToHex(f.payload)}`);
      },
      (e) => append(`notify ${short(chr)} error: ${e.message}`),
    );
    subs.current.set(k, stop);
    append(`subscribed ${short(chr)}`);
  };

  const write = async (svc: string, chr: string, withResponse: boolean) => {
    try {
      const b = hexToBytes(hex);
      await device!.write(svc, chr, b, withResponse);
      append(`write ${short(chr)} → ${bytesToHex(b)} (${withResponse ? 'with' : 'no'} response)`);
    } catch (e) {
      append(`write ${short(chr)} failed: ${(e as Error).message}`);
    }
  };

  const list = [...devices.values()]
    .filter((d) => !filter || (d.name ?? '').toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        {!transport.available && (
          <Card>
            <Body>
              No Bluetooth module in this build. Build a dev client: eas build --profile
              development.
            </Body>
          </Card>
        )}
        {error && <ErrorText>{error}</ErrorText>}

        {!device ? (
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Button
                title={scanning ? 'Scanning…' : 'Scan 12 s'}
                onPress={scan}
                loading={scanning}
                style={{ flex: 1 }}
              />
              <Input
                value={filter}
                onChangeText={setFilter}
                placeholder="name filter"
                style={{ flex: 1 }}
              />
            </View>
            {list.map((d) => (
              <Pressable
                key={d.id}
                onPress={() => connect(d)}
                style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.divider }}
              >
                <Text style={{ ...font('bold'), color: C.ink }}>{d.name ?? '(no name)'}</Text>
                <Body muted style={{ fontSize: 12 }}>
                  {d.id} · {d.rssi ?? '?'} dBm
                  {d.serviceUUIDs?.length ? ` · ${d.serviceUUIDs.map(short).join(', ')}` : ''}
                </Body>
              </Pressable>
            ))}
            {list.length === 0 && (
              <Body muted>
                Nothing yet. Make sure the charger is powered; some units only advertise after a
                touch on the panel.
              </Body>
            )}
          </Card>
        ) : (
          <>
            <Card style={{ gap: 8 }}>
              <Label>{device.name ?? device.id}</Label>
              <Input
                value={hex}
                onChangeText={setHex}
                placeholder="bytes to write, hex"
                autoCapitalize="none"
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  title="HiCi GetStatus"
                  variant="secondary"
                  onPress={() => setHex(bytesToHex(hici.encodeSimple(hici.HiciCmd.GetStatus)))}
                  style={{ flex: 1, paddingVertical: 8 }}
                />
                <Button
                  title="HiCi GetInfo"
                  variant="secondary"
                  onPress={() => setHex(bytesToHex(hici.encodeSimple(hici.HiciCmd.GetInfo)))}
                  style={{ flex: 1, paddingVertical: 8 }}
                />
              </View>
              <Button
                title="Disconnect"
                variant="secondary"
                onPress={() => void device.disconnect()}
              />
            </Card>
            {services.map((svc) => (
              <Card key={svc.uuid} style={{ gap: 8 }}>
                <Label>Service {svc.uuid}</Label>
                {svc.characteristics.map((c) => (
                  <View
                    key={c.uuid}
                    style={{
                      gap: 6,
                      paddingVertical: 6,
                      borderTopWidth: 1,
                      borderTopColor: C.divider,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: C.ink, ...font('semibold') }}>
                      {c.uuid}
                    </Text>
                    <Body muted style={{ fontSize: 11 }}>
                      {[
                        c.readable && 'read',
                        c.writableWithResponse && 'write',
                        c.writableWithoutResponse && 'write-nr',
                        c.notifiable && 'notify',
                        c.indicatable && 'indicate',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Body>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {c.readable && <Mini label="Read" onPress={() => read(svc.uuid, c.uuid)} />}
                      {(c.notifiable || c.indicatable) && (
                        <Mini
                          label={
                            subs.current.has(`${svc.uuid}/${c.uuid}`) ? 'Unsubscribe' : 'Subscribe'
                          }
                          onPress={() => toggleSub(svc.uuid, c.uuid)}
                        />
                      )}
                      {c.writableWithResponse && (
                        <Mini label="Write" onPress={() => write(svc.uuid, c.uuid, true)} />
                      )}
                      {c.writableWithoutResponse && (
                        <Mini label="Write-NR" onPress={() => write(svc.uuid, c.uuid, false)} />
                      )}
                    </View>
                  </View>
                ))}
              </Card>
            ))}
          </>
        )}

        <Card style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Label>Log</Label>
            <Mini label="Clear" onPress={() => setLog([])} />
          </View>
          {log.map((l) => (
            <Text
              key={l.t + l.text}
              style={{ fontSize: 11, color: C.ink, fontFamily: 'monospace' }}
            >
              {new Date(l.t).toLocaleTimeString('en-GB')} {l.text}
            </Text>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Mini({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 99,
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.white,
      }}
    >
      <Text style={{ fontSize: 12, ...font('bold'), color: C.green }}>{label}</Text>
    </Pressable>
  );
}

const short = (uuid: string) =>
  /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i.test(uuid)
    ? uuid.slice(4, 8).toUpperCase()
    : uuid;
