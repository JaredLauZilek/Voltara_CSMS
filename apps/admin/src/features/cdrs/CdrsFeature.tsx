import { Route, Routes } from 'react-router-dom';
import { CdrsScreen } from './CdrsScreen';
import { CdrDetailScreen } from './CdrDetailScreen';

export function CdrsFeature() {
  return (
    <Routes>
      <Route index element={<CdrsScreen />} />
      <Route path=":id" element={<CdrDetailScreen />} />
    </Routes>
  );
}
