import { Routes, Route } from 'react-router-dom';
import MapPage from './pages/MapPage.jsx';
import WardrobePage from './pages/WardrobePage.jsx';
import FinancePage from './pages/FinancePage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MapPage />} />
      <Route path="/wardrobe" element={<WardrobePage />} />
      <Route path="/finance" element={<FinancePage />} />
    </Routes>
  );
}