// ============================================================
// Finance Pro — Toast 提示组件
// ============================================================

import { memo } from 'react';

function Toast({ visible, msg, type = 'success' }) {
    if (!visible) return null;
    return (
        <div className={`finance-toast${type === 'error' ? ' error' : ''}`}>
            {msg}
        </div>
    );
}

export default memo(Toast);
