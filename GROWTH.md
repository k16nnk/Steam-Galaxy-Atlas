# Steam Galaxy Atlas — 成長フェーズ設計書 (2026-07-07)

合言葉: UIを増やすな。体験を増やせ。分析画面にするな。宇宙探索にしろ。

---

## 1. 現在のプロジェクト構造 (Phase 1: 把握結果)

**データ層** (`pipeline/`, Node標準のみ・依存ゼロ)
- 取得元: SteamSpy `all`(上位~10,000件・ブラウザ経由収集)、SteamSpy appdetails(タグ/ジャンル、上位2,000件・ブラウザ→`/api/ingest`経由)、Steam Store appdetails(発売日/種別、Nodeから直接)。SteamSpyはCloudflare保護のためブラウザ収集フロー(`tools/collect-*.js`)を併設
- キャッシュ: SQLite `data/atlas.db`(全生データ+取得日時+ソース保存、全処理レジューム可能)
- `build-universe.js`: 正規化 → influence_score → 分類(star/planet/moon/asteroid) → 星系(シリーズ→開発元→relation編入→タグクラスタ、閾値0.22/0.16、外れはフィールド惑星) → 銀河(12個・タグルール) → 座標(銀河ローカル配置→Fibonacci球殻+反発緩和→平行移動、全乱数はsplitmix32×2+mulberry32で決定的) → `web/public/universe.json`(2.5MB、gzip後~800KB)
- **relation_score は実装済み** (`pipeline/lib.js relation()`): 0.40タグJaccard + 0.15ジャンル + 0.25シリーズ + 0.12開発元 + 0.05パブリッシャー + 0.02プレイ時間 + 0.01レビュー傾向。influence近接は意図的に重み0

**表示層** (`web/`, Next.js 14 + R3F + zustand)
- InstancedMesh×3(恒星/惑星系/小惑星)+ カスタムシェーダー(恒星自発光、惑星は焼き込んだ光方向のLambert+rim、スクリーンスペース最小表示サイズ)
- カスタムraycast(最小9pxピック半径)、FPS照準4本線+ポップアップ(DOM、rAF直接操作)、Search(事前構築インデックス)、銀河ラベル(CanvasTextureスプライト・距離フェード)、凡例ボタン、`?debug=1`関連スコアオーバーレイ、フォーカス状態管理(操作/Esc/空欄で解除)、アイドル自動回転
- デプロイ: Vercel(root=web)、静的配信のみ。`/api/ingest`は開発専用ガード済み

**性能余地**: 描画は10k instancedで余裕。ボトルネック候補は将来のライン描画とJSON肥大のみ。

## 2. 現在の強み

美的完成度(暗い・静か・ミニマル)/ 決定的で説明可能な配置(relation_scoreの内訳を任意ペアで出せる)/ 依存ゼロの頑健なパイプライン / 法的に慎重な設計(推定表記・非提携)/ 性能余裕。

## 3. 現在の商業的弱点

1. **一度見たら終わり**: 再訪する理由(発見ループ・変化・目的)がない
2. **発見の導線がない**: 好きなゲームに飛べるが、そこから「次」へ進む手段がない
3. **共有装置がない**: SNSに貼れる成果物が生成できない
4. **開発者価値が露出していない**: relation_score等の資産が`?debug=1`にしか出ていない
5. **タグ充実が上位2,000件のみ**: 残り8,000件は小惑星扱いで類似度計算の対象外(Hidden Gem発掘の母集団が痩せている)
6. データ鮮度が手動更新依存

## 4. 一般ユーザー向けに足りない楽しさ

「次はこれを見ろ」という宇宙自身の誘い(航路)/ 発見の報酬感(Hidden Gemの瞬き、Discovery Pulse)/ 意味のまとまりの可視化(星座)/ 帰ってくる理由(今日の探索テーマ、時代レイヤー)。

## 5. 開発者・パブリッシャー向けに足りない価値

「自分のゲームはどこか・隣は誰か・勝てる隙間はどこか」への即答。データは既にあるが、レポートとして出力する面がない。

## 6. 追加すべき体験機能(優先順)

Discovery Route → Constellation → Hidden Gem Discovery → Developer Lens → Shareable Moment → (将来) Time Layer / Taste Passport。全て一時表示・宇宙内表現で、常時UIは一切増やさない。

## 7. 追加すべきデータ指標(パイプラインで事前計算)

```
hidden_gem_score (0-100) =
  40·wilson正規化(≥0.80のみ) + 20·レビュー数の中庸度(50〜3,000にピーク)
+ 15·(1 − nlog(owners, 500k上限クリップ)) + 15·有名近傍ボーナス(inf≥70の隣人とrelation≥0.25)
+ 10·recent_activity(average_2weeks)
※インディー銀河の高評価小規模タイトルが最高得点になるよう設計

cultural_impact_score =
  0.30·nlog(review_count) + 0.20·長寿性(発売年数×継続CCU) + 0.20·タグ中心性
+ 0.15·シリーズ影響(シリーズ内被参照) + 0.15·類似ネットワーク次数中心性(nb逆リンク数)

market_position_score = 主タグ内/ジャンル内/価格帯内/発売年内のinfluenceパーセンタイル(4値の辞書)

opportunity_score (タグ単位) =
  需要プロキシ(タグ内総推定所有者) 対 供給(タグ内タイトル数) の比を正規化
+ タグ内平均評価が低い(=不満市場)ボーナス + Hidden Gem率ボーナス
→ tags.json として別出力(Developer Lensの「空白領域」に使用)

similarity_score = 既存relation()をそのまま採用(influence近接は今後も除外)
```

## 8. Discovery Route 設計 (Phase 2)

**データ**: パイプラインで各enriched天体のrelation上位K=6(score≥0.28)を事前計算し、`nb: [[appid, score100, type], ...]` としてuniverse.jsonに格納。typeは内訳の最大成分: `s`(series)/`d`(dev)/`p`(pub)/`t`(tags)/`g`(hidden gem =相手のhg≥60)。JSON増加 ~+250KB(許容)。

**表示**: フォーカス(検索/ダブルクリック)到着時に発動。フォーカス天体→nb上位5本を加算合成の細線(THREE.LineSegments、1本のバッファを使い回し)で描画。透明度=score(0.12〜0.35)、シリーズ/開発元航路はわずかに暖色。0.4秒かけてフェードイン、フォーカス解除 or 12秒で フェードアウト。**航路先の天体をダブルクリックすると旅が続く**(Hollow Knight→Ori→…)。ラベルは出さない(ホバーポップアップが既に役割を果たす)。ホバー時(600ms滞在)は最上位1本だけを極薄表示。

## 9. Constellation 設計 (Phase 3)

フォーカス到着時、nbを種に同銀河内の関連群(最大8ノード)を選び、フォーカス天体を中心とした放射+外周を繋ぐ星座線(Routeより更に薄い一筆書き、opacity 0.08)を描画。**星座名**=共有タグの最頻値+"Constellation"(例: Metroidvania Constellation)を、フォーカス天体の下方にCanvasSpriteで極小表示(銀河ラベルと同系の控えめさ、8秒でフェード)。Routeと同一バッファ機構を共有し、常時は何も描画しない。relation<0.28のノードは無理に結ばない(3ノード未満なら星座自体を出さない)。

## 10. Hidden Gem Discovery 設計 (Phase 4)

- パイプラインで `hg` (0-100) を全enriched天体に付与
- **Ambient Discovery**: hg≥70の天体はシェーダーに per-instance `aGem` 属性を渡し、uniform時間で**ゆっくり(周期6〜9秒、位相はappidシード)0.85〜1.15倍のごく淡い明滅**。点滅ではなく呼吸。遠距離では無効(ノイズ化を防ぐ)
- **文脈発見**: フォーカス中、nbのうちhg≥60の相手への航路をわずかに明るくし、線の終端に小さな瞬きを1回(Discovery Pulse: 半径数px、0.6秒、1回のみ)
- ポップアップに極小チップ「Hidden Gem」(10px・淡グレー枠・非広告的)を追加。それ以外の文言なし

## 11. Developer Lens 設計 (Phase 5)

`?lens=developer&appid=367520` で有効化(通常UIから到達不可)。クライアント側でuniverse.json+tags.jsonから計算し、右側に等幅フォントの半透明パネル(debug-panelの拡張、閉じるボタン付き)で表示:

```
target_game / nearest_competitors(relation上位10: score・共有タグ・owners帯・価格・評価)
similar_hidden_gems(hg≥60近傍) / tag_similarity_breakdown / genre_similarity_breakdown
price_position・review_position・owner_position(主タグ内パーセンタイル)
opportunity_notes(対象の上位タグのopportunity_score上位3領域)
```

将来の有料化: 同じ計算をpipeline側で `report-<appid>.json` / PDF化するコマンド(`npm run report:market -- <appid>`)に昇格できるよう、計算ロジックは `web/lib/lens.ts` に純関数として分離。

## 12. Shareable Moment 設計 (Phase 6・設計のみ)

- 手段: `gl.domElement.toDataURL()`(preserveDrawingBuffer不要 — キャプチャ直前に1フレーム明示レンダー)→ オフスクリーンcanvasで1200×630に合成: 上=宇宙のスクリーンショット(UI非表示で撮る)、下辺に小さく「タイトル / 中心ゲーム名+2〜3個 / URL / "Unofficial fan project"」
- **Steamのゲーム画像(header.jpg等)は共有画像に含めない**(権利リスク回避。自前レンダリングの宇宙のみ=当プロジェクトの著作物)
- 起動: フォーカス中に `S` キー or ポップアップ長押し等の隠し導線(常時ボタンは置かない)。Web Share API+ダウンロードフォールバック
- 種類: My Constellation / Games Like X / Hidden Gems I Found(発見履歴はlocalStorageのみ、サーバー保存なし)

## 13. UIを増やさず体験を増やす方針

追加されるのは「光」だけ: 航路線・星座線・瞬き・呼吸する明滅。すべて (a)一時的、(b)宇宙空間内、(c)フォーカスという既存動作がトリガー、(d)解除は既存のフォーカス解除に相乗り。常時UIはSearch+凡例ボタンのまま不変。開発者機能はURLパラメータの向こう側。

## 14. 実装優先順位

1. **P2+P3+P4を1バッチで**(全てnb事前計算とライン描画基盤を共有): pipeline拡張(nb/hg/mps) → Route → Constellation → Gem明滅/Pulse
2. データ母集団の強化: ブラウザ収集を `LIMIT=5000` で再実行してもらう(Hidden Gem母集団を2.5倍に)
3. P5 Developer Lens(クライアント計算+lens.ts分離)
4. Camera Drift(アイドル回転に微小な上下浮遊を追加、酔わない振幅)
5. P6 Share(設計済み→実装)
6. Time Layer / Taste Passport は設計のみ保持(relは全身に格納済み、`ty`と併せいつでも実装可)

## 15. パフォーマンス上の注意

- nb計算はO(enriched²)=2000²=400万relation→数秒(タグ前フィルタで更に短縮)。5000件時は2,500万→バケット化(主タグ一致のみ比較)で抑制
- ライン描画は**単一のLineSegmentsバッファ(最大64セグメント)を使い回し**、フォーカス毎にsetAttribute更新のみ。ジオメトリ再生成しない
- Gem明滅はuniform time+頂点属性で完結(CPU毎フレーム書き込みゼロ)
- universe.json肥大監視: nb+hg+mpsで+~0.4MB。1MB超の増加が必要になったら neighbors を別ファイル遅延ロードに分離
- Vercel帯域: 2.5→2.9MB(gzip ~900KB)。バズった場合(10万PV/月≒90GB)はHobby枠100GBに接近 → Cache-Control長期化+immutableファイル名化で対応余地

## 16. 商業化に向けた技術的リスク

- **SteamSpy依存**: Cloudflare化で自動更新が脆弱(現状ブラウザ収集)。商用化時は Gamalytic 等の商用API併用、または自前推定への移行を検討。データソース差し替えが効くようGameNodeスキーマは既にソース非依存
- **推定値の精度**: 開発者向けレポートで「推定」表記を貫かないと信頼リスク(表現ガイドは維持)
- **画像・商標**: 共有画像にSteamアセットを含めない設計で回避済み。サイト名の"Steam"は非提携明記を継続(凡例パネルに1行追加予定)
- **帯域/コスト**: 上記15参照。有料化するならVercel Pro($20/月)で解消
- **Taste Passport**: Steam OpenID+GetOwnedGamesは公開プロフィール限定・要APIキー・サーバー側実装が必要 → 実装時にプライバシーポリシー新設が必須

## 17. 次に実装すべきMVP改善(このまま着手可能)

**バッチA(パイプライン)**: relation上位6の`nb` / `hg` / market_position / tags.json 出力
**バッチB(フロント)**: Route+Constellation+星座名スプライト+Gem呼吸明滅+Discovery Pulse+ポップアップのGemチップ
**バッチC**: Developer Lens(`?lens=developer&appid=`)+凡例パネルに帰属1行(Data: SteamSpy · Unofficial)
**バッチD(ユーザー作業)**: `LIMIT=5000`でSteamSpy詳細を追加収集→再ビルド→push

検証: 実データでnb品質チェック(Hollow Knightのnbが Metroidvania系になるか)、60fps維持、universe.jsonサイズ、next build。
