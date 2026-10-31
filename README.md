# 考试辅助网站

主页 + 三个子页面（历年真题 / 全部模拟题 / 每日一练）+ 题库维护与权限管理工具。无数据库，数据全部是 `data/` 下的文件。

- 总需求：[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
- 页面说明：[主页](docs/pages/home.md) · [历年真题](docs/pages/past-papers.md) · [全部模拟题](docs/pages/mock-questions.md) · [每日一练](docs/pages/daily-quiz.md) · [题库维护](docs/pages/admin-bank.md) · [权限管理](docs/pages/admin-access.md)

## 快速开始

```bash
npm install
npm start
```

- 前台：http://localhost:3000/
- 管理后台：http://localhost:3000/admin/（默认仅本机可访问）
- 首次启动会在控制台打印管理员密码，同时保存在 `data/secrets.json`。

然后：登录后台 → 题库维护上传 PDF、录入/导入简答题（模板见 `data.example/questions.example.json`）→ 权限管理生成验证码发给用户。

## 配置（环境变量，均可选）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` / `HOST` | 3000 / 0.0.0.0 | 监听端口与地址 |
| `DATA_DIR` | `./data` | 数据目录 |
| `ADMIN_PASSWORD` | 自动生成 | 管理员密码 |
| `ADMIN_ALLOW_REMOTE` | 空 | 设为 `1` 允许非本机访问 `/admin` |
| `TRUST_PROXY` | 空 | 在反向代理后设为 `1`（跳数）或代理 IP，用于获取真实客户端 IP |
| `DAILY_COUNT` | 5 | 每日试卷题数 |

## 部署提示
1. 务必用 HTTPS（Nginx/Caddy 反代），并设置 `TRUST_PROXY=1`。
2. 备份 `data/` 目录即备份全部数据（含验证码，不要提交到 Git）。
3. 用 pm2 / systemd 守护 `node server/index.js`。

## 测试
```bash
npm test
```

## 目录
```
server/   后端（auth 权限、bank 题库与每日出卷、routes 接口）
public/   前台页面
admin/    管理页面
docs/     需求与页面文档
data/     运行时数据（git 忽略）
test/     端到端冒烟测试
```

## 推送到 GitHub
仓库已在本地初始化并提交。在 GitHub 新建空仓库后：
```bash
git remote add origin <你的仓库地址>
git push -u origin main
```
