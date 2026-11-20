import { C } from '@voltara/ui';
import { MAX_RANGE_DAYS, addDays, todayLocal, withEdit, type DateRange } from './dateRange';

const inputStyle: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  fontFamily: 'Figtree',
  fontSize: 13,
  outline: 'none',
  background: C.white,
};

/**
 * From / to dates and the CSV download for a sessions view. The two dates can
 * never be more than 45 days apart: moving one past that drags the other.
 */
export function SessionRangeBar({
  range,
  onChange,
  onDownload,
  canDownload,
}: {
  range: DateRange;
  onChange: (range: DateRange) => void;
  onDownload: () => void;
  canDownload: boolean;
}) {
  const today = todayLocal();
  return (
    <>
      <input
        type="date"
        value={range.from}
        max={today}
        onChange={(e) => onChange(withEdit(range, 'from', e.target.value))}
        style={inputStyle}
        title={`From · up to ${MAX_RANGE_DAYS} days at a time`}
        aria-label="From date"
      />
      <span style={{ color: C.slate, fontSize: 12 }}>to</span>
      <input
        type="date"
        value={range.to}
        max={addDays(today, 0)}
        onChange={(e) => onChange(withEdit(range, 'to', e.target.value))}
        style={inputStyle}
        title={`To · up to ${MAX_RANGE_DAYS} days at a time`}
        aria-label="To date"
      />
      <button
        onClick={onDownload}
        disabled={!canDownload}
        title={`Download these dates as a CSV file (up to ${MAX_RANGE_DAYS} days at a time)`}
        style={{
          marginLeft: 'auto',
          padding: '8px 16px',
          borderRadius: 10,
          border: `1px solid ${C.green}`,
          background: C.white,
          color: C.green,
          fontFamily: 'Figtree',
          fontSize: 13,
          fontWeight: 700,
          cursor: canDownload ? 'pointer' : 'not-allowed',
          opacity: canDownload ? 1 : 0.5,
          whiteSpace: 'nowrap',
        }}
      >
        ↓ Download CSV
      </button>
    </>
  );
}
