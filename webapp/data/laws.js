// 関連法律・制度 早見表
window.APP_DATA = window.APP_DATA || {};
window.APP_DATA.laws = {
  laws: [
    { id: `law1`, name: `宅地建物取引業法(宅建業法)`, topicIds: [`topicF`, `topicB`],
      description: `仲介手数料の上限(46条)、重要事項説明の義務、インスペクション実施有無の説明義務など、不動産取引の基本ルールを定める`,
      episodes: [`3-4`, `25-26`, `51-52`, `57-58`], notExhaustive: true },
    { id: `law2`, name: `借地借家法`, topicIds: [`topicE`, `topicA`, `topicG`],
      description: `賃料増減額請求権(32条)、借地権・借家権の存続保護などを定める`,
      episodes: [`23-24`, `45-46`, `61-62`, `99-100`], notExhaustive: true },
    { id: `law3`, name: `民法(契約不適合責任)`, topicIds: [`topicB`],
      description: `2020年改正で「瑕疵担保責任」から名称変更。引渡し後の欠陥への売主責任を規定`,
      episodes: [`11-12`, `87-88`], notExhaustive: true },
    { id: `law4`, name: `住宅の品質確保の促進等に関する法律(品確法)`, topicIds: [`topicB`],
      description: `新築住宅の構造耐力上主要な部分等について、引渡しから10年間の契約不適合責任を売主・請負人に義務付ける`,
      episodes: [`11-12`], notExhaustive: true },
    { id: `law5`, name: `住宅瑕疵担保履行法`, topicIds: [`topicB`],
      description: `新築住宅の売主・請負人に保険加入や保証金供託を義務付け、倒産時も保証を受けられるようにする`,
      episodes: [`11-12`, `87-88`], notExhaustive: true },
    { id: `law6`, name: `建築基準法`, topicIds: [`topicE`, `topicD`, `topicB`],
      description: `接道義務・容積率・既存不適格建築物の扱いなど建築の最低基準を定める`,
      episodes: [`37-38`, `55-56`, `93-94`], notExhaustive: true },
  ],
  citations: [
    { label: `宅地建物取引業法関係(国土交通省)`, url: `https://www.mlit.go.jp/totikensangyo/const/1_6_bt_000266.html` },
    { label: `品確法の10年保証について`, url: `https://www.reds.co.jp/p112525/` },
    { label: `借地借家法32条 賃料増減額請求権`, url: `https://nao-lawoffice.jp/real-estate/columns/lease/2461/` },
  ],
};
