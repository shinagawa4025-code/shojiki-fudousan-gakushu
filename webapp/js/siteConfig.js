// アプリ全体の設定(名前・URL・版・報告フォーム)。アプリ名はこのファイルだけに書き、他のファイルは SITE を参照する
// (保存キーの接頭辞 shojikiLearn.v1. とキャッシュ名 shojiki-gakushu-vN は、記録とキャッシュを引き継ぐため旧名のまま)
//
// 誤りの報告フォーム(Googleフォーム)の設定方法:
//  1. Googleフォームで次の質問を作る(メールアドレスは収集しない)
//     ①種類(ラジオボタン。選択肢は report.js の KIND の値と同じ文言) ②項目ID ③項目名・問題文 ④画面
//     ⑤どこが誤っていますか・ご意見(段落・必須) ⑥根拠となる資料やURL(任意) ⑦アプリのバージョン
//  2. フォームの「︙」→「事前入力したURLを取得」で各欄に仮の値を入れて「リンクを取得」し、
//     URL の entry.数字 を下の entry に、? より前の部分(…/viewform)を formUrl に書く
//  3. formUrl が空のあいだは、「誤りを報告」のボタン・リンクは表示されない
window.SITE = (function () {
  const report = Object.freeze({
    formUrl: ``,
    entry: Object.freeze({ kind: ``, itemId: ``, itemTitle: ``, location: ``, appVersion: `` }),
  });
  return Object.freeze({
    name: `ふどまな`,
    shortName: `ふどまな`,
    tagline: `宅建の合格にも、暮らしの安心にも。`,
    titleSuffix: `宅建・賃貸・売買・相続を基礎から学べる無料アプリ`,
    url: `https://shinagawa4025-code.github.io/shojiki-fudousan-gakushu/`,
    version: `11.1`,
    // 公開日(プライバシーポリシーの制定日・更新履歴の日付にも使う)。公開する日に合わせて直す
    releasedAt: `2026-10-14`,
    // 内容(法令・税制・統計)を確認した基準日
    contentAsOf: `2026-10-10`,
    // バックアップファイル名などに使う英字の名前
    backupSlug: `fudomana`,
    report,
  });
})();
