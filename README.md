# JANスキャナー

iPhoneなどのブラウザからJANコードを読み取り、端末内に履歴を保存する個人利用向けWebアプリです。App Storeからインストールする必要はなく、GitHub Pagesで公開しています。iPhoneのホーム画面にも追加できます。

**公開URL：<https://daisanmon.github.io/jan-scanner/>**

リポジトリ：<https://github.com/daisanmon/jan-scanner>

## 主な機能

- カメラによるJANコードの読み取り（EAN-13／EAN-8）
- 読み取ったコードの桁数とチェックデジットの検証
- 8桁または13桁のJANコードの手入力と検証
- 読み取り履歴の保存（カメラ／手入力の登録方法を表示）
- 日本語・日本時間（Asia/Tokyo）での読み取り日時表示
- 履歴の個別削除と全件削除
- カメラで同じコードを短時間に検出した場合の重複登録防止（3秒）
- `localStorage`への履歴保存
- JSON形式のバックアップと、既存履歴への追加／全件置換による復元
- CSV形式での履歴書き出し
- iPhoneのホーム画面への追加
- GitHub PagesによるHTTPS公開

読み取り対象はEAN-13とEAN-8です。QRコードには対応していません。

## 使い方

1. iPhoneのSafariで[公開URL](https://daisanmon.github.io/jan-scanner/)を開きます。
2. 「読み取りを開始」を押します。
3. 初回は、ブラウザから求められるカメラの使用を許可します。
4. バーコードを画面の枠の中央に映します。
5. 有効なJANコードが読み取られるとカメラが一時停止し、「読み取り履歴」に登録されます。続ける場合は「再読み取り」を押します。
6. カメラを使わない場合は「JANコードを手入力」に8桁または13桁のコードを入力し、「登録」を押します。
7. 必要に応じて「JSONを書き出す」または「CSVを書き出す」を押します。端末がファイル共有に対応している場合は共有画面が開き、それ以外ではファイルがダウンロードされます。

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

履歴はブラウザの`localStorage`に保存されます。保存キーは`jan-pocket:scan-history`で、スキーマバージョンと履歴の配列を持つJSON形式です。各履歴にはID、JANコード、ISO形式の読み取り日時、登録方法（`camera`または`manual`）が含まれます。

アプリのコードには、履歴をサーバー、GitHub、外部APIへ送信する処理はありません。ただし、「JSONを書き出す」「CSVを書き出す」を押した後に共有先を選んだ場合は、そのファイルが選択した共有先へ渡されます。

- 履歴は別端末へ自動同期されません。
- ブラウザやURLが異なると、保存領域も異なります。
- SafariのWebサイトデータを削除した場合や端末を初期化した場合は、履歴が失われる可能性があります。
- JSONは復元用バックアップです。`schemaVersion`、書き出し日時、履歴が保存され、有効な履歴だけを「既存履歴へ追加」または「すべて置き換え」で復元できます。
- CSVは閲覧・集計用です。列は「JANコード」「読取日時」「登録方法」で、日時はISO形式、登録方法は「カメラ」または「手入力」です。CSVからの復元機能はありません。

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

## ローカル開発

Node.jsとnpmを利用できるWindows 11環境で、PowerShellから次を実行します。

```powershell
git clone https://github.com/daisanmon/jan-scanner.git
cd jan-scanner
npm.cmd ci
npm.cmd run dev
```

Viteの開発サーバーが表示したURLをブラウザで開いてください。このREADMEでは、PowerShellの実行ポリシーによって`npm`を直接実行できない環境も考慮し、`npm.cmd`を使用しています。

## ビルドとLint

```powershell
npm.cmd run build
npm.cmd run lint
```

ビルド成果物は`dist/`に作成されます。

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

- 商品名の自動取得は行いません。
- 商品情報の外部データベースや外部APIとは連携していません。
- 複数端末間の履歴同期はありません。
- Service Workerは実装されておらず、オフライン動作は保証されません。
- 履歴は端末・ブラウザ・URLごとの保存領域に分かれます。
- 専用のホーム画面用PNGアイコンは未追加です。
- QRコードは読み取り対象外です。
