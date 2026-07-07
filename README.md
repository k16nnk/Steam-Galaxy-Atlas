# Steam Galaxy Atlas

Steamのゲームタイトルを恒星・惑星・衛星・小惑星として描く3D宇宙。
設計は `DESIGN.md`、進捗は `PROGRESS.md` を参照。

## 起動 (サンプルデータ同梱済み)

```bash
cd web
npm install
npm run dev
# → http://localhost:3000
```

`web/public/universe.json` に有名タイトル約170件のサンプル宇宙が生成済みなので、すぐに動きます。

## 操作

- ドラッグ: 回転 / ホイール: ズーム / 右ドラッグ: パン
- 天体にホバー → FPS照準風ハイライト + 情報ポップアップ
- ポップアップをクリック → Steamストアページ (新しいタブ)
- 左下 Search → 候補選択でその天体へカメラ移動

## 実データへの差し替え (上位 ~10,000タイトル)

Node 22以上で、このフォルダ直下から実行:

```bash
npm run fetch:steamspy        # SteamSpy上位10,000件 (約10分, 60秒/リクエスト)
npm run fetch:details:spy &   # タグ/ジャンル詳細 上位2,000件 (~35分, 並行実行可)
npm run fetch:details:store   # 発売日/種別 上位2,000件 (~55分)
npm run build:universe        # → web/public/universe.json を再生成
```

- すべて**中断・再開可能**(取得済みはスキップ)。途中で止めても再実行すれば続きから。
- 取得対象件数は `LIMIT=5000 npm run fetch:details:spy` のように変更可。
- データは `data/atlas.db` (SQLite) にキャッシュ。取得日時とデータソースを保存。
- 所有者数・市場規模などはすべて **SteamSpyによる推定値** です。

## Steamライブラリ取込 (任意)

My Universe (★) からSteamの所持ゲームを取り込むには、サーバー側にAPIキーが必要です:

1. https://steamcommunity.com/dev/apikey でSteam Web APIキーを取得
2. Vercelのプロジェクト設定 → Environment Variables に `STEAM_API_KEY` として追加 → Redeploy

キー未設定でもサイト自体は完全に動作します(取込機能だけが案内表示になります)。
取り込んだデータはユーザーのブラウザ(localStorage)にのみ保存され、サーバーには一切保存されません。

## 構成

- `pipeline/` — データ取得・influence_score計算・分類・星系/銀河クラスタリング・座標生成 (依存パッケージなし、Node標準のみ)
- `web/` — Next.js + React Three Fiber。InstancedMesh×3 + カスタムシェーダー(恒星: 自発光 / 惑星: 恒星方向からの疑似ライティング)
- `pipeline/seed-sample.js` — サンプルデータ投入 (実データ取得後は不要)
