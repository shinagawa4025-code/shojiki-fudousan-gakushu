出題頻度ランク(webapp/data/frequency.js)の作り方
==================================================

このフォルダの JSON から webapp/data/frequency.js を作ります。frequency.js は手で直さず、ここの入力を直して作り直してください。
tools/check.js(tools/lib/checks/freqgen.js)と単体テスト(tools/tests/unit/freqgen.test.js)は、frequency.js がここから作った内容と
同じかを確かめます(違えばエラー。CI で公開が止まります)。入力と frequency.js がずれたままだと、次に作り直したときに直した所が黙って元に戻るためです。

ファイル
  gen.js          作るスクリプト(Node だけで動く。依存パッケージなし)
  exams.json      数えた本試験 [{ id, label, date }](例: { "id": "R7", "label": "令和7年度", "date": "2025-10-19" })
  past.json       過去問の分類 [{ exam, no, primary, secondary: [テーマID…], low? }]。1回50問をすべて
                  primary = その問題の主な論点、secondary = ほかの選択肢で問われた論点、low = 分類に迷った印(集計には使わない)
  themes.json     論点(テーマ)[{ id, name, cat, topicId, section, basicIds, scope }]。名前と範囲(scope)はこのアプリが書いたもの
  quizTheme.json  アプリの4択 → テーマ [{ quizId, themeId }](宅建の分野 examCats.takken が付いた4択はすべて)
  config.json     { asOf(集計した日), rankRule: { A, B }(出た回の割合の境目), method(#freq の画面の説明), source(情報源 src230) }

守ること
  - 過去問(不動産適正取引推進機構が公開している試験問題)の文章は、このフォルダにもアプリにも書かない。
    分類には回の id・問題番号・テーマの id だけを使う。テーマの名前と範囲は自分の言葉で書く(問題文の言い回しを写さない)
  - テーマの id(fq-gyoho-01 など)は公開後は変えない(成績の集計と絞り込みが id で引くため)。新しい論点は末尾の番号で足す

使い方(どこからでも実行できます)
  node tools/freq/gen.js            確かめるだけ(作った内容が今の frequency.js と同じか。違えば終了コード 1)
  node tools/freq/gen.js --stats    境目の候補ごとの A/B/C の数と、回数の分布も出す
  node tools/freq/gen.js --write    webapp/data/frequency.js を書く

次の年(令和8年度)を足すとき
  1. 令和8年度の問題と正解が公開されたら、50問を1問ずつ分類して past.json に足す
     例: { "exam": "R8", "no": 1, "primary": "fq-kenri-01", "secondary": [] }(50行。問題の文章は書かない)
  2. exams.json に { "id": "R8", "label": "令和8年度", "date": "2026-10-18" } を足す
     (数える回を直近の12回にそろえるときは、いちばん古い回(H28)を exams.json と past.json の両方から消す)
  3. config.json の asOf を集計した日にし、method・source.description の「平成28年度〜令和7年度の12回」などの書き方も合わせる
  4. node tools/freq/gen.js --stats で A/B/C の数を見て、境目(rankRule)を変えるか決める(変えたら method と about.js の説明も見直す)
  5. node tools/freq/gen.js --write で作り直し、node tools/check.js webapp でエラーがないことを確かめる
     (宅建の分野が付いた4択を足したときは、quizTheme.json にもその問題のテーマを足す。足りないと gen.js がエラーで止まる)
  6. js/views/about.js の出題頻度ランクの説明(回の数・年度の範囲)と、data/changelog.js に1行
