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
  LIFF_IDS: {
    interview: '',  // ①面接予約     → /interview/
    mendan: '',     // ②面談予約     → /mendan/
    watch: '',      // ③視聴の器     → /watch/
    teirei: ''      // ④土曜定例の体験参加 → /teirei/（2026-09-08 追加）
  },

  // 視聴LIFFに出す動画。YouTube の限定公開ID を入れる（撮影待ち）。
  // 入るまでは watch ページが「準備中」を出して止まる（空のプレイヤーを見せない）。
  YOUTUBE_ID: '',

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
  LSTEP_TAG_URL: ''
};
