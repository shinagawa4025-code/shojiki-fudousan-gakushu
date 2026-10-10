// 試験種別と出題分野の対応表(カウントダウン・学習ペース・分野別進捗・模擬試験で使用)
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
      mockExam: true,
      categories: [
        { id: `kenri`, name: `権利関係`, questions: 14, topicIds: [`topicB`, `topicA`, `topicD`, `topicE`], termIds: [] },
        { id: `horei`, name: `法令上の制限`, questions: 8, topicIds: [`topicJ`], termIds: [`basicE08`, `term23`] },
        { id: `zei`, name: `税・価格評定`, questions: 3, topicIds: [`topicH`], termIds: [`basicB04`, `basicB05`, `basicB06`, `basicB08`, `basicC05`, `basicF06`, `basicF08`] },
        { id: `gyoho`, name: `宅建業法`, questions: 20, topicIds: [`topicK`, `topicF`], termIds: [`basicB01`, `basicB02`, `basicB07`, `basicG01`, `term02`, `term03`, `term18`] },
        { id: `menjo`, name: `5問免除科目`, questions: 5, topicIds: [], termIds: [`term21`, `basicF04`, `basicD08`] },
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
