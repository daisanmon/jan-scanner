# JANスキャンアプリ × POIZON Open Platform API 連携設計書

- 作成日: 2026-07-31（Asia/Tokyo）
- 最終更新: 2026-08-03（Asia/Tokyo）
- 対象: `jan-scanner`
- 状態: 設計のみ。実装、認証情報の設定、POIZON APIの呼び出しは行わない
- 連携方式: **自社アカウントだけで使うPOIZON Seller方式に決定済み**

## 0. この文書の読み方

この文書では、内容を次の3種類に分けます。

- **確認済み**: 現在のプロジェクトまたはPOIZON公式資料で確認できた事実
- **推奨**: このアプリに合うと考える設計案
- **未決定**: 契約、運用、利益条件など、実装前に決める必要があること

App Key、App Secret、アクセストークンの実値は、この文書にもソースコードにも記載しません。

### 0.1 決定済みの連携方式

このプロジェクトは、複数販売者へ提供するERP/ISVではなく、**自社のPOIZON販売者アカウントだけを連携するPOIZON Seller方式**で進めます。

- 自社用の販売者アプリとしてConsoleで管理する。
- POIZON Seller向けのApp Key / App Secretと要求署名を使う。
- ERP/ISV向けOAuthによる複数販売者の認可・トークン管理は今回の対象外とする。
- App Secretを扱う署名処理は、これまでの設計どおりバックエンドだけで行う。
- 利用できるAPIは、自社アプリに承認されたAPI Permission Packageの範囲に限定する。

## 1. 現在のjan-scanner

### 1.1 確認済みの構成

現在の `jan-scanner` は、**React 19 + TypeScript + Vite 8** で作られたブラウザアプリです。バーコード読み取りには `@ericblade/quagga2` を使っています。

`vite.config.ts` の `base` は `/jan-scanner/` です。`main` ブランチへのpushをきっかけにGitHub Actionsが `npm ci`、ビルド、`dist/` のアップロードを行い、**GitHub Pagesへ静的ファイルとして公開**します。GitHub Pagesはフロントエンドを配信する場所であり、App Secretを安全に使うバックエンドではありません。

### 1.2 確認済みのJANスキャン処理

現在の処理は次のとおりです。

1. カメラ読み取りではQuagga2の `ean_reader` と `ean_8_reader` を使う。
2. 8桁または13桁かを確認する。
3. JAN（EAN-8 / EAN-13）のチェックデジットを検証する。
4. カメラでは同一コードの短時間の重複登録を抑止する。
5. 手入力でも数字、桁数、チェックデジットを同じように検証する。
6. 読み取ったJANコード、日時、登録方法をブラウザの `localStorage` に保存する。

現在は外部APIへの通信、商品名の取得、価格取得、仕入れ可否判定を行っていません。

## 2. App Secretをブラウザ側へ保存してはいけない理由

Viteで作ったコードは、ビルド後にJavaScriptとして利用者の端末へ配信されます。そのため、次の場所にApp Secretを置くと、利用者や第三者が取得できてしまいます。

- `src` 内のコード
- `public` 内のファイル
- `localStorage`、`sessionStorage`、IndexedDB
- GitHubリポジトリ
- GitHub Pagesの配信ファイル
- `VITE_` で始まる環境変数

特にViteの `VITE_` 環境変数は、秘密を保管する仕組みではありません。ビルド時にフロントエンドのコードへ埋め込まれるため、App Secretを置いてはいけません。

App Secretが漏れると、第三者が正規アプリになりすまして署名付きリクエストを作るおそれがあります。POIZON公式の署名方式はApp Secretを使うため、**署名の作成は必ず自分たちのバックエンドで行います**。

## 3. 推奨する全体構成

```text
[利用者のスマートフォン]
  jan-scanner画面
  - カメラでJANを読む
  - 仕入価格を入力する（方式は未決定）
  - 結果を表示する
            |
            | HTTPS（自分たちのAPIだけを呼ぶ）
            v
[自分たちのバックエンド]
  - 利用者の認証・入力検証
  - キャッシュ・レート制限
  - App Secretを使った署名
  - POIZONの商品・価格情報の取得
  - 費用と利益の計算
  - 仕入れ可否の判定
            |
            | HTTPS（POIZON公式Open Platform API）
            v
[POIZON Open Platform API]
  - バーコードによる商品候補の照会
  - SKUごとの価格・出品関連情報の照会
```

GitHub Pagesの公開方法はそのまま維持できます。追加するバックエンドはGitHub Pagesとは別のHTTPS URLで公開し、jan-scannerからそのURLだけを呼びます。

ブラウザからPOIZONを直接呼ばないことで、App Secretを隠せるだけでなく、レート制限、キャッシュ、エラー処理、利益計算のルールも一か所に集められます。

## 4. JAN読取から仕入れ可否表示までの流れ

### 4.1 推奨フロー

1. jan-scannerがカメラまたは手入力でJANコードを受け取る。
2. 現在と同じ方法で、8桁/13桁とチェックデジットをブラウザ側で検証する。
3. 利用者が仕入価格を入力する。または、将来の在庫・仕入マスターから仕入価格を取得する。
4. 画面が自分たちのバックエンドへ、JANコード、仕入価格、地域、通貨など判定に必要な最小情報を送る。
5. バックエンドが同じJAN検証を再度行う。ブラウザ側の検証だけを信用しない。
6. バックエンドがキャッシュを確認する。
7. キャッシュに有効な商品情報がなければ、POIZONのバーコード検索候補であるAPI ID 181を使って商品候補を照会する。
8. 0件なら「POIZONで商品を特定できません」、複数件なら候補を画面へ返し、利用者に正しい商品・サイズを選んでもらう。自動で先頭候補に決めない。
9. 商品が特定できたら、取得したPOIZONの商品ID（SKU単位を優先）を使って価格・出品関連APIを照会する。
10. バックエンドが売価の参考値から、手数料、送料、関税・税、為替差、その他費用を差し引き、見込み利益と利益率を計算する。
11. 決定済みの仕入れ基準に当てはめて、`仕入れ可`、`仕入れ不可`、`要確認` のいずれかを返す。
12. 画面は判定だけでなく、商品名、サイズ、参考価格、想定費用、見込み利益、情報取得時刻、判定理由を表示する。

### 4.2 自分たちのバックエンドAPI案

最初は画面から1回呼ぶだけの単純な形を推奨します。

```text
POST /v1/procurement-checks
```

入力例の項目名:

- `janCode`
- `purchasePrice`
- `purchaseCurrency`
- `region`
- `listingType`
- 商品候補を選び直した場合のみPOIZONの商品ID

返却例の項目名:

- `decision`: `BUY` / `DO_NOT_BUY` / `REVIEW`
- `reasonCodes`
- `productCandidates` または確定した `product`
- `priceReference`
- `estimatedCosts`
- `estimatedProfit`
- `estimatedMarginRate`
- `dataAsOf`
- `isCached`

これは自分たちのAPI案であり、POIZON公式APIのパスではありません。

## 5. バーコード検索候補: POIZON API ID 181

### 5.1 公式資料の再確認結果

2026-07-31時点のPOIZON公式Open PlatformのItemメニューで、次のAPIが現行メニュー項目として確認できます。

- 公式名: **Query SKU and SPU basic information by barcode (multi-language & support batch & pagination)**
- API ID: **181**
- Method: **POST**
- 公式詳細: [API ID 181](https://open.poizon.com/doc/list/apiDetail/181?openKey=11)

公式名に「by barcode」と明記され、SKUとSPUの基本情報を検索するAPIなので、**JANコードからPOIZON商品候補を探す最初のAPI候補として使える**と判断します。また、現行メニュー掲載であり、Fact Sheetだけに残る旧APIではありません。

ただし、次はまだ確定事実にしません。

- 日本のJAN-8/JAN-13が、対象アカウント・対象カテゴリーで必ず登録されていること
- 1つのJANが必ず1つのPOIZON SKUだけに一致すること
- 利用予定アプリのAPI Permission PackageにID 181が含まれること
- 入力パラメータ名、最大件数、ページング、レスポンス項目の実装時点の仕様

そのため設計上は、0件、1件、複数件のすべてを扱います。実装開始時には公式詳細ページとConsoleの権限表示で上記を再確認します。今回はPOIZON APIを実際には呼び出していません。

## 6. 商品特定後の価格・出品推奨API候補

### 6.1 第一候補: API ID 93

- 公式名: **(Get Lowest Price) Listing Recommendations**
- API ID: **93**
- Method: **POST**
- 完全パス: `https://open.poizon.com/dop/api/v1/pop/api/v1/recommend-bid/price`
- 公式詳細: [API ID 93](https://open.poizon.com/doc/list/apiDetail/93?openKey=4)

公式詳細で確認できる主な業務入力は、`skuId` または `globalSkuId`、`biddingType`、`region`、`currency` です。出品方式によって `saleType` も関係します。共通項目として `app_key`、`timestamp`、`sign`、`language`、`timeZone` があり、ERP/ISVでは `access_token` が必要です。

2026-08-03に公式詳細のResponse Parametersを展開して再確認しました。`data` には、30日間の最低・最高・平均取引価格、グローバル・地域別最低価格、需要価格、参考価格、`priceRangeItems`（価格と割合）などが定義されています。金額項目は通貨の最小単位として扱い、画面表示前に通貨ごとの桁を正しく変換します。

一方、公式のレスポンス定義には、`income`、`revenue`、`earnings`、`payout`、`profit`、`fee` に相当する「諸経費控除後の見込み収益」は確認できませんでした。このAPIの値は、**仕入れ判断のための価格参考情報**として使います。販売後の手取り額や利益を直接返すAPIではないため、手数料等を別に計算せず「最低価格 − 仕入価格」だけで利益と判断してはいけません。

POIZONの販売者画面に「見込み収益」が表示される場合でも、公式Open Platform APIのフィールドとして確認できるまでは自動連携に使いません。非公開画面の通信を模倣せず、公式APIまたはPOIZONから書面で確認した計算条件だけを使います。

### 6.2 複数SKUをまとめる場合: API ID 141

- 公式名: **(Get Lowest Price) Listing Recommendations - Batch**
- API ID: **141**
- Method: **POST**
- 公式詳細: [API ID 141](https://open.poizon.com/doc/list/apiDetail/141?openKey=4)

候補が複数ある場合や、将来スキャン履歴をまとめて再評価する場合の候補です。初期版はID 93の1件照会を優先し、必要性が出てからバッチ化します。完全パス、配列パラメータ、最大件数は実装直前に公式詳細ページで再確認します。

### 6.3 Smart Listingを採用する場合のみ: API ID 171

- 公式名: **Smart Listing Recommendations - Batch**
- API ID: **171**
- Method: **POST**
- 公式詳細: [API ID 171](https://open.poizon.com/doc/list/apiDetail/171?openKey=5)

Smart Listingの契約・権限・業務フローを採用すると決めた場合の候補です。単純なJANスキャン後の価格確認では、まずID 93を使う方が分かりやすい設計です。

## 7. フロントエンドとバックエンドの責任分担

| 項目 | jan-scanner画面 | 自分たちのバックエンド |
|---|---|---|
| カメラ制御 | 担当 | 担当しない |
| JANの一次検証 | 担当 | 同じ検証を再実施 |
| 仕入価格などの入力 | 担当 | 値と範囲を検証 |
| POIZON API呼び出し | 行わない | 担当 |
| App Secretを使う署名 | 行わない | 担当 |
| アクセストークン更新 | 行わない | ERP/ISVの場合に担当 |
| 商品候補の選択画面 | 担当 | 候補データを整形して返す |
| キャッシュ | 表示結果の短期保持だけ | 正式なキャッシュを担当 |
| レート制限 | 二重クリックを抑止 | 全利用者・全サーバーをまとめて制御 |
| 費用・利益計算 | 内訳を表示 | 正式な計算を担当 |
| 仕入れ可否判定 | 結果と理由を表示 | ルールに基づき判定 |
| 監査・障害ログ | 秘密を記録しない | `trace_id` 等を安全に記録 |

ブラウザから送られた仕入価格や商品IDは改変可能です。最終判定に使う前に、バックエンドで型、範囲、通貨、対象商品との対応を必ず検証します。

## 8. App Key、App Secret、アクセストークンの保存先

| 情報 | 推奨する保存先 | 保存してはいけない場所 |
|---|---|---|
| App Key | バックエンドの環境設定またはSecret Manager | フロントエンドに置く必要はない。リポジトリへ直書きしない |
| App Secret | バックエンド用Secret Manager。開発時もサーバー専用の安全な環境変数 | `VITE_` 環境変数、`src`、`public`、GitHub Pages、`localStorage`、ログ |
| access token | ERP/ISVの場合、販売者との対応を持つ暗号化データベースまたはSecret Manager | ブラウザ保存、URL、GitHub、ログ、分析ツール |
| refresh token | access tokenと同等以上に厳しく、暗号化してサーバー側だけに保存 | ブラウザ、GitHub、ログ |

本プロジェクトはPOIZON Seller方式に決定したため、ERP/ISV向けOAuthによる販売者ごとのaccess token / refresh token管理は実装対象外です。ただし、個別APIの公式詳細に `access_token` が任意項目として表示される場合があるため、Seller方式での要否は実装時に対象APIの公式詳細とConsoleで確認します。

バックエンド自体への利用者認証には、可能なら `HttpOnly`、`Secure`、`SameSite` を設定したセッションCookieを使います。POIZONのaccess tokenをブラウザのログイン用トークンとして流用しません。

## 9. キャッシュ、レート制限、エラー処理

### 9.1 キャッシュの基本方針

- JANから商品候補への対応は比較的変わりにくいため、最初は24時間程度を目安にする。
- 価格・出品推奨情報は変動しやすいため、1〜5分程度の短いキャッシュから始める。
- 0件結果は5〜15分だけ保存し、登録直後の商品を長時間見つけられなくしない。
- キャッシュキーにはJANまたはSKUだけでなく、販売者、地域、通貨、出品方式など結果に影響する条件を含める。
- 同じ条件の同時リクエストを1回にまとめ、POIZONへの重複照会を避ける。
- 画面へ `dataAsOf` と `isCached` を返し、いつの情報か分かるようにする。

これらの時間は推奨初期値であり、POIZONの利用条件、価格変動、実運用を見て調整します。

### 9.2 レート制限の基本方針

POIZON公式FAQの標準値として、次の複数の上限が示されています。

- 1秒: 5リクエスト
- 1分: 300リクエスト
- 1時間: 10,000リクエスト
- 1日: 20,000リクエスト

すべての時間枠を同時に守る必要があります。バックエンド全体で共有するレートリミッターを置き、安全側の余裕を持たせます。契約や権限パッケージに個別上限が表示される場合は、その値を優先します。

### 9.3 エラー処理の基本方針

- 入力不正: POIZONを呼ばず、JANや仕入価格の修正方法を表示する。
- 商品0件: 「商品なし」と「通信失敗」を区別する。
- 商品複数件: 利用者に選択してもらい、勝手に確定しない。
- 401/403: 認証方式、App Key、署名、トークン期限、Permission Packageをバックエンドで確認する。秘密は画面へ返さない。
- 429: 指数バックオフとジッターを使い、回数上限を設ける。利用者には待って再試行できる時刻を示す。
- タイムアウト/5xx: 読み取り系APIだけを少数回再試行する。再試行できなければ「一時的に判定できない」とし、仕入れ可に倒さない。
- 判定材料不足: `要確認` とし、費用や価格がない状態で仕入れ可にしない。
- ログ: HTTPステータス、POIZONの `code`、`msg`、`trace_id`、自分たちの要求ID、処理時間を記録する。App Secret、token、署名元文字列、個人情報は記録しない。

## 10. まだ決める必要がある項目

### 10.1 決定済み: POIZON Seller方式

- 自社のPOIZON販売者アカウントだけを連携する。
- 複数販売者向けERP/ISVにはしない。
- Seller用アプリに対して、どのAPI Permission Packageが承認されている、または申請可能かはConsoleで確認する。

認証はPOIZON Seller向けのApp Key / App Secretと署名を前提にし、秘密情報はバックエンドだけに保存します。

### 10.2 一部決定済み: 仕入れ基準

- 最低見込み利益: **1,000円以上**。
- 最低利益率: **15%以上**。
- 上記2条件を両方満たす場合だけ `仕入れ可` とする。
- 閾値はバックエンドの設定として保持し、あとから変更可能にする。
- 価格情報が古い場合や商品候補が複数の場合に仕入れを止めるか。
- 在庫回転、サイズ、ブランド、カテゴリー、販売可否をどう評価するか。

利用者が希望する利益率は、POIZONの見込み収益を分母として次のように計算します。

```text
見込み利益
= POIZONの見込み収益
  - 仕入価格
  - POIZONの見込み収益に含まれない費用

利益率（%）
= 見込み利益 / POIZONの見込み収益 * 100
```

POIZONの見込み収益が0以下、取得不能、通貨不一致、または含まれる費用が不明な場合は、ゼロ除算や推測計算をせず `要確認` とします。

### 10.3 利益計算に必要な費用

- POIZONの販売手数料、鑑定関連費用、決済・請求上の控除
- 国内送料、POIZONへの送料、倉庫・梱包費
- 関税、輸入消費税、その他の税
- 為替レート、為替手数料、安全率
- 返品、不良、売れ残り、価格下落のリスク引当

費用の名称と計算方法は、対象の販売方式、地域、契約、請求資料で確定します。API ID 93には見込み収益フィールドが確認できないため、最低価格だけから利益を断定しません。将来、公式APIで見込み収益フィールドが確認できた場合はその値を優先し、そうでなければ公式に確認した価格と費用からバックエンドで計算します。

### 10.4 バックエンドの公開先

- 例: AWS Lambda + API Gateway、Cloud Run、Azure Functions、Cloudflare Workersなど。
- Secret Manager、暗号化データベース、共有レートリミッター、監視、東京からの応答速度、費用を比較する。
- GitHub Pagesのドメインからだけ許可するCORS設定にする。ただしCORSだけを認証の代わりにしない。

## 11. 次の一手

**POIZONサポートまたは担当窓口へ、販売前の「見込み収益」を取得できる公式Open Platform APIがあるかを確認し、ある場合はAPI名・ID・レスポンスの正式フィールド名を書面で確認してください。**

問い合わせにはApp Key、App Secret、アクセストークンの実値を記載しません。APIが提供されていない場合は、対象販売方式の公式な費用計算条件を確認します。

## 参考にした公式資料

- [POIZON Open Platform](https://open.poizon.com/)
- [Get Started](https://open.poizon.com/doc/list/documentationDetail/3)
- [Authentication for Poizon Sellers](https://open.poizon.com/doc/list/documentationDetail/9)
- [Authentication for ERP/ISV](https://open.poizon.com/doc/list/documentationDetail/51)
- [API Introduction](https://open.poizon.com/doc/list/documentationDetail/15)
- [API Fact Sheet](https://open.poizon.com/doc/list/documentationDetail/33)
- [FAQ（レート制限等）](https://open.poizon.com/doc/list/supportDetail/21)
- [API ID 181](https://open.poizon.com/doc/list/apiDetail/181?openKey=11)
- [API ID 93](https://open.poizon.com/doc/list/apiDetail/93?openKey=4)
- [API ID 141](https://open.poizon.com/doc/list/apiDetail/141?openKey=4)
- [API ID 171](https://open.poizon.com/doc/list/apiDetail/171?openKey=5)

API名、パス、パラメータ、権限、制限は更新される可能性があります。実装開始時と本番公開前に、対象APIの公式詳細ページとConsoleを再確認します。非公開API、スクレイピング、リバースエンジニアリングは利用しません。
