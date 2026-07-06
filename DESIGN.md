# Steam Galaxy Atlas — 設計書 (MVP)

Steamのゲームを天体として描く「眺める宇宙」。UIは左下Searchのみ。分析ダッシュボードではなく作品として作る。

---

## 1. 全体アーキテクチャ

```
[データパイプライン (オフライン / Node.js + TypeScript)]
  SteamSpy API ──┐
  Steam appdetails ─┼→ SQLite (生データ+取得日時+ソース)
  (IStoreService)──┘        │
                            ▼
              正規化 → influence_score → 分類 → クラスタリング → 座標生成
                            │
                            ▼
                 public/universe.json (フロント用軽量静的データ)

[フロントエンド (Next.js + React Three Fiber)]
  universe.json を起動時ロード → InstancedMeshで描画
  Search / ホバー照準 / ポップアップはすべてクライアント側で完結
```

方針:
- MVPは**ランタイムサーバー不要**。パイプラインをローカルで回し、静的JSONを吐く。APIキーはパイプライン側の`.env`のみ(フロント露出ゼロ)。
- 静的JSONで足りなくなる規模(10万件級)になったら、同じスキーマのままFastAPI/NestJS + PostgreSQL + タイル配信に置換できる構造にする。
- 言語はTypeScriptに統一(pipeline / frontend 共通の型定義 `shared/types.ts`)。

ディレクトリ:
```
steam-galaxy-atlas/
├─ pipeline/          # データ取得・計算 (tsx で実行)
│  ├─ fetch-steamspy.ts
│  ├─ fetch-appdetails.ts
│  ├─ build-universe.ts   # score→分類→cluster→座標→JSON
│  └─ db.ts               # SQLite (better-sqlite3)
├─ shared/types.ts
├─ web/               # Next.js + R3F
│  ├─ app/page.tsx
│  ├─ components/{Universe,Bodies,Reticle,Popup,Search}.tsx
│  ├─ lib/store.ts    # Zustand
│  └─ public/universe.json
├─ data/atlas.db      # SQLiteキャッシュ
├─ DESIGN.md / PROGRESS.md
```

## 2. データ取得設計

MVPの対象: **SteamSpy `all` ページ 0〜9 = 所有者数上位 約10,000タイトル**。

| ソース | 用途 | レート制限対応 |
|---|---|---|
| SteamSpy `/api.php?request=all&page=N` | 上位リスト・推定所有者・CCU・タグ・ジャンル・開発元・価格・レビュー数・プレイ時間 | 1リクエスト/60秒(allは特別枠)。10ページ≒10分 |
| SteamSpy `/api.php?request=appdetails&appid=` | タグ詳細の補完(必要分のみ) | 1req/秒、キュー処理 |
| Steam Store `appdetails` | 発売日・type(game/dlc/demo/music)・正式開発元/パブリッシャー | 非公式上限 ~200req/5分 → **1.6秒間隔**。上位から順に取得、**再開可能**(SQLiteに取得済みフラグ) |
| `IStoreService/GetAppList` (要APIキー) | 全AppID一覧。公式非推奨のGetAppList v2ではなくこちらを使う | **第2段階**。MVPはSteamSpy allで足りるためAPIキー不要 |
| 画像 | `https://cdn.akamai.steamstatic.com/steam/apps/{appid}/header.jpg` はAppIDから直接構成可能 → **API取得不要** | — |

共通実装(pipeline/db.ts + fetchQueue):
- 全レスポンスをSQLiteに生JSONで保存し、`fetched_at`・`data_source` を必ず記録
- 指数バックオフ再試行(429/5xx時、最大5回)
- 差分更新: `fetched_at` が7日以内ならスキップ
- 欠損値: 数値は`null`のまま保持し、計算時に中央値補完 or 該当項目の重みを再配分
- 中断安全: どこで止めても再実行すれば未取得分だけ続きから進む(**"continue"再開の要**)

## 3. DBスキーマ (SQLite)

```sql
CREATE TABLE raw_steamspy (
  appid INTEGER PRIMARY KEY, page INTEGER, json TEXT,
  fetched_at TEXT, data_source TEXT DEFAULT 'steamspy_all');

CREATE TABLE raw_appdetails (
  appid INTEGER PRIMARY KEY, json TEXT, success INTEGER,
  fetched_at TEXT, data_source TEXT DEFAULT 'steam_store_appdetails');

CREATE TABLE games (           -- 正規化済み GameNode
  appid INTEGER PRIMARY KEY, title TEXT, type TEXT,            -- star/planet/moon/asteroid
  genre TEXT, tags TEXT,       -- tags: JSON {tag: votes}
  series_name TEXT, developer TEXT, publisher TEXT, release_date TEXT,
  review_positive INTEGER, review_negative INTEGER,
  review_score REAL, review_count INTEGER,
  estimated_owners_min INTEGER, estimated_owners_max INTEGER, estimated_owners_mid INTEGER,
  ccu INTEGER, average_playtime INTEGER, median_playtime INTEGER,
  price REAL, is_free INTEGER,
  capsule_image TEXT, header_image TEXT, steam_url TEXT,
  influence_score REAL, diameter REAL, gravity REAL, luminosity REAL, color TEXT,
  galaxy_id TEXT, system_id TEXT, orbit_parent_id INTEGER,
  position_x REAL, position_y REAL, position_z REAL,
  data_source TEXT, fetched_at TEXT);

CREATE TABLE systems (
  system_id TEXT PRIMARY KEY, name TEXT, center_appid INTEGER,
  system_type TEXT,            -- series/developer/publisher/tag_cluster
  main_genre TEXT, representative_tags TEXT, members TEXT);  -- members: JSON[appid]

CREATE TABLE galaxies (
  galaxy_id TEXT PRIMARY KEY, name TEXT, theme TEXT,
  main_genres TEXT, systems TEXT);
```

所有者数はSteamSpyの`owners`文字列("1,000,000 .. 2,000,000")をmin/max/midにパースする。**あくまで推定値**としてフィールド名・UI表記とも「推定」を保つ。

## 4. influence_score (0–100)

外れ値対策: 量的指標はすべて `nlog(x) = clamp(log10(x+1) / log10(P99+1), 0, 1)`(P99=データセット99パーセンタイル)で正規化。

```
好評率は Wilson score 下限(レビュー数が少ないタイトルの過大評価を防ぐ):
wilson = wilsonLowerBound(review_positive, review_count, z=1.96)

influence_score = 100 * (
    0.25 * nlog(estimated_owners_mid)
  + 0.20 * nlog(review_count)
  + 0.15 * nlog(ccu)
  + 0.15 * wilson
  + 0.10 * nlog(average_playtime)
  + 0.10 * tag_centrality          -- 自分のタグ集合が全体タグ頻度分布とどれだけ「中心的」か
  + 0.05 * group_centrality )      -- シリーズ/開発元グループ内での相対順位(1位=1.0)
```

- `tag_centrality` = Σ(タグの全体出現頻度ランク重み)/タグ数 を0–1正規化
- 発売からの経過年数: `nlog(owners)`が長期蓄積を既に反映するため、MVPでは独立項にしない(第2段階で「時代モード」用に保持)
- 欠損項はその重みを他項に比例再配分

## 5. 天体パラメータ算出式

```
diameter   = base(type) + 2.2*nlog(owners_mid) + 1.6*nlog(review_count) + 1.2*(influence/100)
             base: star=3.0 / planet=1.2 / moon=0.5 / asteroid=0.35
             clamp: star[3..9] planet[1.2..4] moon[0.5..1.2] asteroid[0.35..0.9]

gravity    = 0.50*(influence/100) + 0.20*series_centrality
           + 0.15*genre_centrality + 0.15*dev_pub_centrality      -- 0..1
             → 星系中心(恒星)の選定と、惑星をどの恒星に引き寄せるかの重み

luminosity = 0.45*wilson + 0.25*nlog(ccu) + 0.20*(influence/100) + 0.10*recent_activity
             recent_activity = nlog(median_playtime_2weeks) ※SteamSpyのaverage_2weeksで代用
             → 恒星: emissiveIntensity = 0.6 + 1.4*luminosity
             → 惑星: albedo(反射率)を 0.7 + 0.3*luminosity で微調整

color      = 主ジャンル(なければ最多得票タグ)→ HSL。彩度45–55%・明度55–65%に抑える。
  Action 8° / Horror 355°(暗め L=40%) / Sports 50° / Strategy 130° /
  Simulation 190° / Adventure 215° / Puzzle 210°(S=15% 白寄り) /
  RPG 275° / Indie パステル(タグhashでhue、S=35% L=70%) / Early Access: 輪郭に微小な明滅フラグ
```

## 6. 恒星・惑星・衛星・小惑星の分類ルール(判定順)

1. **moon**: appdetailsの`type`が dlc/music/demo、またはタイトルが `/(DLC|Soundtrack|OST|Demo|Expansion Pass)/i` に一致し親タイトルへ紐付く → `orbit_parent_id` = 親appid
2. **asteroid**: `review_count < 30` または タグ数 < 3 または `owners_mid < 20,000` または typeがゲーム以外で親不明
3. **star**: 星系クラスタリング(§7)後、各クラスタ内で `gravity` 最大の1本。さらに `influence >= 70` の孤立タイトルは単独星系の恒星に昇格
4. **planet**: 残り全部

## 7. 星系・銀河クラスタリング

**星系(強い関係性優先、優先順に結合)**
1. シリーズキー: タイトル正規化(末尾の数字・ローマ数字・「: 副題」・®™を除去、小文字化)が一致 かつ (開発元/パブリッシャー一致 または タグJaccard≥0.4) → 同一星系
2. 同一開発元で3本以上 → 開発元星系
3. 未所属planetは、同銀河内の恒星と `score = gravity × tagJaccard` を計算し、Jaccard≥0.25の最良恒星へ編入
4. どこにも入らないplanetはasteroidに降格 or influence≥70なら単独星系
5. 星系サイズ上限40。溢れたら次点gravityのメンバーを恒星として分割

タグ類似度: 上位20タグ集合のJaccard(MVP)。第2段階でタグ投票数のTF-IDF+cosine。

**銀河(大きな文化圏、固定12個+fallback)**

タグ・ジャンルを優先順ルールで判定(最初に一致した銀河へ。星系は中心恒星の銀河に全員従う):

```
Multiplayer Competitive ← tags: PvP/Competitive/MOBA/esports (かつCCU高)
Horror ← Horror/Survival Horror     Sandbox Survival ← Survival/Crafting/Open World Survival
Roguelike ← Roguelike/Roguelite     Visual Novel ← Visual Novel/Dating Sim
Cozy ← Cozy/Farming Sim/Life Sim    Strategy ← Strategy/4X/Tower Defense/Grand Strategy
Simulation ← Simulation/Management  RPG ← RPG/JRPG/CRPG/Action RPG
Action ← Action/Shooter/FPS/Platformer   Sports & Racing ← Sports/Racing
Indie ← fallback(上記に該当しない)
```

## 8. 座標生成ロジック

すべて**シード付き乱数**(`mulberry32(appid)`)で決定的に生成。ビルドごとに宇宙が変わらない。

- **銀河**: 半径4000の大円上に黄金角で配置+半径±15%ジッター。各銀河は扁平楕円ディスク(rx=900, ry=250, rz=900)
- **星系**: 銀河内でひまわり配置 `r = 60*sqrt(i)`(黄金角)+ノイズ。**gravityの高い恒星ほど中心寄り**(iをgravity降順で割当)
- **惑星**: 恒星中心の軌道配置。`r_k = star.diameter*2 + 8 + 6*rank + jitter`(rank=タグ類似度降順)。軌道面を星系ごとに±25°傾け、位相はシード乱数 → 「周回しているように見える」静的配置
- **衛星**: 親天体から `parent.diameter*1.8 + 2` の位置
- **小惑星**: 所属銀河ディスクの外縁アニュラス(r 0.75–1.1)に散布。密度ノイズで濃淡を作り均等すぎを回避
- 銀河間距離 ≫ 銀河径(4000 vs 900)で明確に分離

## 9. フロントエンド構成

```
Next.js 14 (App Router) + TypeScript + R3F + drei + Zustand + Tailwind
```

- `<Canvas>` フルスクリーン、背景 #030308、`<Stars>`(drei)を極薄で遠景に
- 描画は type別 **InstancedMesh 3本**(stars / planets / moons+asteroids)。インスタンス属性: `aColor, aLightDir, aLuminosity, aScale`
- カメラ: `OrbitControls`(damping有効)+ 検索選択時は `camera.position/target` をイージングで補間するflyTo
- ホバー: R3Fの `onPointerMove` + instanced raycast(球バウンディング)。10,000個ならBVH不要、重ければ `three-mesh-bvh` 追加
- 状態(Zustand): `hoveredId / selectedId / cameraTarget / searchQuery`。表示モードは `mode: 'popularity'` をstoreに持ち将来のモード追加に備える(UIは出さない)
- 初期表示: influence上位に絞る… は10,000件なら全件描画で問題なし(InstancedMeshなら余裕)。LOD・タイル化は第2段階
- ポストプロセス: `@react-three/postprocessing` の Bloom を `luminanceThreshold: 0.9, intensity: 0.35` で控えめに(恒星のみ発光が閾値を超える設計)

## 10. Search UI(左下・唯一の常時UI)

```
位置: fixed; left: 16px; bottom: 16px
入力欄: width 200px / height 36px / placeholder "Search"
  background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.15);
  border-radius: 6px; color: rgba(255,255,255,.85); backdrop-filter: blur(6px);
  focus時: border-color rgba(255,255,255,.35) のみ変化
候補: 入力欄の真上に最大6件。各行「タイトル (年)」のみ、高さ28px、
  同じ半透明黒、hover行だけ background rgba(255,255,255,.08)
検索: クライアント側。title小文字部分一致 → influence降順(10,000件で十分高速)
選択: flyTo(天体位置) + 照準を1.2秒表示 → 自動フェード。入力欄はblurして候補を閉じる
```

## 11. ホバー照準(FPSロックオン風・円形アウトライン禁止)

- 3D座標を `vector.project(camera)` でスクリーン座標へ変換し、Canvasの上のDOMレイヤー(`pointer-events: none` のSVG)に描く
- 天体の投影半径 `rPx = (diameter/2) / dist * (viewportHeight/2) / tan(fov/2)` を計算し、**ギャップ = rPx + 6px** の位置に上下左右4本の線(長さ10px、太さ1.5px)
- 色: `rgba(210,235,255,.9)`、glowは `drop-shadow 0 0 3px` 程度
- 出現: 4本が外側12px→定位置へ 120ms ease-out で収束。解除: 80msフェードアウト
- 毎フレーム `useFrame` で位置更新(カメラ移動に追従)

## 12. ホバーポップアップ

- 内容: header画像(160×75px)/ タイトル(最大2行)/ 発売日 / 開発元 / 評価(「非常に好評 (94%)」形式。Steam準拠の段階名を好評率+レビュー数から算出)
- DOM絶対配置。天体スクリーン座標の右上 12px オフセット、画面端では左/下に反転補正
- スタイル: 幅180px、rgba(0,0,0,.55)、blur(8px)、border 1px rgba(255,255,255,.12)、radius 6px、文字 12px rgba(255,255,255,.85)
- **ホバー維持**: `hoveredId` は「天体上 or ポップアップ上」のどちらかでtrue。離脱後 250ms のgrace timerで消す(天体→ポップアップ移動中に消えない)
- クリック: ポップアップ全体が `<a href={steam_url} target="_blank" rel="noopener noreferrer">`、`cursor: pointer`。天体自体のクリックは何もしない(誤遷移防止、MVP)
- ポップアップ表示中のみ `pointer-events: auto`

## 13. 惑星の疑似ライティング(シェーダー方針)

10,000個をリアルライト(星系ごとのPointLight)で照らすのは不可能なので、**インスタンス属性で光方向を焼き込む**:

- パイプラインで各惑星/衛星に `lightDir = normalize(starPos - bodyPos)` を計算済み → `aLightDir` 属性
- 惑星用 `ShaderMaterial`(Lambert+リム):

```glsl
float diff = max(dot(normal, aLightDir), 0.0);
float rim  = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0) * 0.15;
vec3 col = aColor * (0.07 + 0.93 * diff * albedo) + aColor * rim;
// 0.07 = 暗い側も完全な黒にしない環境光
```

- 頂点ノイズ or 3D value noiseで彩度・明度を±5%揺らし単調さを回避(テクスチャ不使用、ソリッド感を維持)
- 恒星: emissive一色+中心→縁の微グラデ(fresnelで縁をわずかに減光)+Bloom閾値超え
- 小惑星: IcosahedronGeometry(detail=0)を頂点ランダム変形した低ポリ、同シェーダーで暗め(albedo 0.5)
- 結果: 星系ごとに光の向きが異なり「所属恒星に照らされている」説得力が出る。真のシャドウマップは使わない

## 14. MVP実装手順(= PROGRESS.md のチェックリスト)

1. リポジトリ雛形(pipeline / shared / web、pnpm workspace)
2. `fetch-steamspy.ts`: allページ0–9取得 → SQLite(再開可能)
3. `fetch-appdetails.ts`: 上位から発売日/type取得(1.6秒間隔・再開可能。まず上位2,000件で先に進み、残りはバックグラウンド継続)
4. `build-universe.ts`: 正規化 → score → 分類 → 星系/銀河 → 座標 → `universe.json` 出力
5. web雛形: Canvas + 星背景 + OrbitControls
6. InstancedMesh描画(恒星/惑星/衛星・小惑星)+ シェーダー
7. ホバー raycast + 照準 + ポップアップ + Steam遷移
8. Search UI + flyTo
9. Bloom調整・色調整・密度調整(見た目の仕上げ)
10. 検証: 実データでFPS計測、ホバー精度、画面端ポップアップ、検索動作

**中断・再開**: 各ステップ完了時にPROGRESS.mdへチェックを入れる。トークン切れ後は「continue」だけでPROGRESS.mdを読んで続きから再開する。パイプラインもSQLite状態から自動レジューム。

## 15. 主要コード(抜粋)

### SteamSpy取得(レート制限・再開可能)
```ts
// pipeline/fetch-steamspy.ts
for (let page = 0; page < 10; page++) {
  if (db.pageFetchedWithin(page, 7 /*days*/)) continue;      // 差分更新
  const res = await retry(() => fetch(
    `https://steamspy.com/api.php?request=all&page=${page}`), 5);
  const apps = await res.json();
  db.upsertRawSteamspy(page, apps, new Date().toISOString());
  if (page < 9) await sleep(61_000);                          // allは60秒/req
}
```

### influence_score
```ts
const p99 = (xs: number[]) => quantile(xs.filter(Number.isFinite), 0.99);
const nlog = (x: number, max: number) =>
  Math.min(1, Math.log10((x ?? 0) + 1) / Math.log10(max + 1));

g.influence_score = 100 * redistributeMissing({
  owners:   [0.25, nlog(g.owners_mid, P99.owners)],
  reviews:  [0.20, nlog(g.review_count, P99.reviews)],
  ccu:      [0.15, nlog(g.ccu, P99.ccu)],
  score:    [0.15, wilson(g.review_positive, g.review_count)],
  playtime: [0.10, nlog(g.average_playtime, P99.playtime)],
  tagC:     [0.10, g.tag_centrality],
  groupC:   [0.05, g.group_centrality],
});
```

### 惑星InstancedMesh + 照準座標変換
```tsx
// 描画: geometryは球1個、行列+属性10,000件
<instancedMesh ref={ref} args={[undefined, undefined, planets.length]}
  onPointerMove={e => setHover(planets[e.instanceId!].appid)}
  onPointerOut={() => scheduleUnhover(250)}>
  <sphereGeometry args={[1, 24, 24]}>
    <instancedBufferAttribute attach="attributes-aColor" args={[colors, 3]} />
    <instancedBufferAttribute attach="attributes-aLightDir" args={[lightDirs, 3]} />
  </sphereGeometry>
  <shaderMaterial vertexShader={vs} fragmentShader={fs} />
</instancedMesh>

// 照準(毎フレーム)
const v = new THREE.Vector3(...body.position).project(camera);
const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
const rPx = (body.diameter / 2 / v.distanceToCamera) * (innerHeight / 2) / Math.tan(fovRad / 2);
// → SVGの4本線を (x, y ± (rPx+6+10)), (x ± (rPx+6+10), y) に配置
```

### universe.json(フロント用軽量形)
```jsonc
{ "generated_at": "...", "galaxies": [...], "systems": [...],
  "bodies": [{ "id": 620, "t": "Portal 2", "ty": "star", "p": [x,y,z],
    "d": 5.2, "lum": 0.93, "c": "#8f6fd8", "sys": "s_portal", "gal": "g_action",
    "rel": "2011-04-18", "dev": "Valve", "rv": [372011, 96],   // [count, positive%]
    "img": "https://cdn.akamai.steamstatic.com/steam/apps/620/header.jpg" }] }
```
(キー短縮で10,000件≒2–3MB、gzipで<1MB)

## 16. 将来的な拡張案

- IStoreService/GetAppListで全AppIDへ拡大 → PostgreSQL + タイル/オクツリー配信 + LOD(遠距離は銀河を点群集約)
- 表示モード切替(人気/ジャンル/シリーズ/時代/評価/推定市場規模)— storeに`mode`は既設
- タグTF-IDF+cosineによる高精度星系、UMAPでタグ空間を3D座標に写像した「意味的宇宙」
- 軌道アニメーション(惑星の超低速公転)、CCUリアルタイム脈動
- Steamログイン連携で「自分のライブラリだけ光る」モード
- 時間軸スライダー(発売年で宇宙が膨張していく演出)

## 17. 想定される問題と対策

| 問題 | 対策 |
|---|---|
| SteamSpyダウン/仕様変更 | 生JSONをSQLiteに永続化、最終取得分で常にビルド可能 |
| appdetails 429 | 1.6秒間隔+指数バックオフ+レジューム。取れない間は発売日欠損のまま出す(ポップアップは項目を非表示) |
| CORS(ブラウザから直接API不可) | 全取得はパイプライン側。フロントは静的JSONと画像CDNのみ |
| 所有者数を「売上」と誤認 | フィールド名・表記を全て「推定」。MVPのポップアップにはそもそも出さない |
| 名寄せ誤り(タイトル類似の別作品) | AppIDベース管理。シリーズ判定は開発元/タグ一致を必須条件に |
| 恒星が眩しすぎ/Bloom汚染 | luminanceThresholdを高く、emissiveをclamp、巨大恒星はintensity逓減 |
| ホバー判定が小天体で困難 | raycastヒット半径を描画半径の1.3倍に、近傍最優先 |
| 10,000件のraycast負荷 | 球体近似+距離カリング。不足時three-mesh-bvh |
| 密集でポップアップがチラつく | 250ms grace timer+最前面(カメラ最近傍)天体を優先 |
| データ鮮度 | `generated_at`をJSONに保持、パイプライン再実行は7日差分更新 |
