# POIZON API Worker

GitHub Pages上のフロントエンドとPOIZON Open Platformの間に置くCloudflare Workerです。App Secretをブラウザへ渡さず、Turnstile検証、署名、レート制御、キャッシュをバックエンドに集約します。

## API

`POST /v1/poizon/lookups`

リクエスト:

```json
{
  "janCode": "4580563378953",
  "selectedSpuId": "1045489",
  "turnstileToken": "browser-token"
}
```

Alpen QR経路では、`janCode`の代わりに`alpenProductId`（10桁）またはAlpen公式の`alpenUrl`を送ります。救済入力では`articleNumber`と任意の`brandName`を送れます。検索対象は1リクエストにつき1種類だけです。

`selectedSpuId`はAPI 181が複数の異なる商品型番を返した後だけ指定します。同一SPUの複数サイズは自動的に1商品へまとめます。旧フロントエンドとの短期的な互換性のため`selectedSkuId`も受理しますが、新規実装では使用しません。

最初のTurnstile検証に成功すると、応答ヘッダー`X-POIZON-Session`と`X-POIZON-Session-Expires`で30分有効の署名済みセッションを返します。以後は`X-POIZON-Session`リクエストヘッダーを送れば、期限内はTurnstileを再実行しません。セッションはTurnstile secretからHMAC-SHA-256で署名し、許可hostnameとactionへ結び付けます。App SecretやTurnstile secret自体をブラウザへ返すことはありません。

JAN経路の通常処理順序は、JANの厳密検証、30分セッションまたはTurnstileの検証、API 181、SPUの確定、API 169、API 141です。Alpen QR経路は、公式ドメインと商品番号を検証して商品ページからカラー込み型番を抽出し、API 226でSPU候補を得た後、同じAPI 169／141処理へ合流します。API 169で全サイズと販売統計を取得し、API 141で最大20 SKUずつ参考価格を取得します。API 169が失敗した場合のAPI 93フォールバックは、特定サイズを持つJAN経路だけで使用します。

成功応答の`state`は次のいずれかです。

- `resolved`: `product`、互換用`price`、取得できた場合は`market`を返す
- `selection_required`: SPU単位の`candidates`を返し、商品型番の選択を求める
- `not_found`: JANと完全一致するSKUがない
- `price_unavailable`: 商品は確定したが、必要な参考価格が揃っていない

`market`には全サイズ、サイズ別の`globalSoldNum30`、30日平均成約価格、参考価格、前月比と、最小・中央値・最大・合計・販売数加重平均の集計が含まれます。取得できない値は`0`へ置換せず`null`にします。IDは桁落ちを避けるため文字列、価格はJPYの整数です。エラーはHTTPステータスと`error.code`、`retryable`、`requestId`を返します。

## 秘密情報

本番値はWrangler secretだけに保存します。

```powershell
npx.cmd wrangler secret put POIZON_APP_KEY
npx.cmd wrangler secret put POIZON_APP_SECRET
npx.cmd wrangler secret put TURNSTILE_SECRET_KEY
```

ローカル値はGit管理対象外の`.dev.vars`に保存します。`VITE_`環境変数、`src/`、`wrangler.jsonc`、GitHub Actionsのフロント成果物には秘密値を置きません。

## 署名と外部API

POIZONの非空パラメータへ`app_key`とミリ秒`timestamp`を加え、キーをASCII順に並べ、UTF-8のform URL encoding（空白は`+`）を行います。配列はカンマ区切り、API 169の`statisticsDataQry`などのオブジェクトは送信時と同じJSON文字列へ直列化します。連結した文字列の末尾へ区切りなしでApp Secretを付け、MD5の大文字16進数を`sign`として送ります。署名元文字列、署名値、secretはログへ出しません。

- API 181: `/dop/api/v1/pop/api/v1/intl-commodity/intl/sku/sku-basic-info/by-barcodes`
- API 226: `/dop/api/v1/pop/api/v1/intl-commodity/intl/spu/spu-basic-info/by-article-number`
- API 169: `/dop/api/v1/pop/api/v1/intl-commodity/intl/sku/sku-basic-info/by-spu`
- API 141: `/dop/api/v1/pop/api/v1/recommend-bid/batchPrice`
- API 93: `/dop/api/v1/pop/api/v1/recommend-bid/price`

各上流リクエストは5秒でタイムアウトし、ネットワークエラー、429、5xxだけをジッター付きで1回再試行します。

## キャッシュと利用上限制御

単一のSQLite-backed Durable Objectでキャッシュと利用回数を共有します。

- 商品結果: 24時間
- 該当なし: 10分
- 全サイズ・販売統計: 15分
- バッチ参考価格: 2分（古い価格へのフォールバックなし）
- API 93フォールバック価格: 2分
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
