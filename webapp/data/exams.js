// 試験種別と出題分野の対応表(カウントダウン・学習ペース・分野別進捗・模擬試験・合格予測・学習計画で使用)
// 分野の判定: termIds(個別指定)を最優先し、なければ項目のtopicIdsの先頭から順に topicIds に含む分野を探す
// questions は「例年の出題数(目安)」であり、公式に固定された配分ではない
window.APP_DATA = window.APP_DATA || {};
window.APP_DATA.exams = {
  types: [
    {
      id: `takken`,
      name: `宅地建物取引士資格試験`,
      shortName: `宅建士`,
      totalQuestions: 50,
      minutes: 120,
      targetScore: 35,
      targetNote: `35点はこのアプリ独自の目安です(合格点は毎年変わります)`,
      // 実施機関が公表した試験日(試験日の入力欄で、過ぎるまでワンタップの候補として出す)
      officialDates: [{ date: `2026-10-18`, label: `令和8年度 宅建士試験` }],
      // 次の年度の試験日の見込み(公式発表の前)。officialDates には入れず、選ぶと目標に tentative: true(「見込み」と表示)が付く。
      // 宅建士試験は例年10月の第3日曜日(令和8年度は10月18日)。2027-10-17 は2027年10月の第3日曜日。
      // 公式に発表されたら officialDates に移し、ここから消す
      expectedDates: [{ date: `2027-10-17`, label: `令和9年度 宅建士試験`, note: `見込み・未発表(例年10月第3日曜)` }],
      // 合格発表(試験の後のホーム・学習計画の画面で案内する)。発表日は実施機関が公表したものだけ
      // 出典: 一般財団法人 不動産適正取引推進機構(RETIO)「令和8年度 宅建試験のスケジュール」・宅建試験のページ(2026-10-14 確認)
      results: [{ examDate: `2026-10-18`, label: `令和8年度`, date: `2026-11-25`, time: `9時30分`, src: `https://www.retio.or.jp/exam/` }],
      resultsUrl: `https://www.retio.or.jp/exam/`,
      resultsOrg: `不動産適正取引推進機構(RETIO)`,
      // 過去の合格点(合格基準点)。score = 一般受験者(50問中)、exemptScore = 登録講習修了者(5問免除・45問中。実施されていない回は null)
      // 出典: RETIO「試験実施概況(令和7年度以前10年間)」(2025年12月掲載・2026-10-14 確認)。確認できない値は null(画面に出さない)
      passHistory: [
        { fy: 2020, label: `令和2年度(10月)`, score: 38, exemptScore: 33, src: `https://www.retio.or.jp/wp-content/uploads/2025/12/10years_result2025.pdf` },
        { fy: 2020, label: `令和2年度(12月)`, score: 36, exemptScore: 31, src: `https://www.retio.or.jp/wp-content/uploads/2025/12/10years_result2025.pdf` },
        { fy: 2021, label: `令和3年度(10月)`, score: 34, exemptScore: 29, src: `https://www.retio.or.jp/wp-content/uploads/2025/12/10years_result2025.pdf` },
        { fy: 2021, label: `令和3年度(12月)`, score: 34, exemptScore: null, src: `https://www.retio.or.jp/wp-content/uploads/2025/12/10years_result2025.pdf` },
        { fy: 2022, label: `令和4年度`, score: 36, exemptScore: 31, src: `https://www.retio.or.jp/wp-content/uploads/2025/12/10years_result2025.pdf` },
        { fy: 2023, label: `令和5年度`, score: 36, exemptScore: 31, src: `https://www.retio.or.jp/wp-content/uploads/2025/12/10years_result2025.pdf` },
        { fy: 2024, label: `令和6年度`, score: 37, exemptScore: 32, src: `https://www.retio.or.jp/wp-content/uploads/2025/12/10years_result2025.pdf` },
        { fy: 2025, label: `令和7年度`, score: 33, exemptScore: 28, src: `https://www.retio.or.jp/wp-content/uploads/2025/12/10years_result2025.pdf` },
        // 令和8年度は合格発表(2026-11-25)のあとに RETIO の発表で確かめてから入れる
        { fy: 2026, label: `令和8年度`, score: null, exemptScore: null, src: null },
      ],
      mockExam: true,
      categories: [
        { id: `kenri`, name: `権利関係`, questions: 14, topicIds: [`topicL`, `topicB`, `topicA`, `topicD`, `topicE`], termIds: [] },
        { id: `horei`, name: `法令上の制限`, questions: 8, topicIds: [`topicJ`], termIds: [`basicE08`, `term23`] },
        { id: `zei`, name: `税・価格評定`, questions: 3, topicIds: [`topicH`], termIds: [`basicB04`, `basicB05`, `basicB06`, `basicB08`, `basicC05`, `basicF06`, `basicF08`] },
        { id: `gyoho`, name: `宅建業法`, questions: 20, topicIds: [`topicK`, `topicF`], termIds: [`basicB01`, `basicB02`, `basicB07`, `basicG01`, `term02`, `term03`, `term18`] },
        { id: `menjo`, name: `5問免除科目`, questions: 5, topicIds: [`topicN`], termIds: [`term21`, `basicF04`, `basicD08`, `basicA12`, `basicC04`] },
      ],
      // 一覧などで4分野にまとめて見せる場合の統合先
      compactMerge: { menjo: `zei` },
      compactNames: { zei: `税・その他` },
    },
    {
      id: `zeirishi`,
      name: `税理士試験`,
      shortName: `税理士`,
      mockExam: false,
      categories: [
        { id: `shisan`, name: `不動産税務`, questions: null, topicIds: [`topicH`], termIds: [`basicB04`, `basicB05`, `basicB06`, `basicB08`, `basicC05`] },
        { id: `shohi`, name: `不動産と消費税`, questions: null, topicIds: [`topicO`], termIds: [`basicH13`] },
      ],
    },
    {
      id: `other`,
      name: `その他の試験・目標`,
      shortName: `その他`,
      mockExam: false,
      categories: null,
    },
  ],
};
