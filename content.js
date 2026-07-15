// content.js — 在页面隔离世界里运行：
// 用 Readability 抽正文，Turndown 转 Markdown，收集图片并改写为本地相对路径。
(function () {
  'use strict';

  // 简单哈希，用于给图片生成稳定且唯一的文件名 key（base36）
  function shortHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    }
    return h.toString(36);
  }

  // 从 URL 路径猜测图片扩展名，拿不到回退 jpg
  function extFromUrl(url) {
    try {
      const u = new URL(url, location.href);
      const seg = u.pathname.split('/').pop();
      const m = seg && seg.match(/\.([a-z0-9]+)$/i);
      if (m) return m[1].toLowerCase();
    } catch (e) { /* ignore */ }
    return 'jpg';
  }

  // 把标题清洗成安全的文件名
  function sanitizeName(s) {
    const cleaned = (s || 'page')
      .replace(/[\\/:*?"<>|\n\r\t]+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return cleaned.slice(0, 60) || 'page';
  }

  function extract() {
    // 1) Readability 抽正文
    const documentClone = document.cloneNode(true);
    const reader = new Readability(documentClone);
    const article = reader.parse();
    const title = (article && article.title) || document.title || location.hostname;
    const contentHtml = (article && article.content) || document.body.innerHTML;

    // 2) 放进离屏容器，收集并重写图片
    const container = document.createElement('div');
    container.innerHTML = contentHtml;

    const images = [];
    const seen = new Set();
    const imgEls = container.querySelectorAll('img');

    imgEls.forEach(function (img) {
      let src = img.getAttribute('src') || img.getAttribute('data-src') || img.src;
      if (!src) return;
      // data:/blob: 已内联，不下载也不改写
      if (/^(data:|blob:)/i.test(src)) return;
      // 规范化为绝对地址
      try { src = new URL(src, location.href).href; } catch (e) { /* keep as-is */ }
      if (seen.has(src)) return;
      seen.add(src);

      const key = shortHash(src);
      const ext = extFromUrl(src);
      img.setAttribute('src', './assets/' + key + '.' + ext);
      img.removeAttribute('srcset');
      img.removeAttribute('data-src');
      images.push({ url: src, key: key, extGuess: ext });
    });

    // 3) Turndown 转 Markdown（启用 GFM：表格 / 删除线 / 任务列表）
    const td = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
      fence: '```'
    });
    if (typeof turndownPluginGfm !== 'undefined') {
      td.use(turndownPluginGfm.gfm);
    }
    let markdown = td.turndown(container);

    // 4) 头部补充标题与来源
    markdown = '# ' + title + '\n\n> 来源: ' + location.href + '\n\n' + markdown;

    return {
      ok: true,
      title: sanitizeName(title),
      hostname: location.hostname,
      markdown: markdown,
      images: images
    };
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'EXTRACT') {
      try {
        const result = extract();
        sendResponse(result);
      } catch (err) {
        sendResponse({ ok: false, error: String((err && err.message) || err) });
      }
      return false; // 同步返回
    }
  });
})();
