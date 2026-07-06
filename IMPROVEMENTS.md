# 改善レポート (2026-07-06)

## 1. 旧ズーム/サイズ/ホバー判定の問題点

天体は物理サイズそのままで描画され、最遠(22,000)では投影半径がサブピクセル化して消滅。ホバー判定は実メッシュへのraycastだったため、小惑星(直径0.35)は事実上クリック不能。視覚サイズ・当たり判定・データサイズが未分離だった。

## 2. 改善後の visualSize / interactionSize 設計

3層に分離した。

- **physicalSize** (`d`): パイプラインが算出する本来の直径。データの真実。
- **visualSize**: シェーダーで担保。頂点シェーダーが毎フレーム投影半径を計算し、下限(恒星2.6px / 惑星・衛星1.4px / 小惑星1.0px)を下回る場合のみ不足分を拡大。下限がタイプ別に異なるため**大小差は消えない**。`Bodies.tsx` の `minSizeChunk` 参照。
- **interactionSize**: カスタムraycast (`makeRaycast`) が `max(実半径×1.3, スクリーン9px相当)` の不可視球で判定。最遠の小惑星にも照準が合う。三角形テストを廃し中心-光線距離だけで判定するため、10,000天体でも1ms未満。

## 3. 検索後フォーカスが固定されていた原因

`CameraRig` が `flyTarget` の存在中は毎フレーム `controls.target` と `camera.position` をlerpし続け、解除条件が「目標到達(0.5未満)」のみだった。飛行中にユーザーがドラッグすると目標に到達できず、**lerpが永久にユーザー入力と綱引きする**。到達後も `controls.target` がその天体に残り続けた。

## 4. フォーカス解除の状態管理

`store.ts` に `focusedId / focusMode('none'|'search'|'doubleClick') / isCameraLocked / lastFocusStartedAt` を導入。

- `flyTo(body, mode)`: フォーカス開始、カメラロック
- OrbitControlsの `start` イベント(=ユーザーのドラッグ/ホイール/パン)で即 `clearFocus()`
- `Esc` キー → `clearFocus()` (page.tsxのグローバルリスナー)
- Search欄を空にする → `clearFocus()`
- 到着時 `arrive()`: ロック解除、照準ハイライトは4秒後に自動フェード

## 5. 銀河配置が円環状になっていた原因

旧実装は `galaxyCenters` を半径3200の円周上に等角配置していた(`i/n * 2π`)。中心の巨大な空洞と過大な銀河間距離はこの設計の直接の帰結。

## 6. 新しい銀河配置方式

3段階の決定的レイアウト (`build-universe.js` セクション8):

1. 各銀河を**ローカル座標**で組み立て、実半径 `galaxyR` を計測
2. 銀河中心を **Fibonacci球** 方向 × **分散させた殻半径**(0.4〜1.0、`(i·0.618+0.15) mod 1`)に初期配置 → 中心空洞なし・立体的。y方向は0.55倍に扁平化して銀河団らしく。その後**実半径ベースの反発緩和150反復**で「近すぎず(重なり回避)遠すぎず(初期半径950)」を両立。最後に重心を原点へ
3. ローカル座標を銀河中心へ平行移動

結果: 宇宙全体の半径は約4,100→**約1,800**。maxDistanceも22,000→5,500に短縮。

## 7. 銀河ラベルの表示条件

`GalaxyLabels.tsx`。CanvasTextureのビルボードスプライト(フォント外部依存なし)。カメラ距離 d が銀河半径 r の **1.5倍でフェードイン開始、2.5倍で完全表示**(opacity最大0.8)。近づくと消えて星が主役に戻る。銀河名+代表タグ最大3個(汎用タグ除外済み、pipelineの `GENERIC_TAGS`)。

## 8. 凡例UIの構成

`Legend.tsx`。Search右横8pxに36×36の円形ボタン("i"、半透明黒)。クリックで右方向へ2カラムパネル(色=主ジャンル9色 / タイプ=Star・Planet・Moon・Asteroidの点サイズ違い+一言)。外側クリック/Esc/再クリックで閉じる。アニメーションは150msのscaleXのみ。

## 9. ダブルクリックフォーカスの実装

`Bodies.tsx` の `onDoubleClick`(R3Fイベント、カスタムraycastの `instanceId` を使用)→ `flyTo(body,'doubleClick')`。Search選択と完全に同じ経路なので挙動も解除条件も同一。シングルクリックには何も割り当てず、Steam遷移はポップアップクリックのみ — 競合なし。

## 10. 星の大小差を強めるサイズ式

旧: `base + 2.2·log(owners) + 1.6·log(reviews) + 1.2·influence`(加算式で差が圧縮される)
新: **influenceのpowカーブ + タイプ別レンジ**

```
star:     4.0 + 14.0 × n^1.6   (4〜18)   n = influence/100
planet:   1.1 +  5.0 × n^1.5   (1.1〜6.1)
moon:     0.45 + 0.9 × n^1.5
asteroid: 0.3 +  0.6 × n
```

指数>1なので上位ほど加速度的に大きくなる(木星と水星)。恒星最大18 vs 小惑星0.3で**60倍差**。小天体の視認性はシェーダー下限が担保するため、物理サイズを遠慮なく小さくできる。

## 11. 現在(旧)のゲーム関連性計算の実態

- 使用していた: タグJaccard(星系編入のみ、閾値0.25)、シリーズ名(タイトル正規化+開発元/タグ検証)、開発元(3本以上でグループ)、ジャンル/タグ(銀河割当)、influence(サイズ・恒星選定・**星系の並び順**)
- 使用していなかった: レビュー傾向、プレイ時間、パブリッシャー(中心性のみ)
- ランダム要素: 軌道位相・ジッター(シード付きで再現可能)
- **致命的だった点**: (a) 星系同士の隣接が「重力ランク順ひまわり螺旋」で決まり類似度と無関係 (b) タグクラスタ星系が「最上位タグ1個の一致」だけで同居させていた

## 12. Hollow Knight と Detroit: Become Human が近かった理由

実測(改善前universe.json): HK=Ori星系(s_387290)の惑星、Detroit=自星系の恒星、両者とも g_action、距離176。**別星系だが、重力ランク螺旋で偶然隣のセルに置かれた** — 上記11(a)が原因。`npm run report:relations 367520 1222140` の実測値:

```
shared_tags: Great Soundtrack, Singleplayer, Atmospheric, Adventure, Story Rich, Multiple Endings
tag_similarity 0.176 / genre_similarity 0.667 (Action, Adventure)
series/dev/pub: false / final_relation_score: 0.180
```

(ユーザー視点の「共通タグゼロ」はポップアップに出る上位タグ同士の比較。top20では6個共通するが、いずれも汎用タグ)

## 13. 改善後の関連性スコア式

`pipeline/lib.js relation()`(フロント近似版は `web/lib/relation.ts`):

```
score = 0.40·tagJaccard + 0.15·genreSim + 0.25·series + 0.12·sameDev
      + 0.05·samePub + 0.02·playtimeSim + 0.01·reviewSim   (上限1.0)
```

influence近接は**意図的に重み0**(人気が近い≠内容が近い)。優先順位は仕様通り: シリーズ>タグ>ジャンル>開発元>パブリッシャー>プレイ時間>レビュー。

## 14. 低関連ゲームが近づきすぎないための対策

- 星系編入は `relation ≥ 0.22`、タグクラスタ残留は `relation(恒星) ≥ 0.16`。満たさないplanetは**フィールド惑星**として銀河中盤に単独散布(偽の星系同居を作らない。小惑星への降格も廃止)
- 星系の銀河内配置を「主要タグの角度セクター × 重力ランク半径」に変更 → **隣接星系は同系統タグ**になった(HK系はMetroidvania/Platformerセクター、Detroit系はStory Richセクターで、改善後の距離249・別セクター)
- 軌道順序はJaccard単独→relation順に変更(関連が濃いほど内側)
- 星系同士は軌道半径ぶんの反発緩和で重なり回避
- 全乱数はappidシードで決定的・再現可能

## 検証手段

- `npm run report:relations <appid|title> <appid|title>` — 任意ペアの内訳
- `http://localhost:3000/?debug=1` — ホバー天体と空間近傍8件の関連スコアを console.table + 右下ミニパネルに表示(同一星系は青字)
