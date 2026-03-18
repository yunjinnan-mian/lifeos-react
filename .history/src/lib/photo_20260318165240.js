/**
 * photo.js
 * 图片压缩 + AI 背景去除管道
 */
import { CONFIG } from './config.js';

const AI_CONFIG = {
    publicPath: 'https://staticimgly.com/@imgly/background-removal-data/1.5.5/dist/',
    fetchArgs: { cache: 'force-cache' },
};

let _removeBg = null;
// 'idle' | 'loading' | 'ready' | 'error'
export let bgModelStatus = 'idle';

// ── AI 状态回调（由 App.jsx 注入）────────────────────────────────
let _onAiStatus = null;
export function setAiStatusCallback(cb) { _onAiStatus = cb; }

function notifyAiStatus(status) {
    bgModelStatus = status;
    _onAiStatus?.(status);
}

// ── WebP 压缩（两级缩放，iOS OOM 防护）─────────────────────────
export function compressWebP(
    file,
    maxW = CONFIG.PHOTO_MAX_W,
    q = CONFIG.PHOTO_QUALITY
) {
    return new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                let w = img.width, h = img.height;
                // 第一级：防止 iOS drawImage 峰值内存溢出
                if (w > CONFIG.PHOTO_PRE_MAX || h > CONFIG.PHOTO_PRE_MAX) {
                    const s = Math.min(CONFIG.PHOTO_PRE_MAX / w, CONFIG.PHOTO_PRE_MAX / h);
                    w = w * s | 0; h = h * s | 0;
                }
                // 第二级：缩到目标宽度
                if (w > maxW) { h = (h * maxW / w) | 0; w = maxW; }
                const cv = document.createElement('canvas');
                cv.width = w; cv.height = h;
                cv.getContext('2d').drawImage(img, 0, 0, w, h);
                cv.toBlob(b => b ? res(b) : rej('webp fail'), 'image/webp', q);
            };
            img.onerror = rej;
            img.src = e.target.result;
        };
        reader.onerror = rej;
        reader.readAsDataURL(file);
    });
}

// ── 后台静默预热 AI 模型 ─────────────────────────────────────────
export async function warmupBgModel() {
    notifyAiStatus('loading');
    try {
        const mod = await import('https://esm.sh/@imgly/background-removal@1.5.5?bundle');
        _removeBg = mod.removeBackground;
        const dummy = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        await _removeBg(dummy, AI_CONFIG);
        notifyAiStatus('ready');
    } catch (e) {
        console.warn('[bg-removal] 模型加载失败:', e);
        _removeBg = null;
        notifyAiStatus('error');
    }
}

// ── 主管道：选图 → 压缩 → 抠图 → 返回 blob ───────────────────────
export async function processPhoto(file, onToast) {
    onToast('⚙ 预处理图片…', true);
    let source = file;
    try {
        source = await compressWebP(file);
    } catch (err) {
        console.warn('预压缩失败，使用原图', err);
    }

    // Step 1: 背景去除
    if (bgModelStatus === 'ready' && _removeBg) {
        onToast('✂ 去除背景中…', true);
        try {
            source = await _removeBg(source, {
                ...AI_CONFIG,
                progress: (key, cur, tot) => {
                    if (tot > 0) onToast(`✂ 抠图中 ${Math.round(cur / tot * 100)}%…`, true);
                },
                output: { format: 'image/png', quality: 1 },
            });
        } catch (err) {
            console.warn('[bg-removal] 处理失败，使用原图:', err);
            onToast('⚠ 去除失败，使用原图', true);
            await new Promise(r => setTimeout(r, 800));
        }
    }

    // Step 2: 最终 WebP 压缩
    onToast('⚙ 生成最终图片…', true);
    try {
        const blob = await compressWebP(source);
        return blob;
    } catch {
        return null;
    }
}
