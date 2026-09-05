# diary-v3

React／PostgreSQL／Drizzle 重構中的投資日記。完整範圍及每項驗收見 [tickets](.scratch/diary-v3-rebuild/ISSUES.md)；尚未完成整個產品，不能作正式替換版本。

## 本機開發

需要 Node.js ≥22.22、npm 及 Docker。請先確認本機 3100、3101、55433 ports 可用。

```sh
npm ci
docker compose -p diary-v3-dev up -d postgres
cp .env.example .env
```

在 `.env` 設定自行產生的 `JWT_SECRET`（至少 32 字元，勿使用範例字串），然後：

```sh
npm run db:migrate
npm run dev
```

Web 位於 http://127.0.0.1:3100。註冊後另行登入，再建立日記。本機 Compose 只啟動開發 PostgreSQL；正式 Docker／K3s 部署由 ticket 59 交付。

## 驗證

```sh
npm run contracts:check
npm run lint
npm run typecheck
npm run test:integration
npx playwright install chromium
npm run test:e2e
npm run build
```

整合與瀏覽器測試從 `DATABASE_URL` 的 PostgreSQL 建立隨機命名測試 DB，最後刪除。測試帳戶需有建立／刪除測試 DB 權限，絕不可指向正式服務。E2E 使用 3200／3201 ports，不能重用其他 app server。此處列出命令不代表所有 gates 已完成；請查看當前 ticket 的實測證據。

## 結構

- `apps/web`：React Router SSR、React UI。
- `apps/api`：Hono HTTP API 與權威業務入口。
- `packages/contracts`：runtime schemas 與 OpenAPI。
- `packages/api-client`：產生的型別與可注入 fetch 的 client。
- `packages/domain`：無 DOM／server 依賴的純規則。
- `packages/db`：Drizzle PostgreSQL schema 與 migrations。

來源快照及功能映射見 [baseline](docs/parity/README.md)。舊 bug 與技術債依使用者要求修正，原因和回歸證據另行記錄，詳見 [決策](docs/adr/0001-parity-baseline-and-contract-corrections.md)。
