# Steam Galaxy Atlas — 進捗

「continue」と入力されたら、このファイルを読んで未完了の先頭タスクから再開すること。
設計の詳細は DESIGN.md、起動方法は README.md を参照。

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
