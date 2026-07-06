// SteamSpyの "all" 10ページをブラウザ経由でダウンロードするスニペット。
// 使い方:
//   1. Chromeで https://steamspy.com を開く (Cloudflare認証を通過しておく)
//   2. そのタブで DevTools (Cmd+Option+J) を開く
//   3. このファイルの (async () => { ... })(); 部分を丸ごとコンソールに貼り付けてEnter
//      ※「allow pasting」と入力を求められたらそのまま入力
//   4. 約10分で ~/Downloads に steamspy_page_0.json 〜 steamspy_page_9.json が保存される
//      (最初に「複数ファイルのダウンロードを許可」ダイアログが出たら許可)
//   5. ターミナルで:
//        cd ~/Claude/Projects/SteamLOOK
//        mkdir -p data/raw
//        mv ~/Downloads/steamspy_page_*.json data/raw/
//        npm run import:raw

(async () => {
  for (let p = 0; p < 10; p++) {
    console.log(`page ${p}: fetching...`);
    const r = await fetch(`https://steamspy.com/api.php?request=all&page=${p}`);
    if (!r.ok) {
      console.error(`page ${p}: HTTP ${r.status} — 60秒ほど待ってから貼り直してください (取得済みページはやり直し不要)`);
      return;
    }
    const t = await r.text();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([t], { type: 'application/json' }));
    a.download = `steamspy_page_${p}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    console.log(`page ${p}: saved (${Math.round(t.length / 1024)} KB)`);
    if (p < 9) await new Promise((s) => setTimeout(s, 61000)); // レート制限: allは60秒/リクエスト
  }
  console.log('DONE — ~/Downloads の steamspy_page_*.json を data/raw/ へ移動してください');
})();
