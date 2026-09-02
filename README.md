# JANスキャナー

iPhoneなどのブラウザからJANコードを読み取り、端末内に履歴を保存する個人利用向けWebアプリです。App Storeからインストールする必要はなく、GitHub Pagesで公開しています。iPhoneのホーム画面にも追加できます。

**公開URL：<https://daisanmon.github.io/jan-scanner/>**

リポジトリ：<https://github.com/daisanmon/jan-scanner>

## 主な機能

- カメラによる縦向き・横向きのJANコード読み取り（EAN-13、連続認識で確定）
- 読み取ったコードの桁数とチェックデジットの検証
- 8桁または13桁のJANコードの手入力と検証
- `JAN`／`Alpen QR`の明示的なモード切替（起動時は既存のJANモード）
- スポーツデポ／Alpen公式のシューズ商品QR、商品URL、10桁の商品番号、メーカー型番からのPOIZON商品照合
- 複数候補や通信失敗を連続スキャンから切り離して保存する要確認・未解決キュー
- JAN登録後のPOIZON商品・全サイズ・参考価格・過去30日販売統計照会（バックエンド設定後に有効）
- 最低売上利益率と最低見込み利益による仕入れ基準の端末別設定（中国表示可能価格だけを概算収入の売価基準に使用し、30日平均成約価格は参考情報として分離）
- 読み取り履歴と照会時点の商品・全サイズ市場データの保存
- 日本語・日本時間（Asia/Tokyo）での読み取り日時表示
- 履歴の個別削除と全件削除
- カメラで同じコードを短時間に検出した場合の重複登録防止（3秒）
- `localStorage`への履歴保存
- JSON形式のバックアップと、既存履歴への追加／全件置換による復元
- CSV形式での履歴書き出し
- iPhoneのホーム画面への追加
- GitHub PagesによるHTTPS公開

JANモードのカメラ読み取り対象はEAN-13です。EAN-8は誤検出防止のため手入力で登録できます。Alpen QRモードは`store.alpen-group.jp`のシューズ商品QRだけを受け付け、QRから特定したカラー込み型番をPOIZONへ照会します。

## 使い方

1. iPhoneのSafariで[公開URL](https://daisanmon.github.io/jan-scanner/)を開きます。
2. 「読み取りを開始」を押します。
3. 初回は、ブラウザから求められるカメラの使用を許可します。
4. バーコード全体を画面の枠内に映します。シールが縦向き・横向きのどちらでも、そのまま読み取れます。
5. 有効なJANコードが読み取られると照会キューへ追加され、カメラを止めずに次のJANを読み取れます。商品・市場データは1件ずつ順番に照会して同じ読み取り履歴へ保存します。初回の照会時だけブラウザ確認が表示される場合があります。
6. カメラを使わない場合は、折りたたまれている「JANコードを手入力」を開き、8桁または13桁のコードを入力して「登録」を押します。
7. 必要に応じて「JSONを書き出す」または「CSVを書き出す」を押します。端末がファイル共有に対応している場合は共有画面が開き、それ以外ではファイルがダウンロードされます。

Alpen QRを使う場合は、画面上部で「Alpen QR」へ切り替え、棚札の「詳しくはこちら」QRを読み取ります。サイズは特定せず、POIZONで一致した商品の全サイズを既存JANモードと同じ基準で評価します。複数候補は履歴の要確認欄へ送られるため、カメラを止めずに次の商品を読み取れます。

使用後は「カメラを停止」でカメラを終了できます。

## iPhoneのホーム画面への追加

Safariで公開URLを開き、次の順に操作します。

```text
共有ボタン
→ ホーム画面に追加
→ 追加
```

ホーム画面から起動した場合も、履歴はそのWebアプリが使用するブラウザの保存領域に保存されます。

## データ保存とバックアップ

履歴はブラウザの`localStorage`に保存されます。保存キーは`jan-pocket:scan-history`で、スキーマバージョンと履歴の配列を持つJSON形式です。各履歴にはID、検索元、検索値、ISO形式の読み取り日時、登録方法（`camera`または`manual`）、同一商品のスキャン回数が含まれ、照会完了後は商品、全サイズの価格・販売統計、仕入れ評価、その取得時刻も加わります。サイズ別の軽量価格履歴はJST日ごとに1件、直近90日を保持します。従来のスキーマv1〜v4履歴は自動的に読み込み、新規保存時にv5へ移行します。

Turnstile確認後にWorkerが発行する30分有効の短期セッショントークンは`sessionStorage`へ保存され、同じタブ内の後続照会で再利用されます。タブを閉じるか期限が切れると破棄されます。このトークンはApp SecretやTurnstile Secretではありません。

履歴はサーバーやGitHubへ同期されません。POIZON連携を有効にした場合、登録したJANコードは商品・全サイズ・価格・販売統計照会のためCloudflare Worker経由でPOIZON Open Platform APIへ送信されます。履歴のJSON/CSVを書き出した後に共有先を選んだ場合は、そのファイルが選択した共有先へ渡されます。

- 履歴は別端末へ自動同期されません。
- ブラウザやURLが異なると、保存領域も異なります。
- SafariのWebサイトデータを削除した場合や端末を初期化した場合は、履歴が失われる可能性があります。
- JSONは復元用バックアップです。`schemaVersion`、書き出し日時、履歴が保存され、有効な履歴だけを「既存履歴へ追加」または「すべて置き換え」で復元できます。
- CSVは閲覧・集計用です。JANコード、読取日時、登録方法に加え、商品名、ブランド、spuId、過去30日販売数、仕入れ基準価格中央値を書き出します。全サイズの詳細はJSONバックアップへ保存されます。CSVからの復元機能はありません。

重要な履歴は、定期的に「JSONを書き出す」で端末外にも保存してください。

## 対応環境

- 主な利用対象：iPhone Safari
- 開発・確認環境：Windows 11、PowerShell、VS Code
- カメラを利用するにはHTTPSまたは`localhost`で開く必要があります。
- カメラの許可、ファイルの共有やダウンロード、ホーム画面への追加の挙動はブラウザや端末に依存します。

## 技術構成

- React
- TypeScript
- Vite
- Quagga2（`@ericblade/quagga2`）
- ESLint
- localStorage
- GitHub Actions
- GitHub Pages
- Cloudflare Workers / SQLite-backed Durable Objects
- Cloudflare Turnstile
- POIZON Open Platform API（JAN検索: API 181、型番検索: API 226、全サイズ: API 169、価格: API 141。API 93はJAN経路の単一サイズフォールバック）

## ローカル開発

Node.jsとnpmを利用できるWindows 11環境で、PowerShellから次を実行します。

```powershell
git clone https://github.com/daisanmon/jan-scanner.git
cd jan-scanner
npm.cmd ci
npm.cmd run dev
```

Viteの開発サーバーが表示したURLをブラウザで開いてください。このREADMEでは、PowerShellの実行ポリシーによって`npm`を直接実行できない環境も考慮し、`npm.cmd`を使用しています。

POIZONバックエンドをローカル起動する場合は、`.dev.vars.example`を`.dev.vars`へコピーして開発用の値を設定し、別のターミナルで次を実行します。`.dev.vars`はGit管理対象外です。

```powershell
npm.cmd run dev:worker
```

フロントエンドの公開接続先とTurnstile site keyは`src/config/publicConfig.ts`で管理します。初期状態は無効です。App Secret、Turnstile secret key、その他の秘密情報をこのファイル、`VITE_`環境変数、ブラウザ、GitHubへ置かないでください。ブラウザへ返す30分セッショントークンはTurnstile検証済み状態だけを示し、POIZON署名には使用できません。

## ビルドとLint

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

フロントエンドの成果物は`dist/`、Workerのドライラン成果物は`dist-worker/`に作成されます。テストにはネストされた署名、API 181/169/141/93の正規化と呼び出し順序、集計、キャッシュ、Turnstile検証、全サイズ市場データの画面表示が含まれます。

## POIZONバックエンドの設定とデプロイ

バックエンドはCloudflare Workers Free、SQLite-backed Durable Object、`workers.dev`を前提としています。署名と秘密情報はWorker内だけで扱います。デプロイ前にCloudflare Turnstileで`daisanmon.github.io`を許可したウィジェットを作成してください。

```powershell
npx.cmd wrangler login
npx.cmd wrangler secret put POIZON_APP_KEY
npx.cmd wrangler secret put POIZON_APP_SECRET
npx.cmd wrangler secret put TURNSTILE_SECRET_KEY
npm.cmd run deploy:worker
```

デプロイ後、発行された`https://...workers.dev` URLと公開Turnstile site keyを`src/config/publicConfig.ts`へ設定し、`enabled`を`true`にします。秘密値は`wrangler.jsonc`やGitHubへ追加しません。Workerの詳細な入出力と運用設定は`worker/README.md`を参照してください。

## GitHub Pagesへの公開

`vite.config.ts`の`base`は`/jan-scanner/`です。`main`ブランチへpushするとGitHub Actionsの`.github/workflows/deploy.yml`が依存関係のインストールとビルドを行い、`dist/`をGitHub Pagesへ公開します。Actionsの完了後、[公開URL](https://daisanmon.github.io/jan-scanner/)へ反映されます。

通常の更新手順は次のとおりです。

```powershell
git status
npm.cmd run build
npm.cmd run lint
git diff --check
git add .
git commit -m "変更内容"
git push
```

`git add .`を実行する前に、`git status`と`git diff`で意図したファイルだけが変更されていることを確認してください。

## ホーム画面アイコン

専用のホーム画面用PNGアイコンは、現在まだ追加されていません。追加する場合は、次のファイルを`public/icons/`に配置します。

- `public/icons/icon-192.png`：192 × 192 px（Web App Manifest用）
- `public/icons/icon-512.png`：512 × 512 px（Web App Manifest用）
- `public/icons/apple-touch-icon.png`：180 × 180 px（iPhoneホーム画面用）

配置後は`public/manifest.webmanifest`の`icons`へ192 pxと512 pxの相対パスを登録し、`index.html`へ`apple-touch-icon.png`の相対パスを指定した`link`要素を追加する必要があります。GitHub Pagesではサブディレクトリ`/jan-scanner/`から配信されるため、先頭が`/`の絶対パスは使用せず、配信先を考慮したパスにします。

## 現在の制限事項

- POIZON連携はCloudflare Worker、Turnstile、POIZON Open Platformの設定完了後に利用できます。
- 中国表示可能価格と販売統計はPOIZON APIが返す取得時点の値です。「概算収入」は公開APIが返す値ではなく、日本の自社Sellerアカウント・中国市場・検証済みスニーカー向け手数料ポリシーによるアプリ計算です。サンダル、クロッグ等の料金未検証商品は要確認として計算しません。POIZON画面との将来の一致、販売価格、買取価格、利益、将来の販売数を保証しません。
- 画面の「中国市場・過去30日販売数」はOpen Platformの`globalSoldNum30`を使用しています。セラー画面との実データ照合済みですが、POIZON上の正式な市場範囲はサポートへ確認中です。
- 複数端末間の履歴同期はありません。
- Service Workerは実装されておらず、オフライン動作は保証されません。
- 履歴は端末・ブラウザ・URLごとの保存領域に分かれます。
- 専用のホーム画面用PNGアイコンは未追加です。
- Alpen QR初期版は公式サイトのシューズ商品だけが対象です。他店QR、ウェア、任意URLには対応していません。
