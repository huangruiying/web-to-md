// background.js — MV3 service worker
// 接收 content script 的提取结果，用 host 权限跨域抓取图片，JSZip 打包成单个 zip 下载。

// 必须在 service worker 全局作用域加载 JSZip
importScripts('libs/jszip.min.js');

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico'
};

function notify(payload) {
  chrome.runtime.sendMessage(payload).catch(function () { /* popup 可能已关闭 */ });
}

async function fetchImage(url) {
  const resp = await fetch(url, { redirect: 'follow', credentials: 'omit' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const buf = await resp.arrayBuffer();
  const ct = (resp.headers.get('content-type') || '').toLowerCase();
  const ext = EXT_BY_MIME[ct] || 'jpg';
  return { bytes: new Uint8Array(buf), ext: ext };
}

// 把 md 里 ./assets/<key>.<oldExt> 改写成 <newExt>（或失败时回退成原始绝对地址）
function rewriteAsset(markdown, img, newExt, fallbackUrl) {
  const re = new RegExp('\\./assets/' + img.key + '\\.' + img.extGuess + '(?=[)\\s])', 'g');
  const target = newExt ? './assets/' + img.key + '.' + newExt : fallbackUrl;
  return markdown.replace(re, target);
}

async function exportTab(tabId) {
  // 0) 检查页面类型
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (e) {
    notify({ type: 'ERROR', message: '无法获取标签页信息。' });
    return;
  }
  const url = tab.url || '';
  if (!/^https?:\/\//i.test(url)) {
    notify({ type: 'ERROR', message: '不支持该页面（仅支持 http / https 网页）。当前：' + url.slice(0, 60) });
    return;
  }

  notify({ type: 'PROGRESS', stage: 'extract' });

  // 1) 先尝试直接通信（manifest 已声明 content_scripts，大多数情况已注入）
  let res;
  try {
    res = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT' });
  } catch (_) {
    // sendMessage 失败 → 说明 content script 未就位，主动注入一次
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: [
          'libs/turndown.js',
          'libs/turndown-plugin-gfm.js',
          'libs/readability.js',
          'content.js'
        ]
      });
      // 注入完成后重试通信
      res = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT' });
    } catch (injectErr) {
      notify({ type: 'ERROR', message: '页面脚本注入失败（' + String((injectErr && injectErr.message) || injectErr) + '）。请确认页面不是 chrome:// 或扩展内部页。' });
      return;
    }
  }

  if (!res || !res.ok) {
    notify({ type: 'ERROR', message: (res && res.error) || '提取失败' });
    return;
  }

  let markdown = res.markdown;
  // 清洗标题中的非法文件名字符（跨平台：Windows / macOS / Linux）
  const rawTitle = (res.title || res.hostname || 'page').trim();
  let base = rawTitle.replace(/[\\/:*?"<>|]/g, '').replace(/[\x00-\x1f]/g, '') || 'page';
  if (!base || base.length > 200) {
    base = res.hostname || 'page';
  }
  const zip = new JSZip();
  const fetched = new Set();

  notify({ type: 'PROGRESS', stage: 'images', done: 0, total: res.images.length });

  for (let i = 0; i < res.images.length; i++) {
    const img = res.images[i];
    notify({ type: 'PROGRESS', stage: 'images', done: i + 1, total: res.images.length });
    if (fetched.has(img.key)) continue; // 去重
    try {
      const data = await fetchImage(img.url);
      if (data.ext !== img.extGuess) {
        markdown = rewriteAsset(markdown, img, data.ext);
      }
      zip.file('assets/' + img.key + '.' + data.ext, data.bytes);
      fetched.add(img.key);
    } catch (e) {
      // 抓取失败：回退为原始绝对地址，至少在线可看
      markdown = rewriteAsset(markdown, img, null, img.url);
    }
  }

  zip.file(base + '.md', markdown);

  const b64 = await zip.generateAsync({ type: 'base64' });
  const dataUrl = 'data:application/zip;base64,' + b64;
  const filename = base + '.zip';

  try {
    await chrome.downloads.download({ url: dataUrl, filename: filename, saveAs: false });
    notify({
      type: 'DONE',
      filename: filename,
      images: fetched.size,
      total: res.images.length,
      failed: res.images.length - fetched.size
    });
  } catch (e) {
    notify({ type: 'ERROR', message: '下载失败：' + String((e && e.message) || e) });
  }
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'EXPORT' && msg.tabId != null) {
    exportTab(msg.tabId).catch(function (err) {
      notify({ type: 'ERROR', message: String((err && err.message) || err) });
    });
  }
});
