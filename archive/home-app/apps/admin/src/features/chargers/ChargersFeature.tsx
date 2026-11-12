import { Route, Routes } from 'react-router-dom';
import { ChargersScreen } from './ChargersScreen';
import { ChargerDetailScreen } from './ChargerDetailScreen';

/**
 * The feature owns its sub-routes: the shell registers one entry
 * (`/chargers`) and everything below it is internal (CLAUDE.md §4).
 */
export function ChargersFeature() {
  return (
    <Routes>
      <Route index element={<ChargersScreen />} />
      <Route path=":id" element={<ChargerDetailScreen />} />
    </Routes>
  );
}
