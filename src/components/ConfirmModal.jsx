export default function ConfirmModal({ isOpen, msg, onResolve }) {
  return (
    <div className={`modal-overlay ${isOpen ? 'open' : ''}`} id="confirmModal"
         onClick={e => { if (e.target === e.currentTarget) onResolve(false); }}>
      <div className="rpgui-container framed-golden modal-box confirm-modal-box">
        <div className="confirm-msg">{msg}</div>
        <div className="btn-row" style={{ marginTop: '16px' }}>
          <button className="rpgui-button" type="button" onClick={() => onResolve(false)}>
            <p>取消</p>
          </button>
          <button className="rpgui-button" type="button" onClick={() => onResolve(true)}>
            <p style={{ color: '#ff9090' }}>确认删除</p>
          </button>
        </div>
      </div>
    </div>
  );
}
