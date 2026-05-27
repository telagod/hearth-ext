# Hearth · 演示站部署指南

> 把 `site/` 目录推上 GitHub Pages，拿到公网 URL，填进 Chrome Web Store。
>
> **两条路：自动 (推荐) / 手动**

---

## 路 A · GitHub Actions 自动部署（推荐）

只要把代码 push 到 `main`，就自动构建并发布。

### 一次性配置

1. **创建 GitHub repo**（或 push 到现有 repo）
   ```bash
   gh repo create hearth --public --source=. --push
   # 或
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```

2. **打开 Pages**：repo → Settings → Pages → Source 选 **GitHub Actions**

3. **Push 触发部署**：
   ```bash
   git add site/ .github/workflows/pages.yml
   git commit -m "ship: Hearth landing site"
   git push
   ```

4. **看 Actions 跑完**：repo → Actions tab → 2-3 分钟后绿勾

5. **拿 URL**：
   - 默认：`https://<user>.github.io/<repo>/`
   - 自定义域名：在 `site/CNAME` 写 `hearth.example.com` 再 push

### Workflow 做了什么

`.github/workflows/pages.yml`：

- 触发：`push` 到 `main` 且改了 `site/**` 或 workflow 自身
- 单步注入 `REPO_URL` 到 `config.js`（用 `$GITHUB_REPOSITORY`），所以 docs 页的链接全部指向当前 repo
- `actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4` 标准 GH Pages 流程
- 并发锁，新 push 会取消还在跑的旧 deploy

---

## 路 B · 手动 push 到 gh-pages 分支

如果不想用 Actions（或先在 fork 上预览），直接跑：

```bash
bash scripts/deploy-pages.sh
```

脚本做的事：

1. 拷 `site/` → `.pages-tmp/`
2. 把 `config.js` 里的 `REPO_URL` 替换为真实地址（从 `git remote origin` 推断）
3. 在 `.pages-tmp/` 内 `git init` → 强制 push 到 `gh-pages` 分支
4. 清理临时目录

然后：repo → Settings → Pages → Source 选 **gh-pages 分支** → 等 1 分钟。

### 覆盖参数

```bash
# 显式指定 repo URL
REPO_URL=https://github.com/x/y bash scripts/deploy-pages.sh

# 文档链接指向 v0.1 而非 main
BRANCH=v0.1 bash scripts/deploy-pages.sh

# 推到自定义分支
TARGET_BRANCH=preview bash scripts/deploy-pages.sh
```

---

## 自定义域名（CNAME）

如果你有自己的域名（如 `hearth.example.com`）：

1. 创建文件 `site/CNAME`，内容只一行：
   ```
   hearth.example.com
   ```

2. DNS 设置 `CNAME` 记录指向 `<user>.github.io`

3. 重新部署（路 A 自动；路 B 跑脚本）

4. repo → Settings → Pages 等 HTTPS 证书签发（GH 自动）

---

## 验本地

跑前/跑后都能验：

```bash
cd site && python3 -m http.server 8765
# 访问 http://localhost:8765
```

预期：

- `/` → landing
- `/docs.html` → 文档索引
- `/mockup.html` → UI 设计稿
- `/404.html` → 自定义 404
- `/sitemap.xml` `/robots.txt` `/img/og.png` 都 200
- 浏览器 console 无报错；docs 页所有 GitHub 链接都已经被 `config.js` 替换

---

## 上 CWS

部署成功后：

1. 拿到公网 URL（如 `https://hearth-team.github.io/hearth/`）
2. 编辑 `docs/STORE.md` → 「详细描述」末尾的 `<repo URL>` 替换为该 URL
3. CWS Developer Dashboard → Detailed Description 粘贴
4. 同时填到「Homepage URL」字段

---

## 常见问题

| 现象 | 解 |
|---|---|
| Actions failed: `Pages is not enabled` | repo Settings → Pages → 选 GitHub Actions（一次性） |
| 部署完页面 404 | 等 1-2 分钟 CDN 同步；或检查 Pages source 配对了 |
| 文档链接还是 `hearth-team/hearth` | 走脚本重 push；或在 GH Actions 看注入步骤是否成功 |
| 自定义域名 https 红色 | 等 GH 签证，可能需要 1 小时；先用 http 测 |
| 改 SVG 不更新 | 强刷（CMD+Shift+R）；GH Pages 缓存 10 分钟 |
