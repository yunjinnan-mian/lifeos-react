import { useNavigate } from 'react-router-dom';
import Finance from '../features/finance/index.jsx';
import NavButton from '../components/NavButton.jsx';

export default function FinancePage() {
  const navigate = useNavigate();

  return (
    <div className="fin-scope">
      <Finance />
      <NavButton onClick={() => navigate('/')} title="返回地图">🏝️</NavButton>
    </div>
  );
}