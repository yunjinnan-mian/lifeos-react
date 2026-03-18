/* 固定在右侧的导航入口按钮，top 通过 prop 控制垂直位置 */
import './NavButton.css';
export default function NavButton({ onClick, title, top = '12px', children }) {
  return (
    <button className="nav-btn" onClick={onClick} title={title} style={{ top }}>
      {children}
    </button>
  );
}
