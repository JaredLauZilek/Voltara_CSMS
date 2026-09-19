import { Route, Routes } from 'react-router-dom';
import { SessionsScreen } from './SessionsScreen';
import { SessionDetailScreen } from './SessionDetailScreen';

export function SessionsFeature() {
  return (
    <Routes>
      <Route index element={<SessionsScreen />} />
      <Route path=":id" element={<SessionDetailScreen />} />
    </Routes>
  );
}
