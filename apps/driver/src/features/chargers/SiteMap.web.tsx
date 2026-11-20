import { Text, View } from 'react-native';
import { C } from '@/lib/theme';
import type { SiteMapProps } from './SiteMap';

/**
 * The browser build has no native map. The stations list on the same screen
 * still works, so the web preview stays usable for everything but the pins.
 */
export function SiteMap({ sites }: SiteMapProps) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.honeydew,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        gap: 6,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '700', color: C.green }}>
        The map shows on a phone
      </Text>
      <Text style={{ fontSize: 13, color: C.slate, textAlign: 'center' }}>
        {sites.length} station{sites.length === 1 ? '' : 's'} · open the list below to browse them
        here.
      </Text>
    </View>
  );
}
