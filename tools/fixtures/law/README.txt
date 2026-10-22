tools/fixtures/law/shohiho.json — 消費税法の条文(条文穴埋めの照合用)
=====================================================================

何に使うか
  webapp/data/joubun.js(条文穴埋め・消費税法)の各項目は、parts をつなげて空欄に正解を、（略）にたたんだ所にその文を入れると、
  e-Gov 法令検索の本文と1字も違わないことになっています。tools/lib/checks/tools.js(node tools/check.js webapp の 9.)が
  このファイルと照合します。CI(.github/workflows/pages.yml の最初の段階)でも照合し、違えばエラーで公開を止めます。
  このファイルがないときもエラーです(別の JSON で照合するときは環境変数 SHOHIHO_JSON にその場所を書く)。

出典
  e-Gov 法令検索(デジタル庁) https://laws.e-gov.go.jp/law/363AC0000000108
  法令名・番号: 消費税法(昭和六十三年法律第百八号)
  取得元: e-Gov 法令API v2 https://laws.e-gov.go.jp/api/2/law_data/363AC0000000108
  改正履歴ID(revisionId): 363AC0000000108_20261001_507AC0000000070
  時点(asOf): 2026-10-01 に施行されている本文(同日施行の改正まで反映。2026-11-01 施行の改正(令和七年法律第十三号の一部)は未反映)
  取得日: 2026-10-17(JSON の source.fetched。e-Gov の更新日時 source.updated は 2026-04-03T17:05:25+09:00)
  加工: API の応答(XML を JSON にしたもの)から、本則の条と、附則の一部(所得税法等の一部を改正する法律(平成二十八年法律第十五号)
        附則第51条の2〜第53条の2。キーは fusoku_h28_…)の、条・項・号の本文(sentence・items・subitems)と見出しだけを取り出し、
        { asOf, revisionId, source, order, articles: { 条: { num, caption, paragraphs: { 項: { sentence, items, subitems } } } } } の形にした。
        文(Sentence)はそのまま連結(号の中の段(Column)の間だけ全角の空白でつなぐ)。本文の文字(漢数字・括弧・句読点・
        「行つた」などの書き方)は変えていない

権利について
  法令(憲法・法律・政令など)は著作権の対象になりません(著作権法13条1号)。
  e-Gov のサイト(e-gov.go.jp とそのサブドメイン)のコンテンツには、特記がない限り「公共データ利用規約(第1.0版)」(PDL1.0)が
  適用されると e-Gov ポータルの利用規約(https://www.e-gov.go.jp/terms/。2026-10-22 に確認)に書かれています。
  出典の記載と、編集・加工したときはそのことと主体を書くことが求められています。
  出典: 「消費税法」(e-Gov 法令検索)(https://laws.e-gov.go.jp/law/363AC0000000108)(2026年10月17日に利用)をもとに ふどまな 作成
  (e-Gov 法令検索のサイトの利用規約のページ https://laws.e-gov.go.jp/terms/ は、2026-10-22 の午前はメンテナンス中で確認できなかった)

作り直すとき(法改正で基準日を変えるとき)
  1. e-Gov 法令API v2 の改正履歴から、新しい基準日に施行されている版の JSON を取る(取ったファイルは作業用のフォルダに置き、
     リポジトリには上の形に整えたものだけを入れる)
  2. このファイルを置き換え、asOf・revisionId・source を書き直す。この README の時点と取得日も直す
  3. webapp/data/joubun.js の law.asOf・revisionId と、変わった条文の項目を直し、node tools/check.js webapp で照合する
