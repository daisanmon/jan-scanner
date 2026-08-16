# POIZON Sellerセットアップ・チェックリスト

- 対象: `jan-scanner`
- 連携方式: 自社アカウントだけで使うPOIZON Seller
- 作成日: 2026-07-31（Asia/Tokyo）
- 目的: 実装を始める前に、自社アプリと必要なAPI権限が準備できているか確認する

このチェックリストはConsoleの状態確認用です。**APIの実行、Try itの実行、認証情報の入力テストは行いません。**

## 最重要の注意

> **App Key、App Secret、access token、署名文字列の実値を、このファイル、GitHub、Issue、チャット、メール、スクリーンショットへ記載してはいけません。**

App Keyはアプリ識別子ですが、このプロジェクトではApp Secretと同じくバックエンドの設定として扱い、リポジトリへ直書きしません。App Secretはブラウザ、Viteの `VITE_` 環境変数、`localStorage` にも保存しません。

確認結果には、秘密の値ではなく「発行済み」「未発行」「申請中」「承認済み」のような状態だけを書きます。画面を撮影する必要がある場合は、キー、Secret、token、署名、個人情報が写っていないことを確認してください。

## 1. POIZON Open Platformへログインする

公式サイト: [POIZON Open Platform](https://open.poizon.com/)

- [x] 公式URLが `https://open.poizon.com/` であることを確認した。
- [x] 画面右上のログイン項目（表示言語により `Log in` / `Sign in` など）を開いた。
- [x] 自社のPOIZON販売者アカウントでログインした。
- [x] 開発者種別または連携種別が **POIZON Seller** であることを確認した。
- [x] ERP Enterprise / ERP/ISV用の画面を選んでいないことを確認した。

画面名は更新で変わる可能性があります。迷った場合は、[Get Started](https://open.poizon.com/doc/list/documentationDetail/3)を開き、POIZON Sellerの導入手順と見比べます。

## 2. ConsoleでSeller用アプリの有無を確認する

- [x] ログイン後に `Console` を開いた。
- [x] アプリ一覧（`Applications`、`My Apps` などの名称の場合がある）を開いた。
- [x] `jan-scanner` で使う自社アプリが一覧にあるか確認した。
- [x] そのアプリの開発者種別が **POIZON Seller** であることを確認した。
- [x] アプリの状態が有効、審査中、停止中などのどれかを確認した。

確認結果:

- [x] Seller用アプリあり
- [ ] Seller用アプリなし
- アプリ名（秘密情報ではありません）: `My Price Checker`
- アプリ状態: `Active`
- 確認日: `2026年08月01日`

## 3. アプリがない場合は作成する

すでに正しいSeller用アプリがある場合、この章は「対象外」にチェックして次へ進みます。

- [x] 対象外（既存のSeller用アプリを使う）
- [ ] Consoleのアプリ作成ボタン（`Create App`、`Create Application` など）を開いた。
- [ ] 開発者種別として **POIZON Seller** を選んだ。
- [ ] 自社内で区別できるアプリ名と、JANスキャン連携であることが分かる説明を入力した。
- [ ] 利用目的やコールバックURLなど、画面で必須になっている非秘密項目を入力した。
- [ ] 入力内容を確認して作成または審査申請を行った。
- [ ] 作成後、アプリ一覧へ表示されたことを確認した。

App KeyやApp Secretは、申請フォームの説明欄やメモ欄へ書きません。

## 4. Application Infoを確認する

対象アプリの詳細を開き、`Application Info` を確認します。値をこのファイルへ転記せず、発行状態だけを確認します。

- [x] `Application Info` を開いた。
- [x] App Keyの項目が存在する。
- [x] App Keyが発行済みである。
- [x] App Secretの項目が存在する。
- [x] App Secretが発行済みである。
- [x] 値をコピーしてこのファイル、GitHub、チャットへ貼り付けていない。
- [x] スクリーンショットを保存していない。または秘密部分を確実に除外した。

確認結果:

- App Key: [x] 発行済み / [ ] 未発行 / [ ] 不明
- App Secret: [x] 発行済み / [ ] 未発行 / [ ] 不明
- 確認日: `2026年08月01日`

## 5. API Permission Packageを確認・申請する

POIZON Open Platformでは、アプリを作っただけですべてのAPIを使えるとは限りません。対象アプリの `API Permission Package` で、必要なAPIを含む権限パッケージが承認されている必要があります。

- [x] 対象アプリの `API Permission Package` を開いた。
- [x] API ID 181を含むPermission Packageを探した。
- [x] API ID 93を含むPermission Packageを探した。
- [x] パッケージ名、申請状態、承認状態を下の欄へ記録した。
- [ ] 未申請の場合、必要性を確認して申請した。
- [ ] 申請中の場合、承認待ちとして記録した。
- [ ] 見つからない場合、推測で別APIを使わずPOIZONサポートへの確認事項として記録した。

権限パッケージ名:

- API ID 181を含むパッケージ: `Default`
- API ID 93を含むパッケージ: `Default`
- 申請日: `________年____月____日`
- 承認日: `________年____月____日`
- 不明点・サポート確認事項: `________________________________________`

## 6. 最初の試作に必要なAPI

2026-07-31にPOIZON公式資料を再確認しました。どちらも現行メニューに掲載されており、Fact Sheetだけに残る項目ではありません。ID 93は公式詳細本文、完全パス、Try itの表示も確認できました。ID 181は現行Itemメニュー上の名称、Method、公式詳細URLを確認しました。ただし、自社アプリで実際に利用できるかはPermission Packageの承認状況で決まります。

### API ID 181: JAN・バーコードから商品候補を検索

- 公式名: **Query SKU and SPU basic information by barcode (multi-language & support batch & pagination)**
- Method: **POST**
- 公式詳細: [API ID 181](https://open.poizon.com/doc/list/apiDetail/181?openKey=11)
- 使い方: JANコードをバーコードとして商品候補のSKU/SPU照会に使う。
- 注意: JANが0件、1件、複数件になる可能性を考慮する。対象カテゴリーのJANが必ず登録されているとは断定しない。

### API ID 93: 商品1件の価格・出品推奨情報を取得

- 公式名: **(Get Lowest Price) Listing Recommendations**
- Method: **POST**
- 完全パス: `https://open.poizon.com/dop/api/v1/pop/api/v1/recommend-bid/price`
- 公式詳細: [API ID 93](https://open.poizon.com/doc/list/apiDetail/93?openKey=4)
- 使い方: ID 181で特定したSKUについて、最低価格などの価格参考情報を得る。
- 注意: 取得価格は最終利益ではない。手数料、送料、税、為替等は別に計算する。

## 7. 後回しにするAPI

初回試作の対象には含めません。

### API ID 141: バッチ照会

- 公式名: **(Get Lowest Price) Listing Recommendations - Batch**
- Method: **POST**
- 公式詳細: [API ID 141](https://open.poizon.com/doc/list/apiDetail/141?openKey=4)
- [x] 初回試作では使わないことを確認した。
- 導入を再検討する条件: 複数SKUやスキャン履歴をまとめて評価する必要が出たとき。

### API ID 171: Smart Listing採用時のみ

- 公式名: **Smart Listing Recommendations - Batch**
- Method: **POST**
- 公式詳細: [API ID 171](https://open.poizon.com/doc/list/apiDetail/171?openKey=5)
- [x] 初回試作では使わないことを確認した。
- 導入を再検討する条件: Smart Listingを契約・運用方針として採用したとき。

## 8. APIごとの確認表

`Try it利用可` はボタンや機能が表示されているかだけを確認します。**今回はクリック、実行、認証情報の入力をしません。**

| API | 現行メニュー掲載 | Permission Package名を確認 | 権限を申請済み | 権限を承認済み | Try it利用可 | 備考 |
|---|---|---|---|---|---|---|
| ID 181 バーコード商品検索 | [x] はい [ ] いいえ | [x] | [x] | [x] | [x] | `____________` |
| ID 93 1件価格・出品推奨 | [x] はい [ ] いいえ | [x] | [x] | [x] | [x] | `____________` |
| ID 141 バッチ価格照会（後回し） | [x] はい [ ] いいえ | [x] | [x] | [x] | [x] | `____________` |
| ID 171 Smart Listing（後回し） | [x] はい [ ] いいえ | [x] | [x] | [x] | [x] | `____________` |

確認者: `____門脇大____________`  確認日: `____2026____年__08__月__01__日`

## 9. 試作開始前の完了チェック

- [x] POIZON Seller方式の自社アプリが存在する。
- [x] アプリが利用可能な状態である。
- [x] App Keyが発行済みである（値は記録しない）。
- [x] App Secretが発行済みである（値は記録しない）。
- [x] API ID 181のPermission Package名を確認した。
- [x] API ID 181の権限が承認済みである。
- [x] API ID 93のPermission Package名を確認した。
- [x] API ID 93の権限が承認済みである。
- [x] API ID 181のTry itが表示されることだけ確認した（実行していない）。
- [x] API ID 93のTry itが表示されることだけ確認した（実行していない）。
- [x] API ID 141と171は初回試作の対象外にした。
- [x] 秘密情報をドキュメント、GitHub、チャット、スクリーンショットへ記載していない。

判定:

- [x] 試作準備完了
- [ ] 権限申請中のため待機
- [ ] POIZONへの問い合わせが必要

安全なメモ（秘密情報は禁止）:

```text



```

## 10. 秘密情報を記載しない

- [x] App Keyの実値をこのファイル、GitHub、チャット、スクリーンショットへ記載していない。
- [x] App Secretの実値をこのファイル、GitHub、チャット、スクリーンショットへ記載していない。
- [x] access tokenや署名文字列の実値を記載していない。
- [x] 今後の実装でもApp Secretを `VITE_` 環境変数やブラウザ保存領域へ置かない方針を確認した。

## 公式資料

- [POIZON Open Platform](https://open.poizon.com/)
- [Get Started](https://open.poizon.com/doc/list/documentationDetail/3)
- [Authentication for Poizon Sellers](https://open.poizon.com/doc/list/documentationDetail/9)
- [API Introduction](https://open.poizon.com/doc/list/documentationDetail/15)
- [API Fact Sheet](https://open.poizon.com/doc/list/documentationDetail/33)
- [API ID 181](https://open.poizon.com/doc/list/apiDetail/181?openKey=11)
- [API ID 93](https://open.poizon.com/doc/list/apiDetail/93?openKey=4)

API名、パス、Permission Package、画面名は更新される可能性があります。実装開始時には、公式詳細ページと自社Consoleの表示を優先してください。非公開API、スクレイピング、リバースエンジニアリングは利用しません。
