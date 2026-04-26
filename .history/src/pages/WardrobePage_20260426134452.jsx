import { useNavigate } from 'react-router-dom';
import Wardrobe from '../features/wardrobe/index.jsx';
import NavButton from '../components/NavButton.jsx';

export default function WardrobePage() {
  const navigate = useNavigate();

  return (
    <div className="wrd-scope">
      <Wardrobe />
      <NavButton onClick={() => navigate('/')} title="返回地图">🏝️</NavButton>
    </div>
  );
}