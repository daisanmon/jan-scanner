# POIZON API Worker

GitHub Pages上のフロントエンドとPOIZON Open Platformの間に置くCloudflare Workerです。App Secretをブラウザへ渡さず、Turnstile検証、署名、レート制御、キャッシュをバックエンドに集約します。

## API

`POST /v1/poizon/lookups`

リクエスト:

```json
{
  "janCode": "4580563378953",
  "selectedSkuId": "600297001",
  "turnstileToken": "browser-token"
}
```

`selectedSkuId`はAPI 181が複数候補を返した後だけ指定します。処理順序は、JANの厳密検証、Turnstile検証、API 181、候補の確定、API 93です。API 93は`region=JP`、`currency=JPY`、`biddingType=25`を使い、`saleType`は送りません。

成功応答の`state`は次のいずれかです。

- `resolved`: `product`と`price`を返す
- `selection_required`: `candidates`を返し、サイズ選択を求める
- `not_found`: JANと完全一致するSKUがない
- `price_unavailable`: 商品は確定したが、必要な参考価格が揃っていない

IDは桁落ちを避けるため文字列、価格はJPYの整数です。エラーはHTTPステータスと`error.code`、`retryable`、`requestId`を返します。

## 秘密情報

本番値はWrangler secretだけに保存します。

```powershell
npx.cmd wrangler secret put POIZON_APP_KEY
npx.cmd wrangler secret put POIZON_APP_SECRET
npx.cmd wrangler secret put TURNSTILE_SECRET_KEY
```

ローカル値はGit管理対象外の`.dev.vars`に保存します。`VITE_`環境変数、`src/`、`wrangler.jsonc`、GitHub Actionsのフロント成果物には秘密値を置きません。

## 署名と外部API

POIZONの非空パラメータへ`app_key`とミリ秒`timestamp`を加え、キーをASCII順に並べ、UTF-8のform URL encoding（空白は`+`）を行います。配列はカンマ区切りです。連結した文字列の末尾へ区切りなしでApp Secretを付け、MD5の大文字16進数を`sign`として送ります。署名元文字列、署名値、secretはログへ出しません。

- API 181: `/dop/api/v1/pop/api/v1/intl-commodity/intl/sku/sku-basic-info/by-barcodes`
- API 93: `/dop/api/v1/pop/api/v1/recommend-bid/price`

各上流リクエストは5秒でタイムアウトし、ネットワークエラー、429、5xxだけをジッター付きで1回再試行します。

## キャッシュと利用上限制御

単一のSQLite-backed Durable Objectでキャッシュと利用回数を共有します。

- 商品結果: 24時間
- 該当なし: 10分
- 参考価格: 2分（古い価格へのフォールバックなし）
- 最小呼び出し間隔: 250ms
- 上限: 240回/分、8,000回/時、18,000回/日

同一キーの同時照会はまとめます。上限到達時はPOIZONへ送らず、`429 RATE_LIMITED`と`Retry-After`を返します。

## 検証とデプロイ

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run lint
npm.cmd run build:worker
npm.cmd run deploy:worker
```

本番CORSは`https://daisanmon.github.io`だけを許可し、Turnstileのhostnameとaction（`poizon_lookup`）も完全一致で確認します。デプロイ後はWorker URLを使って`GET /healthz`を確認し、フロントの`src/config/publicConfig.ts`へ公開URLと公開site keyだけを反映します。
