# 网页转 Markdown 浏览器扩展（Web-to-MD）

> 一键把网页正文导出为 Markdown，并连同页面图片打包成**单个 `.zip`**（内部 `xxx.md` + `assets/`），丢进 Obsidian / Typora / Logseq 即可直接使用。形态对标飞书文档的「导出为 Markdown」。

[![Manifest V3](https://img.shields.io/badge/manifest-v3-blue)](https://developer.chrome.com/docs/extensions/mv3)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Platform: Chrome / Edge](https://img.shields.io/badge/platform-Chrome%20%7C%20Edge-orange)](https://chromewebstore.google.com/)

**[English](#english) · 中文**

---

## 📌 简介

你在看一篇写得很好的技术文档 / 博客 / Wiki，想把它存成本地 Markdown 归档，但手动复制粘贴会丢掉代码高亮、表格、图片链接，存下来的图还散落在外链图床上随时可能挂。

这个扩展做的事情很简单：

1. 打开任意网页，点一下扩展图标；
2. 自动抽取正文（去掉导航 / 广告 / 页脚），转成干净的 Markdown；
3. 把页面里用到的图片**一并抓取**，和 `.md` 一起打成一个 zip 下载。

解压后就是一个自包含的资料包：`xxx.md` 里的图片全是相对路径 `./assets/...`，离线也能看。

**设计取舍**：核心转换完全本地、免费、离线、隐私友好，**默认不调用任何大模型**。大模型只适合作为可选的"智能整理"增强通道，而非转换的必需环节——这是有意为之。

---

## ✨ 特性

- **正文清洗**：基于 Mozilla Readability，自动剔除导航栏、侧边栏、广告、页脚等噪音，只留正文。
- **高质量转换**：Turndown + GFM 插件，正确转换标题、列表、代码块（带语言标识）、**表格**、删除线、任务列表。
- **图片随包下载**：图片以相对路径 `./assets/<hash>.<ext>` 写入 md，后台跨域抓取字节后打进 zip。
- **零模型依赖**：核心流程纯本地规则映射，无 API Key、无费用、无隐私泄露、可离线。
- **容错与去重**：图片抓取失败自动回退为原始绝对地址（至少在线可看）；按 URL 去重，避免重复下载。
- **跨内核通用**：Manifest V3，Chrome / Edge 通用，无需改动。

---

## 🏗️ 架构

整体是标准的 MV3 三段式：Popup（操作面板）→ Content Script（页面内提取转换）→ Background Service Worker（抓图 + 打包 + 下载）。

```
┌─────────────┐   点击导出   ┌──────────────────┐   注入 / 通信   ┌──────────────────────────┐
│  Popup 面板  │ ──────────▶ │  Background Worker │ ─────────────▶ │   Content Script（页面内）  │
│ (popup.*)   │             │  (background.js)   │                │  Readability 抽正文         │
└─────────────┘             └────────┬─────────┘                │  Turndown 转 Markdown       │
       ▲                             │                          │  收集 <img> → ./assets/...   │
       │   进度 / 完成 / 错误         │  fetch 图片（host 权限）    └──────────────────────────┘
       └─────────────────────────────┘  JSZip 打包 → downloads
```

**各层职责**

| 模块 | 文件 | 职责 |
|---|---|---|
| 操作面板 | `popup.html` / `popup.css` / `popup.js` | 触发导出、展示进度与结果 |
| 页面提取 | `content.js` | 在隔离世界运行：Readability 抽正文 → Turndown(+GFM) 转 md → 收集并重写图片路径 |
| 后台打包 | `background.js` | 跨域 `fetch` 图片字节（按 Content-Type 校正扩展名、按 key 去重）→ JSZip 打包成单个 zip → `chrome.downloads` 下载 |
| 依赖 | `libs/` | 本地化的 turndown / turndown-plugin-gfm / readability / jszip（MV3 禁止远程代码，必须随包分发） |

**数据流转**

1. Popup 取得当前标签页 id，向 Background 发 `{type:'EXPORT', tabId}`。
2. Background 校验 URL 为 http/https，向 Content Script 发 `{type:'EXTRACT'}`（若 content script 未就绪，先用 `chrome.scripting` 主动注入再重试）。
3. Content Script 返回 `{title, markdown, images:[{url,key,extGuess}]}`。
4. Background 逐张 `fetch` 图片 → 追加进 `assets/`，图片扩展名以真实 Content-Type 校正 → 生成 `xxx.md` + `assets/` 的 zip → 触发下载。

---

## 📦 安装（开发者模式加载）

> 扩展未上架商店，需以「解压模式」加载。源码即成品，无需构建步骤。

### Chrome
1. 打开 `chrome://extensions`
2. 右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本仓库目录（`web-to-md/`）
4. 工具栏出现扩展图标，点击即弹出操作面板

### Edge
1. 打开 `edge://extensions`
2. 左侧开启「开发人员模式」
3. 点击「加载解压缩的扩展」，选择本仓库目录
4. 同样点击工具栏图标使用

> 修改代码后，回到扩展管理页点击「刷新 / 重新加载」即可生效。

---

## 🚀 使用

1. 打开任意一个文档 / 文章页面（语雀、飞书文档、Notion、Confluence、GitHub Wiki、各类官方文档站等）。
2. 点击扩展图标 →「导出为 Markdown」。
3. 等待进度（提取正文 → 下载图片），完成后在默认下载目录得到 `<标题>.zip`。
4. 解压后：`xxx.md` 通过相对路径引用 `assets/` 下的图片，可直接导入笔记软件。

---

## 🔐 权限说明

| 权限 | 用途 |
|---|---|
| `activeTab` / `tabs` | 获取当前标签页以触发提取 |
| `scripting` | 在需要时主动注入内容脚本 |
| `downloads` | 保存打包好的 zip |
| `host_permissions: <all_urls>` | **关键**：让后台能跨域读取任意图床的图片字节打进 zip。若无此权限，跨域图片无法下载进包 |

> 若你介意 `<all_urls>` 这一较宽权限，可退化为「文件夹下载」方案（用 `chrome.downloads.download` 直接落盘，无需 host 权限，但产出是一堆文件而非单个 zip）。需要的话可在选项页加开关切换。

---

## ⚙️ 工作原理（要点）

- **正文提取**：克隆 `document` 交给 Readability，得到干净的正文 HTML 与标题。
- **Markdown 转换**：把正文塞进离屏容器，用 Turndown（+`turndownPluginGfm.gfm`）转成 Markdown；顶部补一行 `# 标题` 和来源链接。
- **图片处理**：遍历容器内 `<img>`，跳过 `data:`/`blob:`（已内联），其余规范化为绝对地址，改写为 `./assets/<hash>.<ext>`，并把 `(url, key, extGuess)` 交给后台。
- **跨域抓图**：后台持 `<all_urls>` host 权限，`fetch` 不受页面 CORS 限制，可读到图片字节；按真实 `Content-Type` 校正扩展名（如服务端返回 `image/webp` 而 URL 猜的是 `jpg`），并同步改写 md 中的链接；失败则回退为原始绝对地址。
- **打包下载**：JSZip 组装 `xxx.md` + `assets/*`，以 `data:application/zip;base64,...` 交给 `chrome.downloads.download` 落地单个 zip。

---

## 📂 目录结构

```
web-to-md/
├── manifest.json                   # MV3 配置
├── content.js                      # 抽正文 + 转 Markdown + 收集图片
├── background.js                   # 跨域抓图 + JSZip 打包 + 下载
├── popup.html / popup.css / popup.js
├── README.md
├── LICENSE
└── libs/                           # 本地化依赖（避免 MV3 远程代码限制）
    ├── turndown.js
    ├── turndown-plugin-gfm.js
    ├── readability.js
    └── jszip.min.js
```

---

## 🧩 技术栈 / 依赖

- [Turndown](https://github.com/mixmark-io/turndown) — HTML → Markdown
- [turndown-plugin-gfm](https://github.com/mixmark-io/turndown-plugin-gfm) — GFM 表格 / 删除线 / 任务列表
- [@mozilla/readability](https://github.com/mozilla/readability) — 正文提取
- [JSZip](https://github.com/Stuk/jszip) — 浏览器端 zip 打包
- 平台：Chrome / Edge（Chromium）Manifest V3

---

## ⚠️ 已知限制

- `chrome://`、`edge://`、`file://` 等浏览器内部页面无法注入内容脚本，不支持。
- 登录后才能看的内容：只能在已登录、页面已渲染的前提下提取；扩展不能绕过登录墙。
- SPA / 动态渲染页面：在 `document_idle` 抓取，绝大多数情况够用；极端懒加载可加「等待渲染」逻辑。
- 目前只打包图片；文档内嵌的 PDF / Word 等附件可在后续版本加入。
- 未做「AI 增强」分支：若遇到排版极乱的页面，可后续接入可选的大模型整理通道（用户自带 API Key）。

---

## 🗺️ 路线图

- [ ] 选项页：自定义 frontmatter、文件名模板、图片质量
- [ ] 「文件夹下载」无权限模式（免 `<all_urls>`）
- [ ] 可选「AI 增强」通道（用户自带 Key 整理乱排版）
- [ ] 内嵌 PDF / Office 附件一并打包
- [ ] 等待渲染 / 懒加载的图片补全逻辑

---

## 🤝 贡献

欢迎 Issue 与 PR。本地调试：

1. 以解压模式加载本目录；
2. 修改任意源文件后，在扩展管理页点击「重新加载」；
3. 在目标页面重新点扩展图标测试。

---

## 📄 License

[MIT](./LICENSE) © 2026

---

## English

**Web-to-MD** is a Chrome / Edge (Manifest V3) extension that exports a web page's main content as Markdown, bundled together with its images into a single `.zip` (an `xxx.md` plus an `assets/` folder) — similar to Feishu/Lark's "Export as Markdown".

- **Local-first**: extraction and conversion run entirely in the browser via Readability + Turndown (with GFM tables). No LLM, no API key, no cost, works offline.
- **Images bundled**: images are rewritten to relative `./assets/<hash>.<ext>` paths and fetched cross-origin in the background service worker (using `<all_urls>` host permission), then zipped.
- **Robust**: failed image fetches fall back to the original absolute URL; URLs are de-duplicated.

Load unpacked from `chrome://extensions` (or `edge://extensions`) with Developer Mode on. Click the toolbar icon on any `http(s)` page and choose "导出为 Markdown".

Tech: Turndown, turndown-plugin-gfm, @mozilla/readability, JSZip. Licensed under MIT.
