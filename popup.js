const btn = document.getElementById('export');
const status = document.getElementById('status');
const progress = document.getElementById('progress');

btn.addEventListener('click', async () => {
  btn.disabled = true;
  status.textContent = '正在提取页面…';
  progress.textContent = '';

  let tabs;
  try {
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (e) {
    status.textContent = '无法获取当前标签页';
    btn.disabled = false;
    return;
  }
  const tab = tabs && tabs[0];
  if (!tab || tab.id == null) {
    status.textContent = '找不到当前标签页';
    btn.disabled = false;
    return;
  }
  chrome.runtime.sendMessage({ type: 'EXPORT', tabId: tab.id });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === 'PROGRESS') {
    if (msg.stage === 'extract') {
      status.textContent = '正在提取正文…';
    } else if (msg.stage === 'images') {
      status.textContent = '正在下载图片…';
      progress.textContent = msg.total
        ? (msg.done || 0) + ' / ' + msg.total
        : '';
    }
  } else if (msg.type === 'DONE') {
    let s = '已下载：' + msg.filename;
    if (msg.total > 0) s += '（图片 ' + msg.images + '/' + msg.total;
    if (msg.failed > 0) s += '，失败 ' + msg.failed;
    if (msg.total > 0) s += '）';
    status.textContent = s;
    progress.textContent = '';
    btn.disabled = false;
  } else if (msg.type === 'ERROR') {
    status.textContent = '出错：' + msg.message;
    progress.textContent = '';
    btn.disabled = false;
  }
});
