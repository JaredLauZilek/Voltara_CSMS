import { useSessions } from './hooks';
import { SessionsTable } from './SessionsTable';

/** The Sessions tab on a charger page. */
export function ChargePointSessions({ chargePointId }: { chargePointId: string }) {
  const { data: sessions = [], isLoading } = useSessions({ chargePointId, limit: 50 });
  return (
    <SessionsTable
      sessions={sessions}
      isLoading={isLoading}
      showCharger={false}
      emptyText="No sessions on this charger yet."
    />
  );
}
