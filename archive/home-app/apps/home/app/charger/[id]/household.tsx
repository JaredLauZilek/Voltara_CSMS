import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useInviteMember, useMembers, useRemoveMember } from '@/features/chargers';
import { Body, Button, Card, Empty, ErrorText, Input, KV, Label, Screen } from '@/lib/ui';

/** Owner only: who else may use this charger from their phone. */
export default function Household() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: members = [], isLoading } = useMembers(id ?? null);
  const remove = useRemoveMember(id ?? '');
  const invite = useInviteMember(id ?? '');
  const [email, setEmail] = useState('');

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ gap: 10 }}>
          <Label>Add a member</Label>
          <Body muted>
            They need to install Voltara Home and sign in once with this email first.
          </Body>
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="family@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Button
            title="Add"
            onPress={() =>
              invite.mutate(
                { email: email.trim(), role: 'member' },
                { onSuccess: () => setEmail('') },
              )
            }
            loading={invite.isPending}
            disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)}
          />
          {invite.error && <ErrorText>{invite.error.message}</ErrorText>}
        </Card>

        <Card style={{ gap: 6 }}>
          <Label>Members</Label>
          {isLoading && <Empty>Loading…</Empty>}
          {!isLoading && members.length === 0 && <Body muted>Only you so far.</Body>}
          {members.map((m) => (
            <View key={m.user_id} style={{ gap: 4 }}>
              <KV
                k={m.profile?.full_name || m.profile?.email || m.user_id.slice(0, 8)}
                v={m.role}
              />
              <Button
                title="Remove"
                variant="secondary"
                onPress={() => remove.mutate(m.user_id)}
                loading={remove.isPending}
                style={{ paddingVertical: 8 }}
              />
            </View>
          ))}
          {remove.error && <ErrorText>{remove.error.message}</ErrorText>}
        </Card>
      </ScrollView>
    </Screen>
  );
}
