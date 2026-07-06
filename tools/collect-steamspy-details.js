// SteamSpyのタグ/ジャンル詳細 (上位2,000件) をブラウザ経由で取得し、
// 起動中の開発サーバー (npm run dev / localhost:3000) へ自動保存するスニペット。
//
// 前提:
//   - 別ターミナルで npm run dev が起動していること
//   - data/raw/ に steamspy_page_*.json が取り込み済みであること
// 使い方:
//   1. Chromeで https://steamspy.com のタブを開く (Cloudflare認証を通過した状態)
//   2. DevTools (Cmd+Option+J) のコンソールに (async () => { ... })(); を丸ごと貼り付けてEnter
//   3. 約35分。**タブを前面に表示したままにする** (バックグラウンドだとChromeがタイマーを
//      間引いて極端に遅くなる。別ウィンドウにして脇に置いておくのがおすすめ)
//   4. DONEが出たら: npm run import:raw → npm run build:universe
//   ※途中で止めても再実行すれば続きから (取得済みはスキップされる)

(async () => {
  const API = 'http://localhost:3000/api/ingest';
  let info;
  try {
    info = await (await fetch(API)).json();
  } catch (e) {
    console.error('localhost:3000 に接続できません。npm run dev を起動してください。', e);
    return;
  }
  const { todo, total, have } = info;
  console.log(`対象 ${total} 件 / 取得済み ${have} 件 / 残り ${todo.length} 件 (約${Math.ceil(todo.length / 55)}分)`);
  let n = 0, fail = 0;
  for (const appid of todo) {
    try {
      const r = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appid}`);
      if (!r.ok) {
        console.warn(`${appid}: HTTP ${r.status} — 30秒待機して続行`);
        await new Promise((s) => setTimeout(s, 30000));
        continue;
      }
      const data = await r.json();
      await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ kind: 'spy_detail', appid, data }),
      });
    } catch (e) {
      if (++fail > 20) { console.error('失敗が多いため中断。再実行で続きから再開できます。'); return; }
      console.warn(appid, String(e));
    }
    if (++n % 25 === 0) console.log(`${n}/${todo.length}`);
    await new Promise((s) => setTimeout(s, 1000)); // レート制限: 1リクエスト/秒
  }
  console.log('DONE — ターミナルで npm run import:raw を実行してください');
})();
