import './App.css'
import { JanScannerPage } from './components/JanScannerPage'

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div>
          <p className="app-name">JAN Pocket</p>
          <p className="app-description">かんたん商品コード読み取り</p>
        </div>
      </header>

      <main>
        <section className="intro" aria-labelledby="page-title">
          <p className="intro-kicker">SIMPLE &amp; SECURE</p>
          <h1 id="page-title">
            かざすだけで、
            <span>すぐ読み取り。</span>
          </h1>
          <p>
            カメラ映像は保存せず、読み取り履歴だけを
            <br />
            この端末内に保存します。
          </p>
        </section>

        <JanScannerPage />
      </main>

      <footer>
        <p>EAN-13 / EAN-8 対応</p>
        <p>QRコードには対応していません</p>
      </footer>
    </div>
  )
}

export default App
