import { Route, Routes } from 'react-router-dom';
import { TariffsScreen } from './TariffsScreen';
import { TariffDetailScreen } from './TariffDetailScreen';

export function TariffsFeature() {
  return (
    <Routes>
      <Route index element={<TariffsScreen />} />
      <Route path=":id" element={<TariffDetailScreen />} />
    </Routes>
  );
}
