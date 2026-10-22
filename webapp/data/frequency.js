// 出題頻度ランク(v14): 論点(テーマ)ごとに、宅建士試験の過去の本試験で何回出たかを数えた A/B/C のランク
// 不動産適正取引推進機構(RETIO)が公開している過去の試験問題を論点ごとに分類し、その論点が出た回を数えた集計(手で直さない。
// 直すときは分類からやり直して作り直す)。過去問の文章は使わず、数えた回数だけを載せる
// 形:
//   asOf      集計した日
//   exams     数えた本試験(新しい順。令和2年度・3年度は10月と12月の2回: id R3-12, R3-10 …)
//   method    #freq の画面に出す説明(数え方と、目安であること)
//   rankRule  数えた本試験のうち、そのテーマが出た回の割合の境目(A 以上 → A、B 以上 → B、それ未満 → C)。12回なら A は9回以上・B は5回以上
//   themes    [{ id, name, cat(gyoho|kenri|horei|zei|menjo), topicId, section(トピックの小見出し), basicIds(1つの基礎知識は1つのテーマだけ),
//               hits(出た回数。主な論点としてか、1問の中のほかの選択肢で問われた論点として), questions(そのテーマが主な論点の問題数),
//               rank, last(最後に出た回の id。出ていなければ null) }]
//   quizTheme { 問題ID: テーマID }(宅建の分野が付いた4択はすべていずれかのテーマへ。○×の文は元の4択のテーマに従う)
// テーマの id は公開後は変えない(成績の集計と絞り込みが id で引くため)
window.APP_DATA = window.APP_DATA || {};
// 情報源(data/sources.js は書き換えず、ここで足す。id は src230〜234)
window.APP_DATA.sources = window.APP_DATA.sources || [];
window.APP_DATA.sources.push({ id: `src230`, category: `宅建士試験`, orgName: `不動産適正取引推進機構(宅建士試験の過去の試験問題)`,
  url: `https://www.retio.or.jp/exam/past_ques_ans/other/`,
  description: `宅建士試験の過去の試験問題と正解。出題頻度ランク(平成28年度〜令和7年度の12回)の集計に使用。問題の文章はこのアプリに載せず、論点ごとに数えた回数だけを使っています` });
window.APP_DATA.frequency = {
  asOf: `2026-10-22`,
  exams: [
    { id: `R7`, label: `令和7年度`, date: `2025-10-19` },
    { id: `R6`, label: `令和6年度`, date: `2024-10-20` },
    { id: `R5`, label: `令和5年度`, date: `2023-10-15` },
    { id: `R4`, label: `令和4年度`, date: `2022-10-16` },
    { id: `R3-12`, label: `令和3年度(12月)`, date: `2021-12-19` },
    { id: `R3-10`, label: `令和3年度(10月)`, date: `2021-10-17` },
    { id: `R2-12`, label: `令和2年度(12月)`, date: `2020-12-27` },
    { id: `R2-10`, label: `令和2年度(10月)`, date: `2020-10-18` },
    { id: `R1`, label: `令和元年度`, date: `2019-10-20` },
    { id: `H30`, label: `平成30年度`, date: `2018-10-21` },
    { id: `H29`, label: `平成29年度`, date: `2017-10-15` },
    { id: `H28`, label: `平成28年度`, date: `2016-10-16` },
  ],
  method: `不動産適正取引推進機構が公開している過去の試験問題を、このアプリが論点ごとに分けて数えました。1つの問題でほかの論点も問われたときはその論点も「出た回」に数え、令和2年度・3年度は10月と12月の試験をそれぞれ1回と数えています。`,
  rankRule: { A: 0.75, B: 0.4 },
  themes: [
    // ---- 宅建業法
    // 宅地・建物・取引・業の意味、免許が要らない者(国・地方公共団体・信託会社など)、無免許営業と名義貸しの禁止
    { id: `fq-gyoho-01`, name: `宅建業の意味(免許の要否)`, cat: `gyoho`, topicId: `topicK`, section: `免許・宅建士`,
      basicIds: [`basicK01`, `basicF01`],
      hits: 10, questions: 8, rank: `A`, last: `R6` },
    // 知事免許と大臣免許・有効期間と更新・免許換え・免許の条件。名簿の変更の届出・廃業等の届出は fq-gyoho-04
    { id: `fq-gyoho-02`, name: `免許の種類・有効期間・免許換え`, cat: `gyoho`, topicId: `topicK`, section: `免許・宅建士`,
      basicIds: [`basicK02`],
      hits: 8, questions: 4, rank: `B`, last: `R7` },
    // 免許の欠格事由(破産・刑罰・免許取消し・暴力団員等・役員や政令で定める使用人の欠格など)
    { id: `fq-gyoho-03`, name: `免許の基準(欠格事由)`, cat: `gyoho`, topicId: `topicK`, section: `免許・宅建士`,
      basicIds: [`basicK03`],
      hits: 8, questions: 6, rank: `B`, last: `R7` },
    // 宅建業者名簿の登載事項と変更の届出、廃業等の届出(届出をする者・期限・免許の効力)、免許証の書換えと返納
    { id: `fq-gyoho-04`, name: `変更の届出・廃業等の届出`, cat: `gyoho`, topicId: `topicK`, section: `免許・宅建士`,
      basicIds: [`basicK23`],
      hits: 8, questions: 6, rank: `B`, last: `R7` },
    // 宅建士試験と登録の要件・登録の欠格事由・登録の消除・変更の登録・死亡等の届出
    { id: `fq-gyoho-05`, name: `宅建士の登録`, cat: `gyoho`, topicId: `topicK`, section: `免許・宅建士`,
      basicIds: [`basicK24`],
      hits: 11, questions: 7, rank: `A`, last: `R7` },
    // 宅建士証の交付・有効期間と更新・法定講習・提示・書換え・返納と提出、登録の移転、宅建士の義務(信用失墜行為の禁止など)
    { id: `fq-gyoho-06`, name: `宅建士証・登録の移転`, cat: `gyoho`, topicId: `topicK`, section: `免許・宅建士`,
      basicIds: [`basicK04`],
      hits: 11, questions: 11, rank: `A`, last: `R7` },
    // 事務所の範囲・専任の宅建士の数と補充・案内所等の届出・標識・帳簿・従業者名簿・従業者証明書
    { id: `fq-gyoho-07`, name: `事務所・案内所等の規制`, cat: `gyoho`, topicId: `topicK`, section: `免許・宅建士`,
      basicIds: [`basicK05`],
      hits: 11, questions: 12, rank: `A`, last: `R7` },
    // 供託額・供託物・供託所と届出・還付と追加供託・保管替え・取戻しと公告。保証協会の弁済業務保証金は fq-gyoho-09
    { id: `fq-gyoho-08`, name: `営業保証金`, cat: `gyoho`, topicId: `topicK`, section: `営業保証金・保証協会`,
      basicIds: [`basicK06`, `basicK25`],
      hits: 11, questions: 10, rank: `A`, last: `R7` },
    // 保証協会の業務・弁済業務保証金分担金の納付・還付と還付充当金・社員の地位の喪失・取戻し
    { id: `fq-gyoho-09`, name: `保証協会(弁済業務保証金)`, cat: `gyoho`, topicId: `topicK`, section: `営業保証金・保証協会`,
      basicIds: [`basicK07`],
      hits: 11, questions: 11, rank: `A`, last: `R6` },
    // 媒介契約の種類・有効期間と更新・指定流通機構への登録・業務処理状況の報告・34条の2書面(建物状況調査のあっせん・価額への意見の根拠を含む)
    { id: `fq-gyoho-10`, name: `媒介契約`, cat: `gyoho`, topicId: `topicK`, section: `媒介・広告`,
      basicIds: [`basicK12`, `basicB01`, `basicF02`, `basicF03`, `basicF07`],
      hits: 12, questions: 16, rank: `A`, last: `R7` },
    // 宅建業法の誇大広告・おとり広告の禁止と取引態様の明示義務。公正競争規約の表示基準は fq-menjo-02
    { id: `fq-gyoho-11`, name: `広告の規制(誇大広告・取引態様)`, cat: `gyoho`, topicId: `topicK`, section: `媒介・広告`,
      basicIds: [`basicF04`],
      hits: 12, questions: 10, rank: `A`, last: `R7` },
    // 開発許可・建築確認などの処分前の広告と契約締結の制限(売買・貸借での違い)
    { id: `fq-gyoho-12`, name: `広告開始時期・契約締結時期の制限`, cat: `gyoho`, topicId: `topicK`, section: `媒介・広告`,
      basicIds: [`basicK08`],
      hits: 10, questions: 6, rank: `A`, last: `R7` },
    // 35条の説明の時期・相手方・宅建士による記名と説明・宅建士証の提示・IT重説と、書面の電磁的方法による提供(35条書面・34条の2書面・37条書面。37条書面の電磁的提供だけを問う問題もここ)
    { id: `fq-gyoho-13`, name: `重要事項の説明の方法(IT重説)と書面の電磁的提供`, cat: `gyoho`, topicId: `topicK`, section: `35条・37条書面`,
      basicIds: [`basicK09`, `basicK22`],
      hits: 12, questions: 9, rank: `A`, last: `R7` },
    // 35条で説明すべき事項(登記された権利・法令上の制限・代金以外の金銭・区分所有建物・貸借・水害ハザードマップ・石綿・耐震診断・建物状況調査など)と供託所等の説明(35条の2)
    { id: `fq-gyoho-14`, name: `重要事項の説明(説明事項)`, cat: `gyoho`, topicId: `topicK`, section: `35条・37条書面`,
      basicIds: [`basicK26`],
      hits: 12, questions: 27, rank: `A`, last: `R7` },
    // 37条書面の必要的記載事項と任意的記載事項・交付の相手方・宅建士の記名と、35条書面との違い。37条書面の電磁的方法による提供(承諾・方法の要件)は fq-gyoho-13
    { id: `fq-gyoho-15`, name: `37条書面`, cat: `gyoho`, topicId: `topicK`, section: `35条・37条書面`,
      basicIds: [`basicK10`, `basicK11`],
      hits: 12, questions: 24, rank: `A`, last: `R7` },
    // 売買・交換・貸借の媒介と代理の報酬の限度額(速算式・消費税・権利金・低廉な空家等の特例)と、限度額をこえる受領・広告料などの別途受領
    { id: `fq-gyoho-16`, name: `報酬`, cat: `gyoho`, topicId: `topicK`, section: `報酬`,
      basicIds: [`basicK13`],
      hits: 12, questions: 13, rank: `A`, last: `R7` },
    // 事務所等以外の場所での申込み・告げる書面と8日間・引渡しと代金全額の支払・書面による撤回の効果と特約
    { id: `fq-gyoho-17`, name: `クーリング・オフ`, cat: `gyoho`, topicId: `topicK`, section: `8種制限`,
      basicIds: [`basicG01`],
      hits: 12, questions: 12, rank: `A`, last: `R7` },
    // 未完成物件・完成物件の保全措置が必要な額と不要な場合(買主への登記など)・保全の方法・保全しないときの支払拒否
    { id: `fq-gyoho-18`, name: `手付金等の保全措置`, cat: `gyoho`, topicId: `topicK`, section: `8種制限`,
      basicIds: [`basicK16`],
      hits: 9, questions: 5, rank: `A`, last: `R7` },
    // 損害賠償額の予定と違約金の合計の上限、手付の額の上限・解約手付とみなす規定と履行の着手・買主に不利な特約の無効
    { id: `fq-gyoho-19`, name: `損害賠償額の予定・手付の制限`, cat: `gyoho`, topicId: `topicK`, section: `8種制限`,
      basicIds: [`basicK27`, `basicB07`],
      hits: 9, questions: 0, rank: `A`, last: `R7` },
    // 他人の物件・未完成物件の売買契約の制限と、取得契約や保全措置による例外
    { id: `fq-gyoho-20`, name: `自己の所有に属しない物件の契約制限`, cat: `gyoho`, topicId: `topicK`, section: `8種制限`,
      basicIds: [`basicK15`],
      hits: 4, questions: 0, rank: `C`, last: `R7` },
    // 通知期間を引渡しから2年以上とする特約を除く、民法より買主に不利な担保責任の特約の無効
    { id: `fq-gyoho-21`, name: `契約不適合責任の特約の制限`, cat: `gyoho`, topicId: `topicK`, section: `8種制限`,
      basicIds: [`basicK17`],
      hits: 6, questions: 2, rank: `B`, last: `R7` },
    // 割賦販売契約の解除等の制限・所有権留保等の禁止・提携ローン付き売買の扱い
    { id: `fq-gyoho-22`, name: `割賦販売・所有権留保などの制限`, cat: `gyoho`, topicId: `topicK`, section: `8種制限`,
      basicIds: [`basicK18`],
      hits: 4, questions: 0, rank: `C`, last: `R4` },
    // 8種制限は業者が自ら売主・買主が業者でない場合だけに適用されることと、複数の8種制限を1問で問う総合問題(主な論点を1つに決められないとき。選択肢ごとの8種制限の論点も、それぞれの出た回に数える)
    { id: `fq-gyoho-23`, name: `8種制限の総合(適用場面)`, cat: `gyoho`, topicId: `topicK`, section: `8種制限`,
      basicIds: [`basicK14`],
      hits: 7, questions: 7, rank: `B`, last: `R7` },
    // 守秘義務・不当な履行遅延・重要な事実の不告知・手付の貸付け等による誘引・断定的判断・威迫・勧誘時の禁止行為・業法以外で業者に課される義務(犯罪収益移転防止法など)
    { id: `fq-gyoho-24`, name: `その他の業務上の規制`, cat: `gyoho`, topicId: `topicK`, section: `業務規制・監督`,
      basicIds: [`basicK19`],
      hits: 10, questions: 15, rank: `A`, last: `R7` },
    // 業者への指示・業務停止・免許取消しと宅建士への指示・事務禁止・登録消除の要件・処分権者・聴聞と公告、罰則と両罰規定
    { id: `fq-gyoho-25`, name: `監督処分・罰則`, cat: `gyoho`, topicId: `topicK`, section: `業務規制・監督`,
      basicIds: [`basicK20`],
      hits: 10, questions: 7, rank: `A`, last: `R7` },
    // 新築住宅の売主・請負人の資力確保措置(保証金の供託・保険)・基準日の届出・供託所の説明
    { id: `fq-gyoho-26`, name: `住宅瑕疵担保履行法`, cat: `gyoho`, topicId: `topicK`, section: `業務規制・監督`,
      basicIds: [`basicK21`],
      hits: 12, questions: 12, rank: `A`, last: `R7` },
    // ---- 権利関係
    // 心裡留保・虚偽表示・錯誤・詐欺・強迫と、その無効・取消しを第三者に主張できるか。意思能力・公序良俗・条件などの総則は fq-kenri-29
    { id: `fq-kenri-01`, name: `意思表示`, cat: `kenri`, topicId: `topicL`, section: `意思表示・制限行為能力`,
      basicIds: [`basicB09`, `basicB10`, `basicB11`, `basicL01`],
      hits: 8, questions: 4, rank: `B`, last: `R7` },
    // 未成年者・成年被後見人・被保佐人・被補助人の行為の取消し、保護者の同意と代理、相手方の催告権と詐術
    { id: `fq-kenri-02`, name: `制限行為能力者`, cat: `kenri`, topicId: `topicL`, section: `意思表示・制限行為能力`,
      basicIds: [`basicB12`, `basicB13`, `basicL02`],
      hits: 6, questions: 5, rank: `B`, last: `R6` },
    // 代理権・顕名・代理行為の瑕疵・復代理・代理権の濫用・自己契約と双方代理・無権代理(無権代理と相続を含む)・表見代理
    { id: `fq-kenri-03`, name: `代理`, cat: `kenri`, topicId: `topicL`, section: `代理`,
      basicIds: [`basicB14`, `basicL03`, `basicL04`],
      hits: 7, questions: 5, rank: `B`, last: `R6` },
    // 取得時効と消滅時効の要件・期間、完成猶予と更新、援用と放棄。不法行為の損害賠償請求権の期間は fq-kenri-26
    { id: `fq-kenri-04`, name: `時効`, cat: `kenri`, topicId: `topicL`, section: `時効`,
      basicIds: [`basicB15`, `basicL05`],
      hits: 8, questions: 5, rank: `B`, last: `R7` },
    // 民法177条の第三者(二重譲渡、取消し・解除・時効・相続と登記)と背信的悪意者。登記の手続そのものは fq-kenri-06
    { id: `fq-kenri-05`, name: `物権変動と登記(対抗要件)`, cat: `kenri`, topicId: `topicL`, section: `物権変動・不動産登記`,
      basicIds: [`basicB17`, `basicL06`],
      hits: 9, questions: 8, rank: `A`, last: `R7` },
    // 表示・権利に関する登記、共同申請と単独申請、仮登記、抹消、登記識別情報、登記事項証明書、筆界特定、相続登記・住所等変更登記の申請義務、相続土地国庫帰属
    { id: `fq-kenri-06`, name: `不動産登記法`, cat: `kenri`, topicId: `topicL`, section: `物権変動・不動産登記`,
      basicIds: [`basicE01`, `basicB03`, `basicL07`, `basicL37`, `basicL43`, `basicL08`],
      hits: 12, questions: 12, rank: `A`, last: `R7` },
    // 効力の及ぶ範囲・物上代位・法定地上権・一括競売・抵当権消滅請求と代価弁済・抵当建物の賃借人・共同抵当・抵当権の処分と消滅。根抵当権に固有の論点は fq-kenri-08
    { id: `fq-kenri-07`, name: `抵当権`, cat: `kenri`, topicId: `topicL`, section: `抵当権・根抵当権・その他の担保物権`,
      basicIds: [`basicL09`, `basicE05`, `basicL10`, `basicL41`],
      hits: 8, questions: 6, rank: `B`, last: `R6` },
    // 極度額・被担保債権の範囲・元本の確定・根抵当権の変更と譲渡など、根抵当権に固有のルール
    { id: `fq-kenri-08`, name: `根抵当権`, cat: `kenri`, topicId: `topicL`, section: `抵当権・根抵当権・その他の担保物権`,
      basicIds: [`basicE02`, `basicL11`],
      hits: 0, questions: 0, rank: `C`, last: null },
    // 抵当権以外の担保物権(留置権・先取特権・質権)と担保物権に共通の性質。区分所有者の先取特権は fq-kenri-20
    { id: `fq-kenri-09`, name: `留置権・先取特権・質権`, cat: `kenri`, topicId: `topicL`, section: `抵当権・根抵当権・その他の担保物権`,
      basicIds: [`basicL33`],
      hits: 3, questions: 2, rank: `C`, last: `R7` },
    // 保証契約の方式・付従性と補充性・催告と検索の抗弁・連帯保証・個人根保証の極度額・保証人への情報提供・求償。連帯債務者間の効力は fq-kenri-11
    { id: `fq-kenri-10`, name: `保証`, cat: `kenri`, topicId: `topicL`, section: `保証・連帯債務`,
      basicIds: [`basicA04`, `basicL12`],
      hits: 2, questions: 3, rank: `C`, last: `R7` },
    // 連帯債務者の一人に生じた事由の効力(絶対的効力・相対的効力)・負担部分と求償。連帯債権を含む
    { id: `fq-kenri-11`, name: `連帯債務`, cat: `kenri`, topicId: `topicL`, section: `保証・連帯債務`,
      basicIds: [`basicL13`],
      hits: 4, questions: 3, rank: `C`, last: `R7` },
    // 債権の目的(特定物・種類債権・選択債権・法定利率)、履行遅滞の時期・損害賠償の範囲・金銭債務の特則・受領遅滞・催告解除と無催告解除・解除の効果・同時履行の抗弁・危険負担。売買の目的物の不適合は fq-kenri-13
    { id: `fq-kenri-12`, name: `債務不履行・解除`, cat: `kenri`, topicId: `topicL`, section: `債務不履行・契約・債権`,
      basicIds: [`basicL14`, `basicL15`],
      hits: 9, questions: 6, rank: `A`, last: `R6` },
    // 売主の契約不適合責任(追完・代金減額・損害賠償・解除・通知期間)、解約手付と履行の着手、他人物売買など売買に固有のルール。宅建業者が自ら売主の制限は fq-gyoho-19・fq-gyoho-21
    { id: `fq-kenri-13`, name: `売買(契約不適合責任・手付)`, cat: `kenri`, topicId: `topicL`, section: `債務不履行・契約・債権`,
      basicIds: [`basicL16`, `basicB02`],
      hits: 9, questions: 7, rank: `A`, last: `R7` },
    // 第三者弁済・受領権者としての外観を有する者への弁済・弁済による代位・弁済の場所と費用・供託と、相殺の要件・相殺の禁止
    { id: `fq-kenri-14`, name: `弁済・相殺`, cat: `kenri`, topicId: `topicL`, section: `債務不履行・契約・債権`,
      basicIds: [`basicL17`],
      hits: 5, questions: 3, rank: `B`, last: `R7` },
    // 債権譲渡の対抗要件・譲渡制限特約・将来債権の譲渡、併存的・免責的債務引受、契約上の地位の移転
    { id: `fq-kenri-15`, name: `債権譲渡・債務引受`, cat: `kenri`, topicId: `topicL`, section: `債務不履行・契約・債権`,
      basicIds: [`basicL18`, `basicL40`],
      hits: 4, questions: 4, rank: `C`, last: `R6` },
    // 債権者代位権(登記請求権の代位を含む)と詐害行為取消権の要件・効果
    { id: `fq-kenri-16`, name: `債権者代位権・詐害行為取消権`, cat: `kenri`, topicId: `topicL`, section: `債務不履行・契約・債権`,
      basicIds: [`basicL34`],
      hits: 0, questions: 0, rank: `C`, last: null },
    // 民法の賃貸借: 修繕・必要費と有益費・賃借権の対抗力・賃貸人の地位の移転・敷金・転貸と賃借権の譲渡・原状回復・存続期間。借地借家法が中心なら fq-kenri-18/19、使用貸借は fq-kenri-28
    { id: `fq-kenri-17`, name: `賃貸借(民法)`, cat: `kenri`, topicId: `topicL`, section: `賃貸借・借地借家法`,
      basicIds: [`basicL19`, `basicL20`],
      hits: 12, questions: 9, rank: `A`, last: `R7` },
    // 借地権の存続期間・更新と正当事由・建物買取請求・借地権の対抗力(建物の登記・掲示)・借地上の建物の譲渡と裁判所の許可・定期借地権・事業用定期借地権・地代の増減
    { id: `fq-kenri-18`, name: `借地借家法(借地)`, cat: `kenri`, topicId: `topicL`, section: `賃貸借・借地借家法`,
      basicIds: [`basicE03`, `basicE04`, `basicL21`, `basicL22`],
      hits: 12, questions: 12, rank: `A`, last: `R7` },
    // 建物賃貸借の期間・更新と正当事由・解約申入れ・建物の引渡しによる対抗力・造作買取請求・借賃の増減・定期建物賃貸借・取壊し予定の建物の賃貸借
    { id: `fq-kenri-19`, name: `借地借家法(借家)`, cat: `kenri`, topicId: `topicL`, section: `賃貸借・借地借家法`,
      basicIds: [`basicA01`, `basicA05`, `basicL23`, `basicL24`],
      hits: 12, questions: 12, rank: `A`, last: `R7` },
    // 専有部分と共用部分・敷地利用権・管理者と管理組合法人・規約・集会と決議要件・建替え決議・義務違反者に対する措置・区分所有者の先取特権
    { id: `fq-kenri-20`, name: `区分所有法`, cat: `kenri`, topicId: `topicL`, section: `区分所有法`,
      basicIds: [`basicD01`, `basicD02`, `basicD05`, `basicD06`, `basicD07`, `basicL25`, `basicL36`, `basicL42`],
      hits: 12, questions: 12, rank: `A`, last: `R7` },
    // 相続人の範囲・代襲相続・法定相続分・単純承認・限定承認・相続放棄・遺産分割・相続財産の管理と清算、相続の効力(当事者の死亡と契約上の地位の承継)と親族(婚姻・離婚・親権・後見人の選任など)。遺言・遺留分・配偶者居住権は fq-kenri-22
    { id: `fq-kenri-21`, name: `相続(相続人・相続分・承認と放棄)`, cat: `kenri`, topicId: `topicL`, section: `相続`,
      basicIds: [`basicB16`, `basicL26`],
      hits: 11, questions: 12, rank: `A`, last: `R7` },
    // 遺言の方式・撤回・効力と遺贈、遺留分と遺留分侵害額請求、配偶者居住権・配偶者短期居住権
    { id: `fq-kenri-22`, name: `遺言・遺留分・配偶者居住権`, cat: `kenri`, topicId: `topicL`, section: `相続`,
      basicIds: [`basicL27`, `basicL28`],
      hits: 4, questions: 4, rank: `C`, last: `R5` },
    // 共有物の使用・保存・管理・変更・持分の処分・共有物の分割・所在等不明共有者の持分の取得と譲渡
    { id: `fq-kenri-23`, name: `共有`, cat: `kenri`, topicId: `topicL`, section: `共有・相隣関係・不法行為など`,
      basicIds: [`basicL29`],
      hits: 5, questions: 4, rank: `B`, last: `R7` },
    // 隣地の使用・境界・越境した枝と根・公道に至るための他の土地の通行権・地役権の設定と時効取得
    { id: `fq-kenri-24`, name: `相隣関係・地役権`, cat: `kenri`, topicId: `topicL`, section: `共有・相隣関係・不法行為など`,
      basicIds: [`basicE06`, `basicL30`],
      hits: 5, questions: 5, rank: `B`, last: `R5` },
    // 占有権(占有の訴え・占有の承継・即時取得・自力救済の禁止)と、物権に共通のルール(物権的請求権・混同・添付・地上権と賃借権の違い)、所有者不明土地・建物と管理不全土地・建物の管理命令
    { id: `fq-kenri-25`, name: `占有・物権の共通ルール・所有者不明土地等の管理`, cat: `kenri`, topicId: `topicL`, section: `共有・相隣関係・不法行為など`,
      basicIds: [`basicL38`],
      hits: 4, questions: 3, rank: `C`, last: `R6` },
    // 一般の不法行為・使用者責任・工作物責任・共同不法行為・過失相殺・損害賠償請求権の期間
    { id: `fq-kenri-26`, name: `不法行為`, cat: `kenri`, topicId: `topicL`, section: `共有・相隣関係・不法行為など`,
      basicIds: [`basicL31`],
      hits: 5, questions: 4, rank: `B`, last: `R6` },
    // 請負人の担保責任・報酬・注文者の解除と、委任の善管注意義務・報酬・解除・終了。寄託・雇用を含む
    { id: `fq-kenri-27`, name: `請負・委任`, cat: `kenri`, topicId: `topicL`, section: `共有・相隣関係・不法行為など`,
      basicIds: [`basicL32`],
      hits: 7, questions: 6, rank: `B`, last: `R6` },
    // 贈与・使用貸借・消費貸借など上のテーマにない契約と、事務管理・不当利得
    { id: `fq-kenri-28`, name: `贈与・使用貸借・消費貸借など`, cat: `kenri`, topicId: `topicL`, section: `共有・相隣関係・不法行為など`,
      basicIds: [`basicL35`],
      hits: 7, questions: 5, rank: `B`, last: `R7` },
    // 意思能力・公序良俗・無効と取消しの一般(追認・取消権の期間)・条件と期限・期間の計算・失踪宣告と不在者の財産管理など総則の規定と、契約の成立(申込みと承諾・意思表示の到達)。個々の意思表示の問題は fq-kenri-01
    { id: `fq-kenri-29`, name: `法律行為の総則(無効・取消し・条件)`, cat: `kenri`, topicId: `topicL`, section: `債務不履行・契約・債権`,
      basicIds: [`basicL39`],
      hits: 6, questions: 7, rank: `B`, last: `R6` },
    // ---- 法令上の制限
    // 都市計画区域・準都市計画区域の指定と、市街化区域・市街化調整区域(区域区分)の定め方
    { id: `fq-horei-01`, name: `都市計画区域と区域区分`, cat: `horei`, topicId: `topicJ`, section: `都市計画法`,
      basicIds: [`basicJ13`, `basicJ04`],
      hits: 4, questions: 1, rank: `C`, last: `R6` },
    // 用途地域と補助的地域地区(特別用途地区・高度地区・高度利用地区・特定街区・景観地区など)の都市計画で定める内容。建築物への具体的な制限は建築基準法の各テーマ
    { id: `fq-horei-02`, name: `地域地区(用途地域など)`, cat: `horei`, topicId: `topicJ`, section: `都市計画法`,
      basicIds: [`basicJ01`, `basicJ14`],
      hits: 10, questions: 8, rank: `A`, last: `R7` },
    // 地区計画の内容(地区整備計画・再開発等促進区など)と区域内の行為の届出・勧告
    { id: `fq-horei-03`, name: `地区計画`, cat: `horei`, topicId: `topicJ`, section: `都市計画法`,
      basicIds: [`basicJ15`],
      hits: 6, questions: 2, rank: `B`, last: `R6` },
    // 都道府県と市町村の決定権限と手続、都市施設・市街地開発事業(等予定区域)を定める区域と定める内容(施行予定者など)、都市計画施設等の区域内・都市計画事業地内の建築等の制限と先買い
    { id: `fq-horei-04`, name: `都市計画の決定手続・都市施設と都市計画事業`, cat: `horei`, topicId: `topicJ`, section: `都市計画法`,
      basicIds: [`basicJ16`, `basicJ21`],
      hits: 5, questions: 1, rank: `B`, last: `R6` },
    // 開発行為の定義、区域ごとに許可が必要な規模、許可が要らない開発行為(農林漁業用・公益上必要な建築物・都市計画事業など)
    { id: `fq-horei-05`, name: `開発許可の要否`, cat: `horei`, topicId: `topicJ`, section: `開発許可`,
      basicIds: [`basicJ05`, `basicJ17`, `basicJ18`],
      hits: 8, questions: 8, rank: `B`, last: `R7` },
    // 許可申請と公共施設管理者の同意・許可基準・変更の許可・工事完了公告前後の建築制限・市街化調整区域の開発区域以外での建築制限・地位の承継
    { id: `fq-horei-06`, name: `開発許可の手続・許可後の制限`, cat: `horei`, topicId: `topicJ`, section: `開発許可`,
      basicIds: [`basicJ19`, `basicJ20`],
      hits: 8, questions: 4, rank: `B`, last: `R7` },
    // 適用除外・既存不適格・建築確認の対象と手続・検査、単体規定(採光・換気・避雷設備・昇降機・石綿など)
    { id: `fq-horei-07`, name: `建築基準法(建築確認・単体規定)`, cat: `horei`, topicId: `topicJ`, section: `建築基準法`,
      basicIds: [`basicJ37`, `basicJ22`, `basicJ27`],
      hits: 12, questions: 11, rank: `A`, last: `R7` },
    // 建築基準法上の道路・2項道路・接道義務と条例の付加・道路内の建築制限・私道の変更や廃止の制限
    { id: `fq-horei-08`, name: `建築基準法(道路・接道義務)`, cat: `horei`, topicId: `topicJ`, section: `建築基準法`,
      basicIds: [`basicE08`, `basicJ23`],
      hits: 8, questions: 1, rank: `B`, last: `R5` },
    // 用途地域ごとに建てられる建築物と、敷地が2以上の用途地域にわたる場合の扱い
    { id: `fq-horei-09`, name: `建築基準法(用途制限)`, cat: `horei`, topicId: `topicJ`, section: `建築基準法`,
      basicIds: [`basicJ24`],
      hits: 11, questions: 3, rank: `A`, last: `R7` },
    // 建蔽率・容積率の計算と緩和・敷地面積の最低限度、防火地域・準防火地域内の建築物の制限(屋根・外壁・区域にまたがる場合)
    { id: `fq-horei-10`, name: `建築基準法(建蔽率・容積率・防火地域)`, cat: `horei`, topicId: `topicJ`, section: `建築基準法`,
      basicIds: [`basicJ02`, `basicJ03`, `basicJ12`, `basicJ25`],
      hits: 12, questions: 6, rank: `A`, last: `R7` },
    // 道路斜線・隣地斜線・北側斜線・日影規制と、低層住居専用地域等の絶対高さ・外壁の後退距離
    { id: `fq-horei-11`, name: `建築基準法(高さ制限)`, cat: `horei`, topicId: `topicJ`, section: `建築基準法`,
      basicIds: [`basicJ10`, `basicJ11`, `basicJ26`],
      hits: 9, questions: 3, rank: `A`, last: `R7` },
    // 宅地造成等工事規制区域・特定盛土等規制区域での許可と届出・検査・定期報告・造成宅地防災区域・土地所有者等の責務
    { id: `fq-horei-12`, name: `盛土規制法`, cat: `horei`, topicId: `topicJ`, section: `盛土規制法・その他の法令`,
      basicIds: [`basicJ31`, `basicJ35`],
      hits: 12, questions: 12, rank: `A`, last: `R7` },
    // 施行者と土地区画整理組合・換地計画・仮換地の指定と効果・換地処分とその効果・清算金・保留地・施行地区内の建築行為等の制限
    { id: `fq-horei-13`, name: `土地区画整理法`, cat: `horei`, topicId: `topicJ`, section: `土地区画整理法`,
      basicIds: [`basicJ29`, `basicJ30`, `basicJ36`],
      hits: 12, questions: 12, rank: `A`, last: `R7` },
    // 農地・採草放牧地の判断、3条・4条・5条の許可と許可権者、市街化区域内の届出の特例、違反の効果、農地の賃貸借
    { id: `fq-horei-14`, name: `農地法`, cat: `horei`, topicId: `topicJ`, section: `農地法`,
      basicIds: [`basicJ06`, `basicJ07`, `basicJ08`, `basicJ33`],
      hits: 12, questions: 12, rank: `A`, last: `R7` },
    // 事後届出(届出が必要な取引・面積・期限・勧告)と、注視区域・監視区域の事前届出、規制区域の許可
    { id: `fq-horei-15`, name: `国土利用計画法`, cat: `horei`, topicId: `topicJ`, section: `国土利用計画法`,
      basicIds: [`basicJ09`, `basicJ34`, `basicJ28`],
      hits: 12, questions: 11, rank: `A`, last: `R7` },
    // 生産緑地法・土壌汚染対策法・景観法・道路法・河川法など、上の各テーマにない法令の許可・届出
    { id: `fq-horei-16`, name: `その他の法令による制限`, cat: `horei`, topicId: `topicJ`, section: `盛土規制法・その他の法令`,
      basicIds: [`basicJ32`],
      hits: 2, questions: 1, rank: `C`, last: `R5` },
    // ---- 税・価格の評定
    // 課税客体と納税義務者・課税標準・税率・免税点・非課税・住宅と住宅用土地の特例・宅地の課税標準の特例
    { id: `fq-zei-01`, name: `不動産取得税`, cat: `zei`, topicId: `topicH`, section: `不動産取得税`,
      basicIds: [`basicB05`, `basicH15`, `basicH16`, `basicH17`],
      hits: 6, questions: 6, rank: `B`, last: `R6` },
    // 納税義務者・賦課期日・税率・免税点・住宅用地の特例・新築住宅の減額・縦覧と審査の申出・徴収方法と都市計画税
    { id: `fq-zei-02`, name: `固定資産税(都市計画税を含む)`, cat: `zei`, topicId: `topicH`, section: `固定資産税`,
      basicIds: [`basicB04`, `basicH18`, `basicH19`, `basicH20`, `basicH21`, `basicH32`],
      hits: 6, questions: 6, rank: `B`, last: `R7` },
    // 課税標準・税率と、住宅用家屋の所有権保存・移転登記や抵当権設定登記の軽減税率の要件
    { id: `fq-zei-03`, name: `登録免許税`, cat: `zei`, topicId: `topicH`, section: `登録免許税・印紙税`,
      basicIds: [`basicB06`, `basicH22`],
      hits: 4, questions: 4, rank: `C`, last: `R7` },
    // 課税文書と非課税文書・記載金額・納税義務者・過怠税・不動産譲渡契約書の軽減税率
    { id: `fq-zei-04`, name: `印紙税`, cat: `zei`, topicId: `topicH`, section: `登録免許税・印紙税`,
      basicIds: [`basicB08`, `basicH23`, `basicH24`],
      hits: 4, questions: 4, rank: `C`, last: `R5` },
    // 所得税法の譲渡所得(取得費・譲渡所得の特別控除50万円・長期譲渡所得の2分の1・借地権の設定の対価など)と、土地建物の譲渡所得の分離課税(長期・短期)、居住用財産の3,000万円控除・軽減税率・買換え特例・譲渡損失の特例・収用等の特例と特例どうしの併用。住宅ローン控除が中心なら fq-zei-06
    { id: `fq-zei-05`, name: `所得税(譲渡所得)`, cat: `zei`, topicId: `topicH`, section: `譲渡所得`,
      basicIds: [`basicH01`, `basicH02`, `basicH03`, `basicH04`, `basicH05`, `basicH25`, `basicH26`, `basicH33`],
      hits: 3, questions: 3, rank: `C`, last: `R3-10` },
    // 住宅借入金等特別控除の対象となる住宅・借入れ・控除額と期間・適用要件と、譲渡の特例との重複適用の制限
    { id: `fq-zei-06`, name: `住宅ローン控除`, cat: `zei`, topicId: `topicH`, section: `住宅ローン控除`,
      basicIds: [`basicC05`, `basicH27`],
      hits: 1, questions: 1, rank: `C`, last: `R6` },
    // 住宅取得等資金の贈与の非課税と相続時精算課税制度
    { id: `fq-zei-07`, name: `贈与税の特例`, cat: `zei`, topicId: `topicH`, section: `相続税・贈与税`,
      basicIds: [`basicH08`, `basicH28`],
      hits: 0, questions: 0, rank: `C`, last: null },
    // 標準地の選定・正常な価格・公示の手続・公示価格の効力・土地鑑定委員会。最新の地価の動きは fq-menjo-03
    { id: `fq-zei-08`, name: `地価公示法`, cat: `zei`, topicId: `topicH`, section: `地価公示・鑑定評価`,
      basicIds: [`basicF08`, `basicH29`],
      hits: 5, questions: 5, rank: `B`, last: `R4` },
    // 価格の種類・価格形成要因・最有効使用・地域分析と個別分析・原価法・取引事例比較法・収益還元法・賃料の鑑定評価
    { id: `fq-zei-09`, name: `不動産鑑定評価基準`, cat: `zei`, topicId: `topicH`, section: `地価公示・鑑定評価`,
      basicIds: [`basicF06`, `basicH30`, `basicH31`, `basicH34`],
      hits: 7, questions: 7, rank: `B`, last: `R7` },
    // ---- 5問免除科目
    // 証券化支援業務(買取型・保証型)・フラット35・直接融資・団体信用生命保険・業務の委託など機構の業務
    { id: `fq-menjo-01`, name: `住宅金融支援機構`, cat: `menjo`, topicId: `topicN`, section: `住宅金融支援機構`,
      basicIds: [`basicN01`, `basicN02`, `basicN03`, `basicN20`, `basicC04`],
      hits: 12, questions: 12, rank: `A`, last: `R7` },
    // 景品表示法と表示規約(交通・距離・面積・価格・写真・特定用語・二重価格・おとり広告・特定事項の明示)と景品規約。宅建業法32条の誇大広告は fq-gyoho-11
    { id: `fq-menjo-02`, name: `景品表示法(公正競争規約)`, cat: `menjo`, topicId: `topicN`, section: `景品表示法・公正競争規約`,
      basicIds: [`basicN04`, `basicN05`, `basicA12`, `basicN06`, `basicN07`, `basicN08`, `basicN09`, `basicN10`],
      hits: 12, questions: 12, rank: `A`, last: `R7` },
    // 地価公示・地価調査の動き・住宅着工・法人企業統計・宅建業者数・土地取引件数など最新統計の数値。地価公示の制度そのものは fq-zei-08
    { id: `fq-menjo-03`, name: `統計`, cat: `menjo`, topicId: `topicN`, section: `統計`,
      basicIds: [`basicN11`, `basicN12`, `basicN13`],
      hits: 12, questions: 12, rank: `A`, last: `R7` },
    // 地形(台地・扇状地・低地・埋立地など)と宅地としての適否・災害リスク・地形図の読み方
    { id: `fq-menjo-04`, name: `土地`, cat: `menjo`, topicId: `topicN`, section: `土地`,
      basicIds: [`basicN14`, `basicN15`, `basicN18`, `basicN21`],
      hits: 12, questions: 12, rank: `A`, last: `R7` },
    // 建物の構造(木造・鉄骨造・RC造・SRC造・組積造)と材料・基礎・耐震・免震・制震・耐震基準
    { id: `fq-menjo-05`, name: `建物`, cat: `menjo`, topicId: `topicN`, section: `建物`,
      basicIds: [`basicN16`, `basicN17`, `basicN19`, `basicN22`, `basicD08`],
      hits: 12, questions: 12, rank: `A`, last: `R7` },
  ],
  quizTheme: {
    // fq-gyoho-01 宅建業の意味(免許の要否)
    'quiz-K2-001': `fq-gyoho-01`, 'quiz-K2-002': `fq-gyoho-01`, 'quiz-K2-003': `fq-gyoho-01`, 'quiz-K2-004': `fq-gyoho-01`,
    'quiz-K2-005': `fq-gyoho-01`, 'quiz-K2-006': `fq-gyoho-01`, 'quiz-K2-014': `fq-gyoho-01`, 'quiz-K4-001': `fq-gyoho-01`,
    'quiz-K4-002': `fq-gyoho-01`, 'quiz-K4-003': `fq-gyoho-01`,
    // fq-gyoho-02 免許の種類・有効期間・免許換え
    'quiz-K2-007': `fq-gyoho-02`, 'quiz-K2-008': `fq-gyoho-02`, 'quiz-K4-004': `fq-gyoho-02`, 'quiz-K4-006': `fq-gyoho-02`,
    'quiz-K5-001': `fq-gyoho-02`,
    // fq-gyoho-03 免許の基準(欠格事由)
    'quiz-K2-012': `fq-gyoho-03`, 'quiz-K2-013': `fq-gyoho-03`, 'quiz-K2-016': `fq-gyoho-03`, 'quiz-K4-007': `fq-gyoho-03`,
    'quiz-K4-008': `fq-gyoho-03`, 'quiz-K4-009': `fq-gyoho-03`, 'quiz-K5-002': `fq-gyoho-03`,
    // fq-gyoho-04 変更の届出・廃業等の届出
    'quiz-K2-009': `fq-gyoho-04`, 'quiz-K2-010': `fq-gyoho-04`, 'quiz-K2-011': `fq-gyoho-04`, 'quiz-K2-015': `fq-gyoho-04`,
    'quiz-K4-005': `fq-gyoho-04`, 'quiz-K4-010': `fq-gyoho-04`, 'quiz-K4-011': `fq-gyoho-04`,
    // fq-gyoho-05 宅建士の登録
    'quiz-K2-017': `fq-gyoho-05`, 'quiz-K2-018': `fq-gyoho-05`, 'quiz-K2-019': `fq-gyoho-05`, 'quiz-K2-024': `fq-gyoho-05`,
    'quiz-K2-025': `fq-gyoho-05`, 'quiz-K4-013': `fq-gyoho-05`, 'quiz-K4-014': `fq-gyoho-05`, 'quiz-K4-015': `fq-gyoho-05`,
    'quiz-K4-019': `fq-gyoho-05`, 'quiz-K4-021': `fq-gyoho-05`, 'quiz-K4-022': `fq-gyoho-05`, 'quiz-K5-003': `fq-gyoho-05`,
    // fq-gyoho-06 宅建士証・登録の移転
    'quiz-K2-020': `fq-gyoho-06`, 'quiz-K2-021': `fq-gyoho-06`, 'quiz-K2-022': `fq-gyoho-06`, 'quiz-K2-023': `fq-gyoho-06`,
    'quiz-K2-026': `fq-gyoho-06`, 'quiz-K4-016': `fq-gyoho-06`, 'quiz-K4-017': `fq-gyoho-06`, 'quiz-K4-018': `fq-gyoho-06`,
    'quiz-K4-020': `fq-gyoho-06`, 'quiz-K4-023': `fq-gyoho-06`,
    // fq-gyoho-07 事務所・案内所等の規制
    'quiz-K2-027': `fq-gyoho-07`, 'quiz-K2-028': `fq-gyoho-07`, 'quiz-K2-029': `fq-gyoho-07`, 'quiz-K2-030': `fq-gyoho-07`,
    'quiz-K2-031': `fq-gyoho-07`, 'quiz-K2-055': `fq-gyoho-07`, 'quiz-K4-024': `fq-gyoho-07`, 'quiz-K4-025': `fq-gyoho-07`,
    'quiz-K4-026': `fq-gyoho-07`, 'quiz-K4-027': `fq-gyoho-07`, 'quiz-K4-028': `fq-gyoho-07`, 'quiz-K4-029': `fq-gyoho-07`,
    'quiz-K5-007': `fq-gyoho-07`, 'quiz-K5-022': `fq-gyoho-07`,
    // fq-gyoho-08 営業保証金
    'quiz-K2-032': `fq-gyoho-08`, 'quiz-K2-033': `fq-gyoho-08`, 'quiz-K2-034': `fq-gyoho-08`, 'quiz-K2-035': `fq-gyoho-08`,
    'quiz-K2-036': `fq-gyoho-08`, 'quiz-K2-037': `fq-gyoho-08`, 'quiz-K4-030': `fq-gyoho-08`, 'quiz-K4-031': `fq-gyoho-08`,
    'quiz-K4-032': `fq-gyoho-08`, 'quiz-K4-034': `fq-gyoho-08`, 'quiz-K5-004': `fq-gyoho-08`,
    // fq-gyoho-09 保証協会(弁済業務保証金)
    'quiz-K2-038': `fq-gyoho-09`, 'quiz-K2-039': `fq-gyoho-09`, 'quiz-K2-040': `fq-gyoho-09`, 'quiz-K2-041': `fq-gyoho-09`,
    'quiz-K2-042': `fq-gyoho-09`, 'quiz-K2-043': `fq-gyoho-09`, 'quiz-K4-033': `fq-gyoho-09`, 'quiz-K4-035': `fq-gyoho-09`,
    'quiz-K4-036': `fq-gyoho-09`, 'quiz-K4-037': `fq-gyoho-09`, 'quiz-K4-038': `fq-gyoho-09`, 'quiz-K4-039': `fq-gyoho-09`,
    'quiz-K4-040': `fq-gyoho-09`, 'quiz-K5-005': `fq-gyoho-09`, 'quiz-K5-006': `fq-gyoho-09`,
    // fq-gyoho-10 媒介契約
    'quiz-K-13': `fq-gyoho-10`, 'quiz-K2-044': `fq-gyoho-10`, 'quiz-K2-045': `fq-gyoho-10`, 'quiz-K2-046': `fq-gyoho-10`,
    'quiz-K2-047': `fq-gyoho-10`, 'quiz-K2-048': `fq-gyoho-10`, 'quiz-K2-049': `fq-gyoho-10`, 'quiz-P2-001': `fq-gyoho-10`,
    'quiz-P2-002': `fq-gyoho-10`, 'quiz-P2-003': `fq-gyoho-10`, 'quiz-K4-041': `fq-gyoho-10`, 'quiz-K4-042': `fq-gyoho-10`,
    'quiz-K4-043': `fq-gyoho-10`, 'quiz-K4-044': `fq-gyoho-10`, 'quiz-K4-045': `fq-gyoho-10`, 'quiz-K4-046': `fq-gyoho-10`,
    'quiz-K4-047': `fq-gyoho-10`, 'quiz-K4-048': `fq-gyoho-10`, 'quiz-K4-049': `fq-gyoho-10`, 'quiz-K4-050': `fq-gyoho-10`,
    'quiz-K4-051': `fq-gyoho-10`, 'quiz-K5-008': `fq-gyoho-10`, 'quiz-K5-009': `fq-gyoho-10`, 'quiz-K5-010': `fq-gyoho-10`,
    // fq-gyoho-11 広告の規制(誇大広告・取引態様)
    'quiz-K2-050': `fq-gyoho-11`, 'quiz-K2-051': `fq-gyoho-11`, 'quiz-K4-052': `fq-gyoho-11`, 'quiz-K4-053': `fq-gyoho-11`,
    'quiz-K4-056': `fq-gyoho-11`, 'quiz-K5-011': `fq-gyoho-11`,
    // fq-gyoho-12 広告開始時期・契約締結時期の制限
    'quiz-K4-054': `fq-gyoho-12`, 'quiz-K4-055': `fq-gyoho-12`,
    // fq-gyoho-13 重要事項の説明の方法(IT重説)と書面の電磁的提供
    'quiz-K2-062': `fq-gyoho-13`, 'quiz-K2-063': `fq-gyoho-13`, 'quiz-K2-074': `fq-gyoho-13`, 'quiz-K2-075': `fq-gyoho-13`,
    'quiz-A2-005': `fq-gyoho-13`, 'quiz-K4-079': `fq-gyoho-13`, 'quiz-K5-017': `fq-gyoho-13`,
    // fq-gyoho-14 重要事項の説明(説明事項)
    'quiz-K2-064': `fq-gyoho-14`, 'quiz-K2-065': `fq-gyoho-14`, 'quiz-K2-066': `fq-gyoho-14`, 'quiz-K2-067': `fq-gyoho-14`,
    'quiz-K2-068': `fq-gyoho-14`, 'quiz-K2-069': `fq-gyoho-14`, 'quiz-K2-070': `fq-gyoho-14`, 'quiz-K2-071': `fq-gyoho-14`,
    'quiz-K2-072': `fq-gyoho-14`, 'quiz-K2-073': `fq-gyoho-14`, 'quiz-K4-061': `fq-gyoho-14`, 'quiz-K4-062': `fq-gyoho-14`,
    'quiz-K4-063': `fq-gyoho-14`, 'quiz-K4-064': `fq-gyoho-14`, 'quiz-K4-065': `fq-gyoho-14`, 'quiz-K4-066': `fq-gyoho-14`,
    'quiz-K4-067': `fq-gyoho-14`, 'quiz-K4-068': `fq-gyoho-14`, 'quiz-K4-069': `fq-gyoho-14`, 'quiz-K4-070': `fq-gyoho-14`,
    'quiz-K4-071': `fq-gyoho-14`, 'quiz-K4-072': `fq-gyoho-14`, 'quiz-K4-073': `fq-gyoho-14`, 'quiz-K4-074': `fq-gyoho-14`,
    'quiz-K4-075': `fq-gyoho-14`, 'quiz-K5-013': `fq-gyoho-14`, 'quiz-K5-014': `fq-gyoho-14`, 'quiz-K5-015': `fq-gyoho-14`,
    'quiz-K5-016': `fq-gyoho-14`,
    // fq-gyoho-15 37条書面
    'quiz-K2-076': `fq-gyoho-15`, 'quiz-K2-077': `fq-gyoho-15`, 'quiz-K2-078': `fq-gyoho-15`, 'quiz-K2-079': `fq-gyoho-15`,
    'quiz-K2-080': `fq-gyoho-15`, 'quiz-K2-081': `fq-gyoho-15`, 'quiz-K2-082': `fq-gyoho-15`, 'quiz-K2-083': `fq-gyoho-15`,
    'quiz-K4-076': `fq-gyoho-15`, 'quiz-K4-077': `fq-gyoho-15`, 'quiz-K4-078': `fq-gyoho-15`, 'quiz-K4-080': `fq-gyoho-15`,
    'quiz-K4-081': `fq-gyoho-15`, 'quiz-K4-082': `fq-gyoho-15`, 'quiz-K4-083': `fq-gyoho-15`, 'quiz-K4-084': `fq-gyoho-15`,
    'quiz-K4-085': `fq-gyoho-15`, 'quiz-K4-086': `fq-gyoho-15`, 'quiz-K5-018': `fq-gyoho-15`, 'quiz-K5-019': `fq-gyoho-15`,
    'quiz-K5-020': `fq-gyoho-15`,
    // fq-gyoho-16 報酬
    'quiz-K-15': `fq-gyoho-16`, 'quiz-K-16': `fq-gyoho-16`, 'quiz-K2-102': `fq-gyoho-16`, 'quiz-K2-103': `fq-gyoho-16`,
    'quiz-K2-104': `fq-gyoho-16`, 'quiz-K2-105': `fq-gyoho-16`, 'quiz-K2-106': `fq-gyoho-16`, 'quiz-K2-107': `fq-gyoho-16`,
    'quiz-K2-108': `fq-gyoho-16`, 'quiz-K2-109': `fq-gyoho-16`, 'quiz-K4-103': `fq-gyoho-16`, 'quiz-K4-104': `fq-gyoho-16`,
    'quiz-K4-105': `fq-gyoho-16`, 'quiz-K4-106': `fq-gyoho-16`, 'quiz-K4-107': `fq-gyoho-16`, 'quiz-K4-108': `fq-gyoho-16`,
    'quiz-K4-109': `fq-gyoho-16`, 'quiz-K4-110': `fq-gyoho-16`, 'quiz-K5-030': `fq-gyoho-16`, 'quiz-K5-031': `fq-gyoho-16`,
    'quiz-K5-032': `fq-gyoho-16`, 'quiz-K5-033': `fq-gyoho-16`,
    // fq-gyoho-17 クーリング・オフ
    'quiz-K2-084': `fq-gyoho-17`, 'quiz-K2-085': `fq-gyoho-17`, 'quiz-K2-086': `fq-gyoho-17`, 'quiz-K2-087': `fq-gyoho-17`,
    'quiz-K2-088': `fq-gyoho-17`, 'quiz-K2-089': `fq-gyoho-17`, 'quiz-K4-087': `fq-gyoho-17`, 'quiz-K4-088': `fq-gyoho-17`,
    'quiz-K4-089': `fq-gyoho-17`, 'quiz-K4-090': `fq-gyoho-17`, 'quiz-K5-021': `fq-gyoho-17`,
    // fq-gyoho-18 手付金等の保全措置
    'quiz-K-17': `fq-gyoho-18`, 'quiz-K2-093': `fq-gyoho-18`, 'quiz-K2-094': `fq-gyoho-18`, 'quiz-K2-095': `fq-gyoho-18`,
    'quiz-K4-092': `fq-gyoho-18`, 'quiz-K4-093': `fq-gyoho-18`, 'quiz-K4-095': `fq-gyoho-18`, 'quiz-K4-101': `fq-gyoho-18`,
    'quiz-K4-102': `fq-gyoho-18`, 'quiz-K5-024': `fq-gyoho-18`, 'quiz-K5-025': `fq-gyoho-18`,
    // fq-gyoho-19 損害賠償額の予定・手付の制限
    'quiz-K2-090': `fq-gyoho-19`, 'quiz-K2-091': `fq-gyoho-19`, 'quiz-K2-092': `fq-gyoho-19`, 'quiz-K4-091': `fq-gyoho-19`,
    'quiz-K4-100': `fq-gyoho-19`, 'quiz-K5-023': `fq-gyoho-19`,
    // fq-gyoho-20 自己の所有に属しない物件の契約制限
    'quiz-K2-098': `fq-gyoho-20`, 'quiz-K2-100': `fq-gyoho-20`, 'quiz-K4-094': `fq-gyoho-20`, 'quiz-K5-027': `fq-gyoho-20`,
    // fq-gyoho-21 契約不適合責任の特約の制限
    'quiz-K-19': `fq-gyoho-21`, 'quiz-K2-097': `fq-gyoho-21`, 'quiz-K4-096': `fq-gyoho-21`, 'quiz-K4-097': `fq-gyoho-21`,
    'quiz-K5-026': `fq-gyoho-21`,
    // fq-gyoho-22 割賦販売・所有権留保などの制限
    'quiz-K2-099': `fq-gyoho-22`, 'quiz-K4-098': `fq-gyoho-22`, 'quiz-K5-028': `fq-gyoho-22`,
    // fq-gyoho-23 8種制限の総合(適用場面)
    'quiz-K2-096': `fq-gyoho-23`, 'quiz-K2-101': `fq-gyoho-23`, 'quiz-P2-004': `fq-gyoho-23`, 'quiz-K4-099': `fq-gyoho-23`,
    'quiz-K5-029': `fq-gyoho-23`,
    // fq-gyoho-24 その他の業務上の規制
    'quiz-K2-052': `fq-gyoho-24`, 'quiz-K2-053': `fq-gyoho-24`, 'quiz-K2-054': `fq-gyoho-24`, 'quiz-K2-056': `fq-gyoho-24`,
    'quiz-A2-001': `fq-gyoho-24`, 'quiz-K4-057': `fq-gyoho-24`, 'quiz-K4-058': `fq-gyoho-24`, 'quiz-K4-059': `fq-gyoho-24`,
    'quiz-K4-060': `fq-gyoho-24`, 'quiz-K5-012': `fq-gyoho-24`,
    // fq-gyoho-25 監督処分・罰則
    'quiz-K-20': `fq-gyoho-25`, 'quiz-K2-110': `fq-gyoho-25`, 'quiz-K2-111': `fq-gyoho-25`, 'quiz-K2-112': `fq-gyoho-25`,
    'quiz-K2-113': `fq-gyoho-25`, 'quiz-K2-114': `fq-gyoho-25`, 'quiz-K2-115': `fq-gyoho-25`, 'quiz-K4-012': `fq-gyoho-25`,
    'quiz-K4-111': `fq-gyoho-25`, 'quiz-K4-112': `fq-gyoho-25`, 'quiz-K4-113': `fq-gyoho-25`, 'quiz-K4-114': `fq-gyoho-25`,
    'quiz-K4-115': `fq-gyoho-25`, 'quiz-K4-116': `fq-gyoho-25`, 'quiz-K5-034': `fq-gyoho-25`, 'quiz-K5-035': `fq-gyoho-25`,
    // fq-gyoho-26 住宅瑕疵担保履行法
    'quiz-K2-061': `fq-gyoho-26`, 'quiz-K2-116': `fq-gyoho-26`, 'quiz-K2-117': `fq-gyoho-26`, 'quiz-K2-118': `fq-gyoho-26`,
    'quiz-K2-119': `fq-gyoho-26`, 'quiz-K4-117': `fq-gyoho-26`, 'quiz-K4-118': `fq-gyoho-26`, 'quiz-K4-119': `fq-gyoho-26`,
    'quiz-K4-120': `fq-gyoho-26`, 'quiz-K5-036': `fq-gyoho-26`,
    // fq-kenri-01 意思表示
    'quiz-L2-001': `fq-kenri-01`, 'quiz-L2-002': `fq-kenri-01`, 'quiz-L4-001': `fq-kenri-01`, 'quiz-L4-003': `fq-kenri-01`,
    // fq-kenri-02 制限行為能力者
    'quiz-L2-004': `fq-kenri-02`, 'quiz-L2-005': `fq-kenri-02`, 'quiz-L4-002': `fq-kenri-02`,
    // fq-kenri-03 代理
    'quiz-L2-006': `fq-kenri-03`, 'quiz-L2-007': `fq-kenri-03`, 'quiz-L2-008': `fq-kenri-03`, 'quiz-L4-005': `fq-kenri-03`,
    'quiz-L5-001': `fq-kenri-03`,
    // fq-kenri-04 時効
    'quiz-L2-009': `fq-kenri-04`, 'quiz-L2-010': `fq-kenri-04`, 'quiz-L4-006': `fq-kenri-04`, 'quiz-L4-007': `fq-kenri-04`,
    'quiz-L4-008': `fq-kenri-04`, 'quiz-L5-002': `fq-kenri-04`,
    // fq-kenri-05 物権変動と登記(対抗要件)
    'quiz-L2-011': `fq-kenri-05`, 'quiz-L2-012': `fq-kenri-05`, 'quiz-L2-013': `fq-kenri-05`, 'quiz-L2-014': `fq-kenri-05`,
    'quiz-L4-009': `fq-kenri-05`,
    // fq-kenri-06 不動産登記法
    'quiz-L2-056': `fq-kenri-06`, 'quiz-L2-057': `fq-kenri-06`, 'quiz-L2-058': `fq-kenri-06`, 'quiz-L2-059': `fq-kenri-06`,
    'quiz-L2-060': `fq-kenri-06`, 'quiz-Q2-001': `fq-kenri-06`, 'quiz-L4-055': `fq-kenri-06`, 'quiz-L4-056': `fq-kenri-06`,
    'quiz-L4-057': `fq-kenri-06`, 'quiz-L4-058': `fq-kenri-06`, 'quiz-L4-059': `fq-kenri-06`, 'quiz-L4-060': `fq-kenri-06`,
    'quiz-L5-007': `fq-kenri-06`,
    // fq-kenri-07 抵当権
    'quiz-L2-019': `fq-kenri-07`, 'quiz-L2-020': `fq-kenri-07`, 'quiz-L4-016': `fq-kenri-07`, 'quiz-L4-017': `fq-kenri-07`,
    'quiz-L4-018': `fq-kenri-07`, 'quiz-L4-019': `fq-kenri-07`, 'quiz-L5-003': `fq-kenri-07`,
    // fq-kenri-08 根抵当権
    'quiz-L4-020': `fq-kenri-08`,
    // fq-kenri-09 留置権・先取特権・質権
    'quiz-L2-021': `fq-kenri-09`, 'quiz-L4-014': `fq-kenri-09`, 'quiz-L4-015': `fq-kenri-09`,
    // fq-kenri-10 保証
    'quiz-L2-022': `fq-kenri-10`, 'quiz-L2-023': `fq-kenri-10`, 'quiz-A2-003': `fq-kenri-10`, 'quiz-L4-021': `fq-kenri-10`,
    // fq-kenri-12 債務不履行・解除
    'quiz-L2-024': `fq-kenri-12`, 'quiz-L2-025': `fq-kenri-12`, 'quiz-L4-022': `fq-kenri-12`, 'quiz-L4-023': `fq-kenri-12`,
    // fq-kenri-13 売買(契約不適合責任・手付)
    'quiz-L2-026': `fq-kenri-13`, 'quiz-L2-027': `fq-kenri-13`, 'quiz-L2-028': `fq-kenri-13`, 'quiz-B2-002': `fq-kenri-13`,
    'quiz-B2-004': `fq-kenri-13`, 'quiz-L4-026': `fq-kenri-13`, 'quiz-L4-027': `fq-kenri-13`, 'quiz-L4-028': `fq-kenri-13`,
    // fq-kenri-14 弁済・相殺
    'quiz-L2-031': `fq-kenri-14`, 'quiz-L4-024': `fq-kenri-14`,
    // fq-kenri-15 債権譲渡・債務引受
    'quiz-L2-032': `fq-kenri-15`, 'quiz-L4-025': `fq-kenri-15`,
    // fq-kenri-16 債権者代位権・詐害行為取消権
    'quiz-L2-029': `fq-kenri-16`, 'quiz-L2-030': `fq-kenri-16`,
    // fq-kenri-17 賃貸借(民法)
    'quiz-L2-033': `fq-kenri-17`, 'quiz-L2-034': `fq-kenri-17`, 'quiz-A2-006': `fq-kenri-17`, 'quiz-A2-010': `fq-kenri-17`,
    'quiz-A2-015': `fq-kenri-17`, 'quiz-L4-029': `fq-kenri-17`, 'quiz-L4-030': `fq-kenri-17`, 'quiz-L4-047': `fq-kenri-17`,
    'quiz-L5-004': `fq-kenri-17`,
    // fq-kenri-18 借地借家法(借地)
    'quiz-L2-046': `fq-kenri-18`, 'quiz-L2-047': `fq-kenri-18`, 'quiz-L2-048': `fq-kenri-18`, 'quiz-L2-049': `fq-kenri-18`,
    'quiz-L4-041': `fq-kenri-18`, 'quiz-L4-042': `fq-kenri-18`, 'quiz-L4-043': `fq-kenri-18`, 'quiz-L4-044': `fq-kenri-18`,
    // fq-kenri-19 借地借家法(借家)
    'quiz-L2-050': `fq-kenri-19`, 'quiz-L2-051': `fq-kenri-19`, 'quiz-L2-052': `fq-kenri-19`, 'quiz-A2-002': `fq-kenri-19`,
    'quiz-A2-007': `fq-kenri-19`, 'quiz-A2-008': `fq-kenri-19`, 'quiz-L4-045': `fq-kenri-19`, 'quiz-L4-046': `fq-kenri-19`,
    'quiz-L4-048': `fq-kenri-19`, 'quiz-adv-08r': `fq-kenri-19`,
    // fq-kenri-20 区分所有法
    'quiz-L2-053': `fq-kenri-20`, 'quiz-L2-054': `fq-kenri-20`, 'quiz-L2-055': `fq-kenri-20`, 'quiz-L4-049': `fq-kenri-20`,
    'quiz-L4-050': `fq-kenri-20`, 'quiz-L4-051': `fq-kenri-20`, 'quiz-L4-052': `fq-kenri-20`, 'quiz-L4-053': `fq-kenri-20`,
    'quiz-L4-054': `fq-kenri-20`, 'quiz-L5-006': `fq-kenri-20`, 'quiz-L5-008': `fq-kenri-20`, 'quiz-adv-07r': `fq-kenri-20`,
    // fq-kenri-21 相続(相続人・相続分・承認と放棄)
    'quiz-L2-041': `fq-kenri-21`, 'quiz-L2-042': `fq-kenri-21`, 'quiz-L2-043': `fq-kenri-21`, 'quiz-Q2-002': `fq-kenri-21`,
    'quiz-L4-034': `fq-kenri-21`, 'quiz-L4-035': `fq-kenri-21`, 'quiz-L4-036': `fq-kenri-21`, 'quiz-L4-037': `fq-kenri-21`,
    'quiz-L5-005': `fq-kenri-21`,
    // fq-kenri-22 遺言・遺留分・配偶者居住権
    'quiz-L2-044': `fq-kenri-22`, 'quiz-L2-045': `fq-kenri-22`, 'quiz-L4-038': `fq-kenri-22`, 'quiz-L4-039': `fq-kenri-22`,
    'quiz-L4-040': `fq-kenri-22`,
    // fq-kenri-23 共有
    'quiz-L2-015': `fq-kenri-23`, 'quiz-Q2-006': `fq-kenri-23`, 'quiz-L4-011': `fq-kenri-23`,
    // fq-kenri-24 相隣関係・地役権
    'quiz-L2-016': `fq-kenri-24`, 'quiz-L4-012': `fq-kenri-24`, 'quiz-L4-013': `fq-kenri-24`,
    // fq-kenri-25 占有・物権の共通ルール・所有者不明土地等の管理
    'quiz-L2-017': `fq-kenri-25`, 'quiz-L2-018': `fq-kenri-25`, 'quiz-L4-010': `fq-kenri-25`,
    // fq-kenri-26 不法行為
    'quiz-L2-039': `fq-kenri-26`, 'quiz-L2-040': `fq-kenri-26`, 'quiz-L4-033': `fq-kenri-26`,
    // fq-kenri-27 請負・委任
    'quiz-L2-037': `fq-kenri-27`, 'quiz-L4-031': `fq-kenri-27`, 'quiz-L4-032': `fq-kenri-27`,
    // fq-kenri-28 贈与・使用貸借・消費貸借など
    'quiz-L2-035': `fq-kenri-28`, 'quiz-L2-036': `fq-kenri-28`, 'quiz-L2-038': `fq-kenri-28`,
    // fq-kenri-29 法律行為の総則(無効・取消し・条件)
    'quiz-L2-003': `fq-kenri-29`, 'quiz-L4-004': `fq-kenri-29`,
    // fq-horei-01 都市計画区域と区域区分
    'quiz-J2-001': `fq-horei-01`,
    // fq-horei-02 地域地区(用途地域など)
    'quiz-J4-002': `fq-horei-02`, 'quiz-J4-004': `fq-horei-02`, 'quiz-J4-005': `fq-horei-02`,
    // fq-horei-03 地区計画
    'quiz-J5-010': `fq-horei-03`,
    // fq-horei-04 都市計画の決定手続・都市施設と都市計画事業
    'quiz-J2-002': `fq-horei-04`, 'quiz-J2-003': `fq-horei-04`, 'quiz-J2-004': `fq-horei-04`, 'quiz-J4-001': `fq-horei-04`,
    'quiz-J4-003': `fq-horei-04`, 'quiz-J5-001': `fq-horei-04`, 'quiz-J5-002': `fq-horei-04`,
    // fq-horei-05 開発許可の要否
    'quiz-J2-005': `fq-horei-05`, 'quiz-J4-007': `fq-horei-05`, 'quiz-J4-010': `fq-horei-05`,
    // fq-horei-06 開発許可の手続・許可後の制限
    'quiz-J2-006': `fq-horei-06`, 'quiz-J2-007': `fq-horei-06`, 'quiz-J4-006': `fq-horei-06`, 'quiz-J4-008': `fq-horei-06`,
    'quiz-J4-009': `fq-horei-06`, 'quiz-J5-003': `fq-horei-06`,
    // fq-horei-07 建築基準法(建築確認・単体規定)
    'quiz-J2-008': `fq-horei-07`, 'quiz-J2-009': `fq-horei-07`, 'quiz-J2-014': `fq-horei-07`, 'quiz-J4-011': `fq-horei-07`,
    'quiz-J4-017': `fq-horei-07`, 'quiz-J4-019': `fq-horei-07`, 'quiz-J4-020': `fq-horei-07`, 'quiz-J5-004': `fq-horei-07`,
    // fq-horei-08 建築基準法(道路・接道義務)
    'quiz-J4-014': `fq-horei-08`,
    // fq-horei-09 建築基準法(用途制限)
    'quiz-J2-010': `fq-horei-09`, 'quiz-J4-012': `fq-horei-09`, 'quiz-J4-013': `fq-horei-09`,
    // fq-horei-10 建築基準法(建蔽率・容積率・防火地域)
    'quiz-J2-011': `fq-horei-10`, 'quiz-J2-012': `fq-horei-10`, 'quiz-J4-015': `fq-horei-10`, 'quiz-J4-018': `fq-horei-10`,
    'quiz-J5-005': `fq-horei-10`,
    // fq-horei-11 建築基準法(高さ制限)
    'quiz-J2-013': `fq-horei-11`, 'quiz-J4-016': `fq-horei-11`,
    // fq-horei-12 盛土規制法
    'quiz-J2-023': `fq-horei-12`, 'quiz-J2-024': `fq-horei-12`, 'quiz-J2-025': `fq-horei-12`, 'quiz-J2-026': `fq-horei-12`,
    'quiz-J4-030': `fq-horei-12`, 'quiz-J4-031': `fq-horei-12`, 'quiz-J4-032': `fq-horei-12`, 'quiz-J5-008': `fq-horei-12`,
    // fq-horei-13 土地区画整理法
    'quiz-J2-027': `fq-horei-13`, 'quiz-J2-028': `fq-horei-13`, 'quiz-J2-029': `fq-horei-13`, 'quiz-J4-033': `fq-horei-13`,
    'quiz-J4-034': `fq-horei-13`, 'quiz-J4-035': `fq-horei-13`, 'quiz-J4-036': `fq-horei-13`, 'quiz-J4-037': `fq-horei-13`,
    'quiz-J5-009': `fq-horei-13`,
    // fq-horei-14 農地法
    'quiz-J2-019': `fq-horei-14`, 'quiz-J2-020': `fq-horei-14`, 'quiz-J2-021': `fq-horei-14`, 'quiz-J2-022': `fq-horei-14`,
    'quiz-J4-025': `fq-horei-14`, 'quiz-J4-026': `fq-horei-14`, 'quiz-J4-027': `fq-horei-14`, 'quiz-J4-028': `fq-horei-14`,
    'quiz-J4-029': `fq-horei-14`, 'quiz-J5-007': `fq-horei-14`,
    // fq-horei-15 国土利用計画法
    'quiz-J2-015': `fq-horei-15`, 'quiz-J2-016': `fq-horei-15`, 'quiz-J2-017': `fq-horei-15`, 'quiz-J2-018': `fq-horei-15`,
    'quiz-J4-021': `fq-horei-15`, 'quiz-J4-022': `fq-horei-15`, 'quiz-J4-023': `fq-horei-15`, 'quiz-J4-024': `fq-horei-15`,
    'quiz-J5-006': `fq-horei-15`,
    // fq-horei-16 その他の法令による制限
    'quiz-J2-030': `fq-horei-16`, 'quiz-J4-038': `fq-horei-16`, 'quiz-J4-039': `fq-horei-16`, 'quiz-J4-040': `fq-horei-16`,
    // fq-zei-01 不動産取得税
    'quiz-H2-001': `fq-zei-01`, 'quiz-H4-001': `fq-zei-01`,
    // fq-zei-02 固定資産税(都市計画税を含む)
    'quiz-H2-002': `fq-zei-02`, 'quiz-H4-002': `fq-zei-02`,
    // fq-zei-03 登録免許税
    'quiz-H2-003': `fq-zei-03`, 'quiz-H2-004': `fq-zei-03`, 'quiz-H2-005': `fq-zei-03`, 'quiz-H4-003': `fq-zei-03`,
    // fq-zei-04 印紙税
    'quiz-H2-006': `fq-zei-04`,
    // fq-zei-05 所得税(譲渡所得)
    'quiz-H4-004': `fq-zei-05`,
    // fq-zei-08 地価公示法
    'quiz-H2-007': `fq-zei-08`, 'quiz-H2-008': `fq-zei-08`, 'quiz-H2-009': `fq-zei-08`, 'quiz-H4-005': `fq-zei-08`,
    // fq-zei-09 不動産鑑定評価基準
    'quiz-H2-010': `fq-zei-09`, 'quiz-H2-011': `fq-zei-09`, 'quiz-H2-012': `fq-zei-09`, 'quiz-H4-006': `fq-zei-09`,
    // fq-menjo-01 住宅金融支援機構
    'quiz-N2-001': `fq-menjo-01`, 'quiz-N2-002': `fq-menjo-01`, 'quiz-N2-003': `fq-menjo-01`, 'quiz-N4-001': `fq-menjo-01`,
    'quiz-N4-002': `fq-menjo-01`, 'quiz-N4-003': `fq-menjo-01`, 'quiz-N4-004': `fq-menjo-01`, 'quiz-N4-005': `fq-menjo-01`,
    'quiz-N5-001': `fq-menjo-01`,
    // fq-menjo-02 景品表示法(公正競争規約)
    'quiz-N2-004': `fq-menjo-02`, 'quiz-N2-005': `fq-menjo-02`, 'quiz-N2-006': `fq-menjo-02`, 'quiz-N2-007': `fq-menjo-02`,
    'quiz-N4-006': `fq-menjo-02`, 'quiz-N4-007': `fq-menjo-02`, 'quiz-N4-008': `fq-menjo-02`, 'quiz-N4-009': `fq-menjo-02`,
    'quiz-N4-010': `fq-menjo-02`, 'quiz-N4-011': `fq-menjo-02`, 'quiz-N4-012': `fq-menjo-02`, 'quiz-N5-002': `fq-menjo-02`,
    'quiz-N5-003': `fq-menjo-02`, 'quiz-N5-006': `fq-menjo-02`,
    // fq-menjo-03 統計
    'quiz-N2-008': `fq-menjo-03`, 'quiz-N2-009': `fq-menjo-03`, 'quiz-N2-010': `fq-menjo-03`, 'quiz-N4-013': `fq-menjo-03`,
    'quiz-N4-014': `fq-menjo-03`, 'quiz-N4-015': `fq-menjo-03`, 'quiz-N4-016': `fq-menjo-03`, 'quiz-N4-017': `fq-menjo-03`,
    // fq-menjo-04 土地
    'quiz-N2-011': `fq-menjo-04`, 'quiz-N2-012': `fq-menjo-04`, 'quiz-N2-013': `fq-menjo-04`, 'quiz-N2-014': `fq-menjo-04`,
    'quiz-N2-015': `fq-menjo-04`, 'quiz-N4-018': `fq-menjo-04`, 'quiz-N4-019': `fq-menjo-04`, 'quiz-N4-020': `fq-menjo-04`,
    'quiz-N4-021': `fq-menjo-04`, 'quiz-N4-022': `fq-menjo-04`, 'quiz-N5-004': `fq-menjo-04`,
    // fq-menjo-05 建物
    'quiz-N2-016': `fq-menjo-05`, 'quiz-N2-017': `fq-menjo-05`, 'quiz-N2-018': `fq-menjo-05`, 'quiz-N2-019': `fq-menjo-05`,
    'quiz-N2-020': `fq-menjo-05`, 'quiz-N4-023': `fq-menjo-05`, 'quiz-N4-024': `fq-menjo-05`, 'quiz-N4-025': `fq-menjo-05`,
    'quiz-N4-026': `fq-menjo-05`, 'quiz-N4-027': `fq-menjo-05`, 'quiz-N4-028': `fq-menjo-05`, 'quiz-N4-029': `fq-menjo-05`,
    'quiz-N5-005': `fq-menjo-05`,
  },
};
