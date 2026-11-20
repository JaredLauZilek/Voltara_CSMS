import { useState } from 'react';
import { C, Pagination, usePagination } from '@voltara/ui';
import { MAX_RANGE_DAYS, defaultRange, type DateRange } from './dateRange';
import { useSessionReport } from './hooks';
import { downloadSessionsCsv } from './sessionCsv';
import { SessionRangeBar } from './SessionRangeBar';
import { SessionsReportTable } from './SessionsReportTable';

/**
 * The Sessions tab on a charger page: this charger's sessions for a chosen
 * stretch of dates (45 days at most), a page at a time, downloadable as CSV.
 */
export function ChargePointSessions({
  chargePointId,
  chargePointIdentity,
}: {
  chargePointId: string;
  chargePointIdentity?: string;
}) {
  const [range, setRange] = useState<DateRange>(defaultRange);
  const { data: sessions = [], isLoading } = useSessionReport({
    chargePointId,
    from: range.from,
    to: range.to,
  });
  const pagination = usePagination(sessions, 20);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <SessionRangeBar
          range={range}
          onChange={(next) => {
            setRange(next);
            pagination.reset();
          }}
          onDownload={() => downloadSessionsCsv(sessions, range, chargePointIdentity)}
          canDownload={sessions.length > 0}
        />
      </div>
      <div style={{ fontSize: 12, color: C.slate, marginTop: -6 }}>
        {sessions.length} session{sessions.length === 1 ? '' : 's'} in these dates · up to{' '}
        {MAX_RANGE_DAYS} days at a time
      </div>
      <div>
        <SessionsReportTable
          sessions={pagination.pageItems}
          isLoading={isLoading}
          showCharger={false}
          emptyText="No sessions on this charger in these dates."
        />
        <div
          style={{
            background: C.white,
            borderRadius: '0 0 16px 16px',
            marginTop: -16,
            paddingTop: 16,
            border: `1px solid ${C.border}`,
            borderTop: 'none',
          }}
        >
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            from={pagination.from}
            to={pagination.to}
            onPageChange={pagination.setPage}
          />
        </div>
      </div>
    </div>
  );
}
