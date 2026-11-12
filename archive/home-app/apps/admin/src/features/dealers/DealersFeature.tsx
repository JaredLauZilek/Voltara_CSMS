import { Route, Routes } from 'react-router-dom';
import { DealersScreen } from './DealersScreen';
import { DealerDetailScreen } from './DealerDetailScreen';

/** The feature owns its sub-routes; the shell mounts it at `/dealers/*`. */
export function DealersFeature() {
  return (
    <Routes>
      <Route index element={<DealersScreen />} />
      <Route path=":id" element={<DealerDetailScreen />} />
    </Routes>
  );
}
