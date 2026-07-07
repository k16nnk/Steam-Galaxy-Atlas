# Steam Galaxy Atlas — 進捗

「continue」と入力されたら、このファイルを読んで未完了の先頭タスクから再開すること。
設計の詳細は DESIGN.md、起動方法は README.md を参照。

## Journeyフェーズ (コア体験再設計) — 2026-07-07 完了

確定した設計判断: 航路/星座/発光はReset・Escまで永続 / 訪問星は金色トレイル線 /
回転はズーム・飛行でのみ停止(ドラッグでは止めない)+背景星空は常時微回転 /
Share削除→★お気に入り(localStorage) / スタート画面(毎回・ロード兼用) /
My Universeシーン(お気に入り・履歴・嗜好タグ・Steam取込=/api/steam経由、要STEAM_API_KEY環境変数) /
UI: 左下Search+縦ボタン列(✦◐★i↺、ホバーでラベル) / モードに「My Games」追加(aState属性)

- [x] J1 store全面改訂: route永続/visited/favorites/owned/stateVersion/started/myOpen/loadPersisted/clearJourney
- [x] J2 Bodies: aState(glow,fav,own)動的属性+発光シェーダー+mode4(mine)
- [x] J3 FocusGraph改訂: store.route駆動で永続表示+訪問トレイル線(金)
- [x] J4 Universe: idle停止=ズーム/飛行のみ+背景星空の常時微回転+Capture削除 (Reset後は回転再開)
- [x] J5 StartScreen.tsx (click to start、ロード表示兼用、毎回表示)
- [x] J6 MyUniverse.tsx + app/api/steam/route.ts (STEAM_API_KEY未設定時は501+日本語案内)
- [x] J7 MissionControl再構成: 縦列✦◐★i↺+凡例統合+Share削除+下中央トースト
- [x] J8 Drawer: ★お気に入りトグル (金色発光と連動)
- [x] J9 CSS全面再配置 (Legend.tsxは未使用化)
- [x] J10 next build検証済み → 残: git push + (任意)VercelにSTEAM_API_KEY設定

## Mission Controlフェーズ (2026-07-07 完了・自律実行)

方針判断(自己裁量で確定): シングルクリック=Detail Drawer / ダブルクリック=フォーカス飛行 /
ポップアップクリック=Steam。Reset=視点+フォーカス+検索+ドロワーを初期化(モードは維持)。

- [x] M1 store拡張: mode/drawerId/galaxyHover/toast/resetCount/flyToPoint/resetView/openDrawer
- [x] M2 lib/explore.ts + lib/captureBus.ts
- [x] M3 MissionControl.tsx: ↺Reset/✦Explore/◐Mode/⤓Share+トースト+Daily Expedition+初回オンボーディング
- [x] M4 Drawer.tsx (Similar(nb)クリックで旅続行)
- [x] M5 Bodies.tsx: クリック→drawer / uMode(popularity/gems/timeline)
- [x] M6 GalaxyLabels: ホバーでGalaxySummary+クリックで銀河へ飛行
- [x] M7 CaptureBridge / Searchリセット連動 / Esc拡張
- [x] M8 CSS一式+モバイル幅対応
- [x] M9 DevLens: Export JSON
- [x] M10 next build検証済み → 残: ユーザーがgit push (下記手順)

pushコマンド: `cd ~/Claude/Projects/SteamLOOK && git add -A && git commit -m "Mission Control, drawer, modes, explore, share" && git push`

## 状態 (2026-07-05 MVP完成)

- [x] 設計書 (DESIGN.md) 作成
- [x] 1. リポジトリ雛形 (pipeline / web)
- [x] 2. fetch-steamspy.js — SteamSpy all ページ0–9 → SQLite (60秒間隔・レジューム対応)
- [x] 3. fetch-details.js — spy/store 2モード (レート制限・レジューム対応)
- [x] 4. build-universe.js — 正規化 → influence_score → 分類 → 星系/銀河 → 座標 → universe.json
- [x] 5. web雛形 — Canvas + 深宇宙背景 + OrbitControls
- [x] 6. InstancedMesh描画 (恒星emissive / 惑星シェーダー陰影 / 衛星・小惑星)
- [x] 7. ホバー: raycast + FPS照準4本線 + ポップアップ + Steamページ遷移
- [x] 8. 左下Search UI + flyTo
- [x] 9. サンプルデータ(170件)で universe.json 生成済み
- [x] 10. 検証: tsc + next build 成功、universe.json 整合性チェック済み

## 改善フェーズ (2026-07-06 完了) — 詳細は IMPROVEMENTS.md

- [x] relation_score導入 (lib.js) + report:relations コマンド + ?debug=1 オーバーレイ
- [x] 星系メンバーの関連閾値 (0.22/0.16) + フィールド惑星 (低関連の同居排除)
- [x] 銀河: 円環 → Fibonacci球殻+反発緩和のコンパクト3D星団 (半径~1800)
- [x] 星系: タグ角度セクター × 重力ランク半径 (隣接星系が同系統に)
- [x] サイズ: powカーブ (恒星4-18 / 惑星1.1-6.1)、visual/interaction分離
- [x] シェーダー最小表示サイズ (遠距離でも消えない) + 9pxピック半径raycast
- [x] フォーカス状態管理 (ユーザー操作/Esc/Search空欄で解除) + ダブルクリックフォーカス
- [x] 銀河ラベル (距離フェードビルボード) + Search右の円形凡例UI
- [x] universe.json再生成 + next build検証済み

## 成長フェーズ バッチA-C (2026-07-07 完了) — 設計は GROWTH.md

- [x] A: nb近傍グラフ(relation上位6・type付き) / hidden_gem_score / tags.json(市場統計)
- [x] B: Discovery Route(フォーカスで航路5本+ホバー0.6秒で1本) / Constellation(同銀河外周チェーン+星座名スプライト) / Gem呼吸明滅(シェーダー) / Discovery Pulse
- [x] C: Developer Lens(?lens=developer&appid=X、lens.ts純関数) / 凡例に帰属1行
- [ ] D: ユーザー作業 — LIMIT=5000でSteamSpy詳細を再収集しGem母集団を拡大
- [ ] Shareable Moment実装(設計はGROWTH.md §12)
- [ ] Camera Drift / Time Layer / Taste Passport (設計のみ)

## 未完了 / 次のステップ

- [ ] 実データ取得 (要ユーザー実行: README「実データへの差し替え」参照。
      ※Claudeのサンドボックスからは steamspy.com / store.steampowered.com がブロックされるため、
      ユーザーのMac上で npm run fetch:steamspy 等を実行する必要がある)
- [ ] 実データでの見た目調整 (Bloom強度・銀河間距離・色の彩度・密度)
- [ ] ブラウザでの動作確認フィードバック反映

## メモ

- サンドボックスでSQLiteをマウント上で開くと disk I/O error → `ATLAS_DB=$HOME/atlas.db` で回避。
  ユーザーのMac上ではデフォルト (data/atlas.db) で問題ない。
- サンプルデータは pipeline/seed-sample.js (data_source='sample_curated'、数値は概算)。
- 検証は /tmp/webtest で npm install + tsc + next build 済み (ユーザーフォルダは汚していない)。
