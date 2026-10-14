/**
 * LIFF 共通設定 — ★ここだけ書き換える
 *
 * デプロイ後に守屋が直すのは LIFF_IDS の3つだけ。
 * それ以外のファイルは触らなくてよい。
 */
window.RVSS_CONFIG = {
  // GAS Web アプリ（doGet=日程返し／doPost=申込受け）
  // 出どころ＝人事採用/02_選考・フォロー/LIFF連携_仕様_0825.md
  GAS_ENDPOINT:
    'https://script.google.com/macros/s/AKfycbxtbP-FcEnrjQT8m50gZ7VaMoUZJncTwdNHE37QdJXyKKeU0kIELi3ffCNLpuJ5_dkm/exec',

  // ★LINE Developers で LIFF アプリを作ったら、ここへ ID を貼る。
  //   3本とも同じチャネル（2010676990）配下で作る。
  //   エンドポイントURL＝ https://<ユーザー名>.github.io/rvss-liff/<パス>/
  //   Scope＝profile（openid は不要）／ボット連携＝On（friend_required）
  //   ★2026-09-15｜チャネルは新設した「RVSS 採用フォーム」(2011618269)。
  //     既存の 2010676990（RVSS 合説フォーム）は守屋に権限が無く触れないため。
  //     プロバイダーは公式LINEの Messaging API と同じ「西原 浩貴」配下なのでボット連携が効く。
  LIFF_IDS: {
    interview: '2011618269-t2d8nrIF',  // ①面接予約     → /interview/
    mendan: '2011618269-f4IcRbH3',     // ②面談予約     → /mendan/
    watch: '2011618269-KAXaH1SR',      // ③視聴の器     → /watch/
    rookies: '2011618269-ENnQWBeh',    // ④REAL ROOKIES 10/17 参加申込 → /rookies/
    // ⑤オンライン交流会の予約 → /kouryu/（2026-09-24）
    //   ★配っていなかった旧・土曜定例用の ID を転用する。LINE Developers でエンドポイントURLを /kouryu/ へ変える（守屋）
    kouryu: '2011618269-iaNe966R',
    // ⑥分科会の参加ページ → /bunkakai/（2026-10-06 公式LINE定例）
    //   2026-10-06 発行（LIFFアプリ名「RVSS 分科会の参加」・Full・profile・友だち追加 On (Normal)）
    bunkakai: '2011618269-R53fOad8'
    // ⚠ 土曜定例（体験参加）はここに置かない。情シス版が本番＝
    //   https://rvss-dx-ten.vercel.app/liff/saturday（2026-09-11 に井上さんが本番反映・
    //   9/15 時点で実申込3件が『土曜定例申込_LIFF受』に入っている）。
    //   こちらで発行した 2011618269-iaNe966R は重複なので配らない（2026-09-16 守屋判断）。
    //   ★2026-09-24 この ID は交流会（kouryu）へ転用した。
  },

  // 交流会の名称。★2026-10-13 守屋「その名前で進めて」＝座談会を相談会へ（学生本人の悩みを相談する場・Adness 69a2e63c）。
  // 旧＝現役メンバーとZoomで20分話す（9/29 改称）／現役メンバーに聞ける20分座談会（9/25 dafc3ae2）。
  // 変えるときは GAS の KOURYU.PUBLIC_NAME も同時に
  KOURYU_NAME: '就活・将来の相談会（現役メンバーと20分）',

  // 視聴LIFFに出す動画。YouTube の限定公開ID。
  // 入るまでは watch ページが「準備中」を出して止まる（空のプレイヤーを見せない）。
  YOUTUBE_ID: 'ZhhdgT-HhlY',   // 2026-10-14 オンデマンド v9 HERO’ZZ除去版（3:55修正・349秒・RVSS・限定公開・埋め込み可・守屋が全編確認し公開承認）。旧 v9＝ZsRlQcT1Efw／v8＝lmkSz3wLtSE／v5＝yrXmfHOhBwo

  // 視聴期限（時間）。決定10（2026-08-25）＝48時間。
  WATCH_DEADLINE_HOURS: 48,

  // doPost の合言葉。GAS 側のスクリプトプロパティ LIFF_TOKEN と一致させる。
  // 空なら合言葉なし運用（GAS 側も空である必要がある）。
  LIFF_TOKEN: '',

  // ★Lステップの計測URL（e8af2061 の案2）
  //   面談予約の完了画面に「予約内容を確認する」ボタンを出し、ここへ飛ばす。
  //   踏んだ瞬間に「採用フロー中」タグが付いて、広報のシナリオ配信から外れる。
  //   ∵ Lステップはユーザー側の反応にしかタグを付けられない（APIはプロプランのみ）。
  //   ⚠ 空のままだとボタンは出ない（押せないボタンを見せない）。
  //   ⚠ 押し忘れた人にはタグが付かず、外部から検出もできない。本命は案1
  //     （広報のシナリオを短くして除外タグ自体を要らなくする）で、これはつなぎ。
  LSTEP_TAG_URL: '',

  // ★TEIREI_ZOOM_URL / TEIREI_CALENDAR_URL は 2026-09-16 に削除した。
  //   土曜定例の体験参加は情シス版（rvss-dx-ten.vercel.app/liff/saturday）が本番で、
  //   完了画面のZoom・カレンダー表示もそちらが持っている。

  // ★分科会（杉本さん企画・2026-10-06 公式LINE定例）の参加ページ /bunkakai/ が出す Zoom。
  //   一斉配信のリンクは https://liff.line.me/<分科会のLIFF ID>?course=ai&src=<配信名> の形にする。
  //   zoom が空のコースは「開始前に表示されます」を出す（空のボタンを見せない）。
  //   ⚠ コースの key は英数字だけ。日程・Zoom は杉本さんの設計待ち（Adness f02cb82f）
  BUNKAKAI_COURSES: {
    ai: { name: 'AI', zoom: '' },
    eigyo: { name: '営業', zoom: '' },
    shukatsu: { name: '就活', zoom: '' }
  },

  // ★REAL ROOKIES（10/17）の申込完了画面に出す連絡先。
  //   出どころ＝平井さんの要件定義（Notion「『REAL ROOKIES』参加申込フォーム（外部向け）要件定義書」）。
  //   ⚠ 空ならボタンを出さない（空リンクを見せない）。
  //   ⚠ 9/14 PM定例では「平井さんの個人LINE＋Instagram」だったが、
  //     9/15 の要件定義では「RVSS公式LINE＋Instagram」に変わっている。要件定義のほうを採った。
  ROOKIES_LINE_URL: 'https://line.me/R/ti/p/@392huviq',
  ROOKIES_IG_URL: 'https://www.instagram.com/k_kai27/'
};
