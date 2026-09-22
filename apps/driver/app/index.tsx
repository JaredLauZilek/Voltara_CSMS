import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { C } from '@/lib/theme';

/** Entry: keychain session → tabs; none → sign in. */
export default function Index() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: C.seasalt,
        }}
      >
        <ActivityIndicator color={C.green} />
      </View>
    );
  }
  return <Redirect href={session ? '/(tabs)' : '/auth/sign-in'} />;
}
