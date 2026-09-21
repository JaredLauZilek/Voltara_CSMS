import { Route, Routes } from 'react-router-dom';
import { DocumentsScreen } from './DocumentsScreen';
import { DocumentScreen } from './DocumentScreen';

export function DocumentsFeature() {
  return (
    <Routes>
      <Route index element={<DocumentsScreen />} />
      <Route path=":id" element={<DocumentScreen />} />
    </Routes>
  );
}
