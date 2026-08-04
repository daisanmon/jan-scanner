# POIZON ローカルバックエンド運用手順

この構成では、GitHub Pages の画面から固定の ngrok URL を経由し、この PC で動くローカル Worker が POIZON Open Platform API を呼び出します。App Secret などの秘密情報は PC 内だけに保存され、ブラウザや GitHub には渡りません。

## 運用時の構成

- フロントエンド: `https://daisanmon.github.io/jan-scanner/`
- 公開トンネル: `https://sprite-rehire-undercook.ngrok-free.dev`
- バックエンド: この PC の `http://127.0.0.1:8787`
- 秘密情報: Git 対象外の `.dev.vars` と `.local-runtime/ngrok.yml`

この PC が停止、スリープ、インターネット切断の状態では、POIZON 商品照会は利用できません。画面のスキャン履歴など、ブラウザ内だけで完結する既存機能には影響しません。

## 毎日の起動

PowerShell を開き、次を実行します。

```powershell
cd C:\Users\daisa\projects\jan-scanner
npm.cmd run start:poizon-local
```

`Local POIZON backend is running.` と公開 URL が表示されたら準備完了です。起動したプロセスは非表示で動くため、起動に使った PowerShell は閉じても構いません。PC はスリープさせないでください。

別の PowerShell から、秘密情報を表示せずに状態を確認できます。

```powershell
cd C:\Users\daisa\projects\jan-scanner
npm.cmd run status:poizon-local
```

`WorkerProcess`、`NgrokProcess`、`LocalHealth`、`PublicHealth` がすべて `True` なら正常です。

## 毎日の停止

```powershell
cd C:\Users\daisa\projects\jan-scanner
npm.cmd run stop:poizon-local
```

このコマンドは、起動時に記録したプロセスだけを照合して停止します。

## POIZON の IP ホワイトリスト

POIZON に見える送信元は、この PC がインターネットへ接続するときの公開 IPv4 です。ルーターの再接続、契約回線や接続場所の変更などで公開 IPv4 が変わった場合、POIZON Open Platform のアプリ設定にある IP ホワイトリストも更新してください。

現在の公開 IPv4 は、PowerShell で次のように確認できます。

```powershell
(Invoke-RestMethod -Uri 'https://api.ipify.org').Trim()
```

表示された値は POIZON の設定画面でだけ使用し、ソースコード、GitHub、チャットには貼り付けないでください。

## 秘密情報を更新する場合

POIZON の App Key / App Secret または Turnstile Secret Key を変更した場合は、バックエンドを停止してから次を実行します。

```powershell
cd C:\Users\daisa\projects\jan-scanner
npm.cmd run stop:poizon-local
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-local-poizon.ps1 -Force
npm.cmd run start:poizon-local
```

ngrok Authtoken を更新する場合も同様です。

```powershell
cd C:\Users\daisa\projects\jan-scanner
npm.cmd run stop:poizon-local
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-local-ngrok.ps1 -Force
npm.cmd run start:poizon-local
```

入力は画面に表示されません。認証情報の値だけをコピーし、ラベル、空白、引用符は含めないでください。

## よくある問題

- 「runtime state already exists」: すでに起動中です。まず `npm.cmd run status:poizon-local` を実行してください。再起動する場合は停止してから起動します。
- `PublicHealth` だけが `False`: インターネット接続または ngrok の状態を確認し、停止後に再起動します。
- POIZON が `401` を返す: POIZON の IP ホワイトリスト、App Key / App Secret、API 権限パッケージを確認します。
- Turnstile 検証に失敗する: Turnstile の許可ホスト名が `daisanmon.github.io` であることと、`.dev.vars` の Secret Key が現在のウィジェットの値であることを確認します。
- 再起動しても直らない: `.local-runtime/worker.stderr.log`、`worker.stdout.log`、`ngrok.stderr.log`、`ngrok.stdout.log` の末尾を確認します。ログや設定ファイルを共有する前に、認証情報が含まれていないことを必ず確認してください。

## セキュリティ上の注意

- `.dev.vars`、`.local-runtime/`、`.local-tools/` は Git 対象外です。
- App Secret や Turnstile Secret Key を `VITE_` 環境変数へ移さないでください。
- 秘密情報を `src/`、`public/`、GitHub Actions、Issue、チャットへ貼り付けないでください。
- POIZON と Turnstile の秘密情報をローテーションした場合、古い値は再利用しないでください。
