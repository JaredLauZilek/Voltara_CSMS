import { Route, Routes } from 'react-router-dom';
import { ChargePointsScreen } from './ChargePointsScreen';
import { ChargePointDetailScreen } from './ChargePointDetailScreen';

/**
 * The feature owns its sub-routes: the shell registers one entry
 * (`/charge-points`) and everything below it is internal (CLAUDE.md §4).
 */
export function ChargePointsFeature() {
  return (
    <Routes>
      <Route index element={<ChargePointsScreen />} />
      <Route path=":id" element={<ChargePointDetailScreen />} />
    </Routes>
  );
}
