import './App.css'
import { JanScanner } from './components/JanScanner'

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
            カメラ映像や読み取り結果は保存せず、
            <br />
            この端末内だけで処理します。
          </p>
        </section>

        <JanScanner />
      </main>

      <footer>
        <p>EAN-13 / EAN-8 対応</p>
        <p>QRコードには対応していません</p>
      </footer>
    </div>
  )
}

export default App
