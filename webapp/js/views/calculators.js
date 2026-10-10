// 不動産計算機: ローン・取得時の税・保有時の税・売却/相続の概算シミュレーター
// 税率・特例はすべて RATES に集約し、根拠条文と適用期限(2026年10月時点で確認)を画面に表示する
window.Views = window.Views || {};
window.Views.calculators = (function () {
  const VERIFIED = `2026-10-10`;

  const SRC = {
    nta7191: `https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7191.htm`,
    nta7108: `https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7108.htm`,
    nta7140: `https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7140.htm`,
    nta3208: `https://www.nta.go.jp/taxes/shiraberu/taxanswer/joto/3208.htm`,
    nta3211: `https://www.nta.go.jp/taxes/shiraberu/taxanswer/joto/3211.htm`,
    nta3302: `https://www.nta.go.jp/taxes/shiraberu/taxanswer/joto/3302.htm`,
    nta3258: `https://www.nta.go.jp/taxes/shiraberu/taxanswer/joto/3258.htm`,
    nta4124: `https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4124.htm`,
    mofR8: `https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2026/08taikou_02.htm`,
    mofR8Defense: `https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2026/08taikou_06.htm`,
    mlitFee: `https://www.mlit.go.jp/tochi_fudousan_kensetsugyo/const/content/001749923.pdf`,
    soumuR8: `https://www.soumu.go.jp/main_content/001053325.pdf`,
    soumuKotei: `https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/149767_08.html`,
    tokyoAcq: `https://www.tax.metro.tokyo.lg.jp/kazei/real_estate/fudosan`,
    kanagawaNew: `https://www.pref.kanagawa.jp/zei/kenzei/a001/b011/002.html`,
    kanagawaUsed: `https://www.pref.kanagawa.jp/zei/kenzei/a001/b011/003.html`,
    nagoyaNew: `https://www.city.nagoya.jp/kurashi/zeikin/1037356/1011931/1011940/1034716/1034717/1011949.html`,
  };

  function r(value, label, lawRef, validUntil, sourceUrl, sourceName, sourceId, note, display) {
    return { value, label, lawRef, validUntil, verifiedAt: VERIFIED, sourceUrl, sourceName, sourceId: sourceId || null, note: note || ``, display: display || null };
  }

  // 税率・特例の一覧(value は小数。validUntil は軽減措置の期限で、本則は null)
  const RATES = {
    // --- 登録免許税 ---
    regLandSaleStd: r(0.02, `土地の売買による所有権移転(本則)`, `登録免許税法 別表第一 一(二)ハ`, null, SRC.nta7191, `国税庁 No.7191`, `src18`),
    regLandSale: r(0.015, `土地の売買による所有権移転(軽減税率)`, `租税特別措置法72条1項`, `2029-03-31`, SRC.nta7191, `国税庁 No.7191`, `src18`, `令和8年度税制改正で3年延長(財務省「令和8年度税制改正の大綱」)`),
    regTransferStd: r(0.02, `建物の売買による所有権移転(本則)`, `登録免許税法 別表第一 一(二)ハ`, null, SRC.nta7191, `国税庁 No.7191`, `src18`),
    regPreserveStd: r(0.004, `所有権の保存(本則)`, `登録免許税法 別表第一 一(一)`, null, SRC.nta7191, `国税庁 No.7191`, `src18`),
    regMortgageStd: r(0.004, `抵当権の設定(本則)`, `登録免許税法 別表第一 一(五)`, null, SRC.nta7191, `国税庁 No.7191`, `src18`),
    regHousePreserve: r(0.0015, `住宅用家屋の所有権保存(軽減)`, `租税特別措置法72条の2`, `2027-03-31`, SRC.nta7191, `国税庁 No.7191`, `src18`),
    regHouseTransfer: r(0.003, `住宅用家屋の所有権移転(軽減)`, `租税特別措置法73条`, `2027-03-31`, SRC.nta7191, `国税庁 No.7191`, `src18`),
    regHouseMortgage: r(0.001, `住宅取得資金の抵当権設定(軽減)`, `租税特別措置法75条`, `2027-03-31`, SRC.nta7191, `国税庁 No.7191`, `src18`),
    regLongLife: r(0.001, `認定長期優良住宅の保存・移転(一戸建て以外の移転)`, `租税特別措置法74条`, `2027-03-31`, SRC.nta7191, `国税庁 No.7191`, `src18`),
    regLongLifeDetached: r(0.002, `認定長期優良住宅(一戸建て)の所有権移転`, `租税特別措置法74条`, `2027-03-31`, SRC.nta7191, `国税庁 No.7191`, `src18`),
    regLowCarbon: r(0.001, `認定低炭素住宅の保存・移転`, `租税特別措置法74条の2`, `2027-03-31`, SRC.nta7191, `国税庁 No.7191`, `src18`),
    regMinimum: r(1000, `登録免許税の最低税額`, `登録免許税法19条(課税標準は1,000円未満・税額は100円未満切捨て: 国税通則法118条・119条)`, null, SRC.nta7191, `国税庁 No.7191`, `src18`, ``, `1,000円`),
    // --- 不動産取得税 ---
    acqStd: r(0.04, `不動産取得税の標準税率(本則)`, `地方税法73条の15`, null, SRC.tokyoAcq, `東京都主税局 不動産取得税`, `src22`),
    acqReduced: r(0.03, `土地・住宅の税率の特例`, `地方税法附則11条の2第1項`, `2027-03-31`, SRC.tokyoAcq, `東京都主税局 不動産取得税`, `src22`, `令和6年度改正で3年延長済み(令和9年3月31日までの取得)`),
    acqLandHalf: r(0.5, `宅地評価土地の課税標準の特例`, `地方税法附則11条の5第1項`, `2027-03-31`, SRC.tokyoAcq, `東京都主税局 不動産取得税`, `src22`, `令和9年3月31日までの取得`, `価格×1/2`),
    acqNewHouseDed: r(12000000, `新築住宅の課税標準からの控除`, `地方税法73条の14第1項`, null, SRC.kanagawaNew, `神奈川県 新築住宅の軽減`, null, `床面積40㎡以上240㎡以下(令和8年4月1日以後の取得。令和8年3月31日以前は50㎡以上、戸建以外の貸家住宅は40㎡以上)`, `1,200万円`),
    acqLongLifeDed: r(13000000, `認定長期優良住宅の控除額の特例`, `地方税法附則11条8項`, `2031-03-31`, SRC.kanagawaNew, `神奈川県 新築住宅の軽減`, null, `令和8年度改正で5年延長(令和13年3月31日までの取得)`, `1,300万円`),
    acqUsedHouseDed: r(null, `既存(中古)住宅の課税標準からの控除`, `地方税法73条の14第3項`, null, SRC.kanagawaUsed, `神奈川県 中古住宅の軽減`, null, `自己居住用・床面積40㎡以上240㎡以下(令和8年3月31日以前の取得は50㎡以上)。控除額は新築時期で決まる`, `新築時期に応じて100万〜1,200万円`),
    acqLandReduction: r(45000, `住宅用土地の税額の減額`, `地方税法73条の24`, null, SRC.kanagawaNew, `神奈川県 新築住宅の軽減`, null, `45,000円と「1㎡当たり価格×住宅床面積の2倍(1戸200㎡限度)×税率」の多い方`, `45,000円 または 計算額`),
    acqExempt: r(null, `不動産取得税の免税点`, `地方税法73条の15の2`, null, `https://www.tax.metro.tokyo.lg.jp/kazei/real_estate/fudosan`, `東京都主税局 不動産取得税`, `src22`, `令和8年4月1日以後の取得: 土地16万円・家屋(建築)66万円・家屋(売買等)34万円。それ以前は10万・23万・12万円`, `土地16万円 / 建築66万円 / 売買等34万円`),
    // --- 印紙税 ---
    stampStd: r(null, `不動産売買契約書・金銭消費貸借契約書の税額(本則)`, `印紙税法 別表第一 第1号文書`, null, SRC.nta7140, `国税庁 No.7140`, null, ``, `契約金額に応じて200円〜60万円`),
    stampReduced: r(null, `不動産譲渡契約書の印紙税の軽減`, `租税特別措置法91条`, `2027-03-31`, SRC.nta7108, `国税庁 No.7108`, `src19`, `平成26年4月1日〜令和9年3月31日に作成される契約書(契約金額10万円超)`, `契約金額に応じて200円〜48万円`),
    // --- 仲介手数料 ---
    feeSale: r(null, `売買の媒介報酬の上限`, `宅地建物取引業法46条・報酬告示第二(昭和45年建設省告示第1552号)`, null, SRC.mlitFee, `国土交通省 媒介報酬規制の見直し`, `src20`, ``, `200万円以下5%・400万円以下4%・400万円超3%(税抜)`),
    feeLowCost: r(300000, `低廉な空家等(800万円以下)の売買の媒介の特例`, `報酬告示第七(令和6年7月1日施行)`, null, SRC.mlitFee, `国土交通省 媒介報酬規制の見直し`, `src20`, `媒介契約の締結時にあらかじめ説明し合意することが必要`, `30万円×1.1=33万円(税込)が上限`),
    feeLease: r(1, `貸借の媒介報酬の上限`, `報酬告示第四`, null, SRC.mlitFee, `国土交通省 媒介報酬規制の見直し`, `src20`, `居住用建物は依頼者の一方から0.5か月分以内(承諾がある場合を除く)`, `貸主・借主合計で賃料1か月分+消費税`),
    feeLongVacant: r(2, `長期の空家等の貸借の媒介の特例`, `報酬告示第九(令和6年7月1日施行)`, null, SRC.mlitFee, `国土交通省 媒介報酬規制の見直し`, `src20`, `上乗せできるのは貸主からのみ`, `合計で賃料2か月分+消費税`),
    consumptionTax: r(0.1, `消費税及び地方消費税`, `消費税法29条・地方税法72条の83`, null, SRC.mlitFee, `国土交通省 媒介報酬規制の見直し`, `src20`, `宅建業者が課税事業者の場合の税込上限`),
    // --- 固定資産税・都市計画税 ---
    ptStd: r(0.014, `固定資産税の標準税率`, `地方税法350条1項`, null, SRC.soumuKotei, `総務省 固定資産税の概要`, `src21`),
    ptCityMax: r(0.003, `都市計画税の制限税率(上限)`, `地方税法702条の4`, null, SRC.soumuKotei, `総務省 固定資産税の概要`, `src21`, `税率は0.3%を上限に市町村が条例で定める`),
    ptSmallFixed: r(1 / 6, `小規模住宅用地(200㎡以下の部分)・固定資産税`, `地方税法349条の3の2第2項`, null, SRC.soumuKotei, `総務省 固定資産税の概要`, `src21`, ``, `評価額×1/6`),
    ptGeneralFixed: r(1 / 3, `一般住宅用地(200㎡超の部分)・固定資産税`, `地方税法349条の3の2第1項`, null, SRC.soumuKotei, `総務省 固定資産税の概要`, `src21`, `住宅用地全体で家屋の床面積の10倍が限度`, `評価額×1/3`),
    ptSmallCity: r(1 / 3, `小規模住宅用地・都市計画税`, `地方税法702条の3第2項`, null, SRC.soumuKotei, `総務省 固定資産税の概要`, `src21`, ``, `評価額×1/3`),
    ptGeneralCity: r(2 / 3, `一般住宅用地・都市計画税`, `地方税法702条の3第1項`, null, SRC.soumuKotei, `総務省 固定資産税の概要`, `src21`, ``, `評価額×2/3`),
    ptCommercialCap: r(0.7, `商業地等の負担水準の上限(負担調整措置)`, `地方税法附則18条`, `2027-03-31`, SRC.soumuKotei, `総務省 固定資産税の概要`, `src21`, `令和8年度分までの措置。令和9年度(評価替え)以降は改正内容を要確認`, `評価額×70%`),
    ptNewHouse: r(0.5, `新築住宅の固定資産税の減額`, `地方税法附則15条の6`, `2031-03-31`, SRC.nagoyaNew, `名古屋市 新築住宅の減額`, null, `令和8年度改正で5年延長(令和13年3月31日までの新築)。床面積要件は令和8年4月1日以後の新築から40㎡以上240㎡以下(東京都特別区の特定都市再生緊急整備地域は50㎡以上のまま)`, `120㎡分の税額×1/2`),
    ptLongLife: r(0.5, `認定長期優良住宅の固定資産税の減額`, `地方税法附則15条の7`, `2031-03-31`, SRC.nagoyaNew, `名古屋市 新築住宅の減額`, null, `令和8年度改正で5年延長`, `120㎡分の税額×1/2(5年度分・中高層耐火は7年度分)`),
    ptExempt: r(null, `固定資産税の免税点`, `地方税法351条`, null, SRC.soumuR8, `総務省 令和8年度地方税制改正 事務連絡`, null, `家屋の免税点は令和9年度分から30万円に引上げ`, `土地30万円・家屋20万円(令和9年度分から30万円)`),
    // --- 譲渡所得 ---
    trLong: r(0.20315, `長期譲渡所得の税率(所得税15%+復興特別所得税0.315%+住民税5%)`, `租税特別措置法31条・地方税法附則34条`, null, SRC.nta3208, `国税庁 No.3208`, null, `令和9年分以後は復興特別所得税1.1%+防衛特別所得税1%(合計2.1%)となり、合計税率は同じ(財務省「令和8年度税制改正の大綱」: ${SRC.mofR8Defense})`),
    trShort: r(0.3963, `短期譲渡所得の税率(所得税30%+復興特別所得税0.63%+住民税9%)`, `租税特別措置法32条・地方税法附則35条`, null, SRC.nta3211, `国税庁 No.3211`),
    trSpecial3000: r(30000000, `居住用財産を譲渡した場合の3,000万円の特別控除`, `租税特別措置法35条`, null, SRC.nta3302, `国税庁 No.3302`, null, ``, `3,000万円`),
    trEstimatedCost: r(0.05, `取得費が分からない場合の概算取得費`, `租税特別措置法31条の4`, null, SRC.nta3258, `国税庁 No.3258`, null, ``, `譲渡価額×5%`),
    // --- 相続税の土地評価 ---
    inhSmallLand: r(null, `小規模宅地等の特例`, `租税特別措置法69条の4`, null, SRC.nta4124, `国税庁 No.4124`, null, ``, `居住用330㎡・事業用400㎡まで80%減、貸付事業用200㎡まで50%減`),
  };

  // 印紙税の税額表: [契約金額の上限(以下), 税額]
  const STAMP_STD = [[100000, 200], [500000, 400], [1000000, 1000], [5000000, 2000], [10000000, 10000], [50000000, 20000], [100000000, 60000], [500000000, 100000], [1000000000, 200000], [5000000000, 400000], [Infinity, 600000]];
  const STAMP_REDUCED = [[500000, 200], [1000000, 500], [5000000, 1000], [10000000, 5000], [50000000, 10000], [100000000, 30000], [500000000, 60000], [1000000000, 160000], [5000000000, 320000], [Infinity, 480000]];

  // 既存住宅の新築時期別の控除額(昭和56年12月31日以前は新耐震基準への適合証明が必要)
  const USED_ERAS = [
    { id: `h9`, label: `平成9年4月1日以後`, ded: 12000000 },
    { id: `h1`, label: `平成元年4月1日〜平成9年3月31日`, ded: 10000000 },
    { id: `s60`, label: `昭和60年7月1日〜平成元年3月31日`, ded: 4500000 },
    { id: `s57`, label: `昭和57年1月1日〜昭和60年6月30日`, ded: 4200000 },
    { id: `s56b`, label: `昭和56年7月1日〜12月31日(耐震証明が必要)`, ded: 4200000 },
    { id: `s51`, label: `昭和51年1月1日〜昭和56年6月30日(耐震証明が必要)`, ded: 3500000 },
    { id: `s48`, label: `昭和48年1月1日〜昭和50年12月31日(耐震証明が必要)`, ded: 2300000 },
    { id: `s39`, label: `昭和39年1月1日〜昭和47年12月31日(耐震証明が必要)`, ded: 1500000 },
    { id: `s29`, label: `昭和29年7月1日〜昭和38年12月31日(耐震証明が必要)`, ded: 1000000 },
  ];

  const INHERIT_LIMITS = { residence: { limit: 330, reduction: 0.8 }, business: { limit: 400, reduction: 0.8 }, rental: { limit: 200, reduction: 0.5 } };

  // ===== 計算(純粋関数。DOMに触れない) =====

  // 浮動小数の誤差(例: 0.30000000000000004)で切捨てがずれないよう、6桁で丸めてから切り捨てる
  function clean(n) {
    return Math.round(n * 1e6) / 1e6;
  }
  function floorTo(n, unit) {
    return Math.floor(clean(n) / unit) * unit;
  }
  function manToYen(v) {
    return Math.round((Number(v) || 0) * 10000);
  }
  function num(v) {
    const n = Number(v);
    return isFinite(n) && n > 0 ? n : 0;
  }

  // 住宅ローン(元利均等/元金均等) — 監査済みの式をそのまま維持
  function loan(s) {
    const P = Number(s.principalMan) * 10000;
    const annualRate = Number(s.ratePct) / 100;
    const years = Number(s.years);
    const n = years * 12;
    const rr = annualRate / 12;

    let equalPayment, equalTotal, equalInterest;
    if (rr === 0) {
      equalPayment = P / n;
      equalTotal = P;
      equalInterest = 0;
    } else {
      equalPayment = P * rr * Math.pow(1 + rr, n) / (Math.pow(1 + rr, n) - 1);
      equalTotal = equalPayment * n;
      equalInterest = equalTotal - P;
    }

    const principalPerMonth = P / n;
    const firstPayment = principalPerMonth + P * rr;
    const lastPayment = principalPerMonth + principalPerMonth * rr;
    const decliningInterestTotal = rr * P * (n + 1) / 2;
    const decliningTotal = P + decliningInterestTotal;
    return { P, n, rr, valid: P > 0 && n > 0, equalPayment, equalTotal, equalInterest, firstPayment, lastPayment, decliningTotal, decliningInterestTotal };
  }

  // 相続税の土地評価+小規模宅地等の特例 — 監査済みの式をそのまま維持
  function inherit(s) {
    const price = Number(s.roadPrice);
    const area = Number(s.area);
    const kind = s.kind;
    const baseValue = price * area;

    let afterValue = baseValue;
    let reductionAmount = 0;
    let appliedArea = 0;
    if (kind !== `none` && INHERIT_LIMITS[kind]) {
      const { limit, reduction } = INHERIT_LIMITS[kind];
      appliedArea = Math.min(area, limit);
      const perSqmValue = area ? baseValue / area : 0;
      reductionAmount = perSqmValue * appliedArea * reduction;
      afterValue = baseValue - reductionAmount;
    }
    return { kind, baseValue, reductionAmount, afterValue, appliedArea, limit: INHERIT_LIMITS[kind] || null };
  }

  // 譲渡所得税 — 監査済みの式をそのまま維持
  function transfer(s) {
    const transferPrice = Number(s.priceMan) * 10000;
    let acquisition = Number(s.acqMan) * 10000;
    const expense = Number(s.expenseMan) * 10000;
    const isLong = s.period !== `short`;
    const useSpecial = !!s.special3000;

    let estimatedAcquisition = false;
    if (!acquisition) {
      acquisition = transferPrice * 0.05; // 概算取得費(譲渡価額の5%)
      estimatedAcquisition = true;
    }

    const grossGain = transferPrice - acquisition - expense;
    let gain = grossGain;
    if (useSpecial) gain = Math.max(0, gain - 30000000);
    gain = Math.max(0, gain);

    const rate = isLong ? 0.20315 : 0.39630; // 所得税+復興特別所得税+住民税 込み概算税率
    const tax = gain * rate;
    return { transferPrice, acquisition, expense, estimatedAcquisition, grossGain, gain, isLong, useSpecial, rate, tax };
  }

  function regTax(base, rate) {
    if (base <= 0) return 0;
    return Math.max(RATES.regMinimum.value, floorTo(base * rate, 100));
  }

  // 登録免許税
  const REG_STD = { 'land-sale': `regLandSaleStd`, 'bldg-sale': `regTransferStd`, 'bldg-new': `regPreserveStd`, mortgage: `regMortgageStd` };
  function registration(s) {
    const kind = REG_STD[s.kind] ? s.kind : `land-sale`;
    const baseYen = kind === `mortgage` ? manToYen(s.debtMan) : manToYen(s.valueMan);
    const base = floorTo(baseYen, 1000);
    const stdKey = REG_STD[kind];
    let key = stdKey;
    const useHouse = kind !== `land-sale` && !!s.useHouse;
    if (kind === `land-sale`) key = `regLandSale`;
    else if (useHouse) {
      if (kind === `mortgage`) key = `regHouseMortgage`;
      else if (s.houseType === `lowcarbon`) key = `regLowCarbon`;
      else if (s.houseType === `longlife-detached`) key = kind === `bldg-sale` ? `regLongLifeDetached` : `regLongLife`;
      else if (s.houseType === `longlife-apt`) key = `regLongLife`;
      else key = kind === `bldg-sale` ? `regHouseTransfer` : `regHousePreserve`;
    }
    const rate = RATES[key].value;
    const stdRate = RATES[stdKey].value;
    const tax = regTax(base, rate);
    const stdTax = regTax(base, stdRate);
    const minApplied = base > 0 && floorTo(base * rate, 100) < RATES.regMinimum.value;
    return { kind, baseYen, base, key, stdKey, rate, stdRate, tax, stdTax, saving: stdTax - tax, minApplied, useHouse };
  }

  function houseFloorRange(type, after, rentalApt) {
    // 不動産取得税の住宅の床面積要件
    if (type === `new-house`) return { min: after ? 40 : (rentalApt ? 40 : 50), max: 240 };
    if (type === `used-house`) return { min: after ? 40 : 50, max: 240 };
    return null;
  }

  // 不動産取得税
  function acquisition(s) {
    const after = s.acqDate !== `before`;
    const rate = RATES.acqReduced.value;
    const exempt = after ? { land: 160000, build: 660000, other: 340000 } : { land: 100000, build: 230000, other: 120000 };
    const notes = [];
    const landYen = manToYen(s.landMan);
    const takuchi = !!s.takuchi;
    const type = [`new-house`, `used-house`, `non-house`].includes(s.bldgType) ? s.bldgType : `none`;
    const bldgYen = type === `none` ? 0 : manToYen(s.bldgMan);
    const floorArea = num(s.floorArea);
    const isHouse = type === `new-house` || type === `used-house`;
    const range = houseFloorRange(type, after, !!s.rentalApt);
    const houseEligible = isHouse && range && floorArea >= range.min && floorArea <= range.max;

    // 土地
    const land = { value: landYen, base: 0, exempt: false, taxRaw: 0, reduction: 0, reductionCalc: 0, tax: 0, unit: 0, reductionArea: 0, reductionApplied: false };
    if (landYen > 0) {
      land.base = floorTo(landYen * (takuchi ? RATES.acqLandHalf.value : 1), 1000);
      land.exempt = land.base < exempt.land;
      land.taxRaw = land.base * rate;
      if (s.landReduction && isHouse) {
        if (houseEligible) {
          const landArea = num(s.landArea);
          if (landArea > 0) {
            land.unit = landYen / landArea * (takuchi ? RATES.acqLandHalf.value : 1);
            land.reductionArea = Math.min(floorArea * 2, 200);
            land.reductionCalc = floorTo(land.unit * land.reductionArea * rate, 1);
          }
          land.reduction = Math.max(RATES.acqLandReduction.value, land.reductionCalc);
          land.reductionApplied = true;
        } else {
          notes.push(`住宅の床面積が要件(${range.min}㎡以上${range.max}㎡以下)を満たさないため、住宅用土地の減額は計算に入れていません。`);
        }
      }
      land.tax = land.exempt ? 0 : floorTo(Math.max(0, land.taxRaw - land.reduction), 100);
    }

    // 建物
    const bldg = { type, value: bldgYen, deduction: 0, taxable: 0, rate: type === `non-house` ? RATES.acqStd.value : rate, exempt: false, tax: 0, dedKey: null, exemptLimit: 0 };
    if (bldgYen > 0) {
      if (type === `new-house`) {
        if (houseEligible) {
          bldg.deduction = s.longLife ? RATES.acqLongLifeDed.value : RATES.acqNewHouseDed.value;
          bldg.dedKey = s.longLife ? `acqLongLifeDed` : `acqNewHouseDed`;
        } else {
          notes.push(`床面積が要件(${range.min}㎡以上${range.max}㎡以下)を満たさないため、新築住宅の控除を適用していません。`);
        }
      } else if (type === `used-house`) {
        const era = USED_ERAS.find((e) => e.id === s.usedEra) || USED_ERAS[0];
        if (houseEligible) {
          bldg.deduction = era.ded;
          bldg.dedKey = `acqUsedHouseDed`;
        } else {
          notes.push(`床面積が要件(${range.min}㎡以上${range.max}㎡以下)を満たさないため、中古住宅の控除を適用していません。`);
        }
      }
      bldg.taxable = floorTo(Math.max(0, bldgYen - bldg.deduction), 1000);
      bldg.exemptLimit = s.how === `build` ? exempt.build : exempt.other;
      // 価格そのものが免税点未満なら確実に非課税。控除後だけが免税点未満になる場合は判定方法を税事務所に確認
      bldg.exempt = floorTo(bldgYen, 1000) < bldg.exemptLimit;
      if (!bldg.exempt && bldg.taxable > 0 && bldg.taxable < bldg.exemptLimit) {
        notes.push(`控除後の課税標準(${bldg.taxable.toLocaleString(`ja-JP`)}円)が免税点(${bldg.exemptLimit.toLocaleString(`ja-JP`)}円)未満です。免税点の判定は都道府県税事務所に確認してください(要確認)。`);
      }
      bldg.tax = bldg.exempt ? 0 : floorTo(bldg.taxable * bldg.rate, 100);
    }

    return { after, rate, exempt, land, bldg, total: land.tax + bldg.tax, notes, houseEligible, range, isHouse };
  }

  function stampLookup(table, amount) {
    for (const [limit, tax] of table) {
      if (amount <= limit) return tax;
    }
    return table[table.length - 1][1];
  }

  // 印紙税(第1号文書)
  function stamp(s) {
    const docType = s.docType === `loan` ? `loan` : `sale`;
    const amount = manToYen(s.amountMan);
    const copies = Math.max(1, Math.floor(num(s.copies)) || 1);
    let std, reduced = null;
    if (s.noAmount) {
      std = 200;
    } else if (amount < 10000) {
      std = 0;
    } else {
      std = stampLookup(STAMP_STD, amount);
      if (docType === `sale` && amount > 100000) reduced = stampLookup(STAMP_REDUCED, amount);
    }
    const perCopy = reduced !== null ? reduced : std;
    return { docType, amount, copies, std, reduced, perCopy, total: perCopy * copies, nonTaxable: !s.noAmount && amount < 10000 };
  }

  // 売買の媒介報酬(税抜)を区分ごとに計算
  function saleFeeTiers(price) {
    const t1 = Math.min(price, 2000000) * 0.05;
    const t2 = Math.max(0, Math.min(price, 4000000) - 2000000) * 0.04;
    const t3 = Math.max(0, price - 4000000) * 0.03;
    return { t1: clean(t1), t2: clean(t2), t3: clean(t3), total: clean(t1 + t2 + t3) };
  }

  // 仲介手数料の上限
  function brokerage(s) {
    const tax = RATES.consumptionTax.value;
    if (s.mode === `lease`) {
      const rent = Math.round(num(s.rentYen));
      const longVacant = !!s.longVacant;
      const months = longVacant ? RATES.feeLongVacant.value : RATES.feeLease.value;
      const totalExcl = rent * months;
      const totalIncl = floorTo(totalExcl * (1 + tax), 1);
      const tenantMonths = s.residential && !s.consent ? 0.5 : 1;
      const tenantIncl = floorTo(rent * tenantMonths * (1 + tax), 1);
      const landlordNormalIncl = floorTo(rent * (s.residential && !s.consent ? 0.5 : 1) * (1 + tax), 1);
      return { mode: `lease`, rent, months, totalExcl, totalIncl, tenantMonths, tenantIncl, landlordNormalIncl, longVacant, residential: !!s.residential, consent: !!s.consent };
    }
    const price = manToYen(s.priceMan);
    const tiers = saleFeeTiers(price);
    const excl = floorTo(tiers.total, 1);
    const incl = floorTo(tiers.total * (1 + tax), 1);
    const lowCostEligible = price > 0 && price <= 8000000;
    const lowCostApplied = !!s.lowCost && lowCostEligible;
    const lowCostIncl = floorTo(RATES.feeLowCost.value * (1 + tax), 1);
    const capIncl = lowCostApplied ? Math.max(incl, lowCostIncl) : incl;
    let quick = ``;
    if (price > 4000000) quick = `価格×3%+6万円`;
    else if (price > 2000000) quick = `価格×4%+2万円`;
    else quick = `価格×5%`;
    return { mode: `sale`, price, tiers, excl, incl, lowCostEligible, lowCostApplied, lowCostIncl, capIncl, quick, lowCostRequested: !!s.lowCost };
  }

  // 固定資産税・都市計画税(1年度分)
  function propertyTax(s) {
    // 税率が未入力(0)のときは標準税率・制限税率を使う
    const fixedRate = num(s.fixedRatePct) > 0 ? num(s.fixedRatePct) / 100 : RATES.ptStd.value;
    const cityPlan = !!s.cityPlan;
    // 都市計画税は0.3%が法定の上限(地方税法702条の4)
    const cityRate = cityPlan ? (num(s.cityRatePct) > 0 ? Math.min(num(s.cityRatePct) / 100, RATES.ptCityMax.value) : RATES.ptCityMax.value) : 0;
    const landYen = manToYen(s.landMan);
    const landArea = num(s.landArea);
    const residential = s.landUse !== `nonres`;
    const units = Math.max(1, Math.floor(num(s.units)) || 1);
    const notes = [];

    const land = { value: landYen, area: landArea, smallArea: 0, generalArea: 0, fixedBase: 0, cityBase: 0, fixedTax: 0, cityTax: 0, residential };
    if (landYen > 0) {
      if (residential && landArea > 0) {
        const unit = landYen / landArea;
        land.smallArea = Math.min(landArea, 200 * units);
        land.generalArea = clean(landArea - land.smallArea);
        land.fixedBase = floorTo(unit * land.smallArea * RATES.ptSmallFixed.value + unit * land.generalArea * RATES.ptGeneralFixed.value, 1000);
        land.cityBase = floorTo(unit * land.smallArea * RATES.ptSmallCity.value + unit * land.generalArea * RATES.ptGeneralCity.value, 1000);
      } else if (residential) {
        notes.push(`住宅用地の特例を計算するには土地の面積を入力してください(未入力のため評価額をそのまま課税標準にしています)。`);
        land.fixedBase = floorTo(landYen, 1000);
        land.cityBase = land.fixedBase;
      } else {
        land.fixedBase = floorTo(landYen * RATES.ptCommercialCap.value, 1000);
        land.cityBase = land.fixedBase;
      }
      land.fixedTax = floorTo(land.fixedBase * fixedRate, 100);
      land.cityTax = cityPlan ? floorTo(land.cityBase * cityRate, 100) : 0;
      if (land.fixedBase < 300000) notes.push(`土地の課税標準額が30万円未満です。同じ市町村内の土地の課税標準額の合計が免税点(30万円)未満なら課税されません。`);
    }

    const bldgYen = manToYen(s.bldgMan);
    const bldg = { value: bldgYen, base: 0, fixedRaw: 0, reduction: 0, fixedTax: 0, cityTax: 0, reductionApplied: false, period: 0, ratio: 0, eligible: false, range: null };
    if (bldgYen > 0) {
      bldg.base = floorTo(bldgYen, 1000);
      bldg.fixedRaw = bldg.base * fixedRate;
      if (s.newHouse) {
        const after = s.builtDate !== `before`;
        const floorArea = num(s.floorArea);
        bldg.range = after ? { min: 40, max: 240 } : { min: s.rentalApt ? 40 : 50, max: 280 };
        bldg.eligible = floorArea >= bldg.range.min && floorArea <= bldg.range.max;
        const fireproof = s.structure === `fireproof`;
        bldg.period = s.longLife ? (fireproof ? 7 : 5) : (fireproof ? 5 : 3);
        const yearIndex = Math.max(1, Math.floor(num(s.yearIndex)) || 1);
        bldg.yearIndex = yearIndex;
        if (!bldg.eligible) {
          notes.push(`居住部分の床面積が要件(${bldg.range.min}㎡以上${bldg.range.max}㎡以下)を満たさないため、新築住宅の減額を適用していません。`);
        } else if (yearIndex > bldg.period) {
          notes.push(`減額期間(${bldg.period}年度分)を過ぎているため、減額を適用していません。`);
        } else {
          bldg.ratio = Math.min(1, 120 / floorArea);
          bldg.reduction = clean(bldg.fixedRaw * bldg.ratio * RATES.ptNewHouse.value);
          bldg.reductionApplied = true;
        }
      }
      bldg.fixedTax = floorTo(Math.max(0, bldg.fixedRaw - bldg.reduction), 100);
      bldg.cityTax = cityPlan ? floorTo(bldg.base * cityRate, 100) : 0;
      if (bldg.base < 200000) notes.push(`家屋の課税標準額が20万円未満です。同じ市町村内の家屋の合計が免税点(20万円、令和9年度分からは30万円)未満なら課税されません。`);
    }

    const fixedTotal = land.fixedTax + bldg.fixedTax;
    const cityTotal = land.cityTax + bldg.cityTax;
    return { fixedRate, cityRate, cityPlan, land, bldg, fixedTotal, cityTotal, total: fixedTotal + cityTotal, notes, units };
  }

  // 購入諸費用のまとめ
  function purchaseCosts(s) {
    const priceYen = manToYen(s.priceMan);
    const taxInPrice = Math.min(priceYen, manToYen(s.priceTaxMan));
    const type = [`new-house`, `used-house`, `non-house`, `none`].includes(s.bldgType) ? s.bldgType : `used-house`;
    const isHouse = type === `new-house` || type === `used-house`;
    const items = [];

    const fee = s.brokered ? brokerage({ mode: `sale`, priceMan: (priceYen - taxInPrice) / 10000 }) : null;
    items.push({ id: `brokerage`, label: `仲介手数料(上限・税込)`, amount: fee ? fee.incl : 0, skipped: !fee });

    const st = stamp({ docType: `sale`, amountMan: s.priceMan, copies: 1 });
    items.push({ id: `stamp`, label: `印紙税(売買契約書 1通)`, amount: st.total });
    const loanMan = num(s.loanMan);
    const stLoan = loanMan > 0 ? stamp({ docType: `loan`, amountMan: loanMan, copies: 1 }) : null;
    items.push({ id: `stamp`, label: `印紙税(金銭消費貸借契約書 1通)`, amount: stLoan ? stLoan.total : 0, skipped: !stLoan });

    const regLand = registration({ kind: `land-sale`, valueMan: s.landMan });
    items.push({ id: `registration`, label: `登録免許税(土地の所有権移転)`, amount: regLand.tax, skipped: !(num(s.landMan) > 0) });
    const houseType = type === `new-house` && s.longLife ? `longlife-apt` : `general`;
    // 登録免許税の住宅用家屋の軽減は床面積50㎡以上が要件(不動産取得税の40㎡要件とは別)
    const houseRegOk = isHouse && !!s.houseReg && num(s.floorArea) >= 50;
    const regBldg = type === `none` ? null : registration({ kind: type === `new-house` ? `bldg-new` : `bldg-sale`, valueMan: s.bldgMan, useHouse: houseRegOk, houseType });
    items.push({ id: `registration`, label: type === `new-house` ? `登録免許税(建物の所有権保存)` : `登録免許税(建物の所有権移転)`, amount: regBldg ? regBldg.tax : 0, skipped: !regBldg || !(num(s.bldgMan) > 0) });
    const regMort = loanMan > 0 ? registration({ kind: `mortgage`, debtMan: loanMan, useHouse: houseRegOk }) : null;
    items.push({ id: `registration`, label: `登録免許税(抵当権の設定)`, amount: regMort ? regMort.tax : 0, skipped: !regMort });

    const acq = acquisition({ acqDate: `after`, landMan: s.landMan, takuchi: s.takuchi, bldgType: type, bldgMan: s.bldgMan, longLife: s.longLife, usedEra: s.usedEra, floorArea: s.floorArea, landReduction: s.landReduction, landArea: s.landArea, how: `buy` });
    items.push({ id: `acquisition`, label: `不動産取得税(土地)`, amount: acq.land.tax, skipped: !(acq.land.value > 0) });
    items.push({ id: `acquisition`, label: `不動産取得税(建物)`, amount: acq.bldg.tax, skipped: type === `none` || !(acq.bldg.value > 0) });

    const extras = [
      { label: `司法書士報酬`, amount: manToYen(s.shihoMan) },
      { label: `ローン事務手数料・保証料`, amount: manToYen(s.loanFeeMan) },
      { label: `その他(火災保険料など)`, amount: manToYen(s.otherMan) },
    ].filter((x) => x.amount > 0);

    const taxesAndFees = items.reduce((a, b) => a + (b.skipped ? 0 : b.amount), 0);
    const extrasTotal = extras.reduce((a, b) => a + b.amount, 0);
    const total = taxesAndFees + extrasTotal;
    return { priceYen, items, extras, taxesAndFees, extrasTotal, total, ratio: priceYen > 0 ? total / priceYen : 0, fee, st, stLoan, regLand, regBldg, regMort, acq, type, isHouse, houseType, loanMan, houseRegOk, houseRegFloorNg: isHouse && !!s.houseReg && !houseRegOk };
  }

  const calc = { loan, inherit, transfer, registration, acquisition, stamp, brokerage, propertyTax, purchaseCosts, saleFeeTiers, floorTo };

  // ===== 表示用ヘルパー =====

  function yen(n) {
    return Math.round(n).toLocaleString(`ja-JP`);
  }
  function pct(rate) {
    return `${parseFloat((rate * 100).toFixed(4))}%`;
  }
  function wareki(s) {
    const d = typeof DateUtil !== `undefined` ? DateUtil.parse(s) : null;
    if (!d) return s;
    const y = d.getFullYear();
    const era = y >= 2019 ? `令和${y - 2018 === 1 ? `元` : y - 2018}年` : `平成${y - 1988}年`;
    return `${era}(${y}年)${d.getMonth() + 1}月${d.getDate()}日`;
  }
  function todayStr() {
    return typeof DateUtil !== `undefined` ? DateUtil.today() : VERIFIED;
  }
  function isExpired(key, today) {
    const rate = RATES[key];
    return !!(rate && rate.validUntil && today > rate.validUntil);
  }
  function rateDisplay(key) {
    const rate = RATES[key];
    if (rate.display) return rate.display;
    if (typeof rate.value === `number` && rate.value < 1) return pct(rate.value);
    return ``;
  }

  function sourceLinkHtml(rate) {
    const src = rate.sourceId && window.AppIndex && AppIndex.sourcesById ? AppIndex.sourcesById[rate.sourceId] : null;
    const url = src ? src.url : rate.sourceUrl;
    const name = src ? src.orgName : rate.sourceName;
    return `<a href="${url}" target="_blank" rel="noopener">${name}${UI.icon(`external`, { size: 12 })}</a>`;
  }

  function statHtml(label, value, opts) {
    const o = opts || {};
    return `<div class="calc-stat${o.primary ? ` is-primary` : ``}">
      <span class="stat-label">${label}</span>
      <span class="stat-value">${typeof value === `number` ? yen(value) : value}<small>${o.unit === undefined ? `円` : o.unit}</small></span>
      ${o.sub ? `<span class="calc-stat-sub">${o.sub}</span>` : ``}
    </div>`;
  }

  function tableHtml(rows, caption) {
    return `<table class="calc-table">${caption ? `<caption class="sr-only">${caption}</caption>` : ``}<tbody>${rows.filter(Boolean).map((row) => `<tr class="${row.cls || ``}"><th scope="row">${row.label}</th><td>${row.value}</td></tr>`).join(``)}</tbody></table>`;
  }

  function formulaHtml(lines) {
    const list = lines.filter(Boolean);
    if (!list.length) return ``;
    return `<div class="calc-formula"><span class="calc-formula-label">${UI.icon(`calculator`, { size: 14 })}計算式</span>${list.map((l) => `<p>${l}</p>`).join(``)}</div>`;
  }

  function notesHtml(list) {
    const items = list.filter(Boolean);
    if (!items.length) return ``;
    return `<ul class="calc-notes">${items.map((n) => `<li>${n}</li>`).join(``)}</ul>`;
  }

  function alertHtml(kind, html) {
    const icon = kind === `warning` ? `alert` : `info`;
    return `<div class="calc-alert calc-alert-${kind}" role="${kind === `warning` ? `alert` : `note`}">${UI.icon(icon, { size: 18 })}<div>${html}</div></div>`;
  }

  function expiryWarnings(keys, today) {
    return keys.filter((k) => isExpired(k, today)).map((k) => alertHtml(`warning`, `<strong>${RATES[k].label}</strong>の適用期限(${wareki(RATES[k].validUntil)})を過ぎています。延長されていなければ本則の税率等になるため、この結果は実際より低い可能性があります。最新の法令を確認してください。`)).join(``);
  }

  function basisHtml(keys, today) {
    const uniq = keys.filter((k, i) => k && RATES[k] && keys.indexOf(k) === i);
    if (!uniq.length) return ``;
    return `${expiryWarnings(uniq, today)}<div class="calc-basis">
      <p class="calc-basis-title">${UI.icon(`scale`, { size: 14 })}根拠と適用期限</p>
      <ul>${uniq.map((k) => {
        const rt = RATES[k];
        const disp = rateDisplay(k);
        const until = rt.validUntil ? `${wareki(rt.validUntil)}まで` : `期限なし(本則)`;
        return `<li>
          <span class="calc-basis-name">${rt.label}${disp ? `: <strong>${disp}</strong>` : ``}</span>
          <span>根拠: ${rt.lawRef} / 適用期限: ${until}(2026年10月時点で確認)</span>
          ${rt.note ? `<span class="calc-basis-note">${rt.note}</span>` : ``}
          <span>出典: ${sourceLinkHtml(rt)}</span>
        </li>`;
      }).join(``)}</ul>
    </div>`;
  }

  function cardHtml(title, body, extraCls) {
    return `<section class="card calc-result-card${extraCls ? ` ${extraCls}` : ``}"><h4 class="calc-result-title">${title}</h4>${body}</section>`;
  }

  function promptHtml(text) {
    return `<div class="card calc-result-card calc-empty">${UI.icon(`pencil`, { size: 20 })}<p>${text}</p></div>`;
  }

  const DISCLAIMER = `この計算結果は概算です。実際の金額は固定資産税評価額・自治体の条例(税率等)・特例の要件の判定・端数処理により異なります。申告・登記・契約にあたっては税理士・司法書士・宅建業者などの専門家や、都道府県税事務所・市区町村・法務局に確認してください。`;

  // ===== 計算機の定義 =====
  const ERA_OPTIONS = USED_ERAS.map((e) => [e.id, `${e.label}: ${(e.ded / 10000).toLocaleString(`ja-JP`)}万円`]);

  const CALCS = [
    {
      id: `loan`, group: `loan`, label: `住宅ローン返済`, icon: `yen`, title: `住宅ローン返済シミュレーター`,
      desc: `元利均等返済(毎月の返済額が一定)と元金均等返済(元金部分が一定で利息が徐々に減る)を比べます。`,
      extraNote: `固定金利・ボーナス返済なしの単純計算です。金融機関の審査条件や保証料等により実際の返済額は異なります。`,
      fields: [
        { key: `principalMan`, label: `借入金額`, unit: `万円`, value: `3500`, mode: `decimal` },
        { key: `ratePct`, label: `年利`, unit: `%`, value: `1.0`, mode: `decimal` },
        { key: `years`, label: `返済期間`, unit: `年`, value: `35` },
      ],
      compute: (s) => loan(s),
      summary: (v) => v.valid ? `元利均等の毎月返済額 ${yen(v.equalPayment)}円` : ``,
      render: (v) => {
        if (!v.valid) return promptHtml(`借入金額と返済期間を入力してください。`);
        return cardHtml(`元利均等返済`, `
          <div class="calc-stats">${statHtml(`毎月の返済額`, v.equalPayment, { primary: true })}</div>
          ${tableHtml([{ label: `総返済額`, value: `${yen(v.equalTotal)}円` }, { label: `うち利息`, value: `${yen(v.equalInterest)}円` }])}
          ${formulaHtml([`毎月返済額 = 借入額 × 月利 × (1+月利)<sup>回数</sup> ÷ {(1+月利)<sup>回数</sup> − 1}`, `月利 = 年利 ÷ 12 = ${parseFloat((v.rr * 100).toFixed(6))}% / 回数 = ${v.n}回`])}
        `) + cardHtml(`元金均等返済`, `
          <div class="calc-stats">${statHtml(`初回の返済額`, v.firstPayment, { primary: true })}${statHtml(`最終回の返済額`, v.lastPayment)}</div>
          ${tableHtml([{ label: `総返済額`, value: `${yen(v.decliningTotal)}円` }, { label: `うち利息`, value: `${yen(v.decliningInterestTotal)}円` }, { label: `元利均等との利息の差`, value: `${yen(v.equalInterest - v.decliningInterestTotal)}円` }])}
          ${formulaHtml([`毎月の元金 = 借入額 ÷ 回数、利息 = 残高 × 月利`, `総利息 = 月利 × 借入額 × (回数+1) ÷ 2`])}
        `);
      },
    },
    {
      id: `registration`, group: `acquire`, label: `登録免許税`, icon: `shield`, title: `登録免許税(不動産登記)`,
      desc: `売買による所有権移転・新築建物の所有権保存・抵当権設定の登録免許税を、本則税率と軽減税率で計算します。課税標準は固定資産税評価額(抵当権は債権額)です。`,
      extraNote: `新築建物で評価額がまだ無い場合は、法務局が定める新築建物課税標準価格認定基準表の価額が課税標準になります。`,
      fields: [
        { key: `kind`, label: `登記の種類`, type: `select`, value: `land-sale`, options: [[`land-sale`, `土地の売買(所有権移転)`], [`bldg-sale`, `建物の売買(所有権移転)`], [`bldg-new`, `新築建物の所有権保存`], [`mortgage`, `抵当権の設定(住宅ローン等)`]] },
        { key: `valueMan`, label: `固定資産税評価額(課税標準)`, unit: `万円`, value: `2000`, mode: `decimal`, showIf: (s) => s.kind !== `mortgage` },
        { key: `debtMan`, label: `債権額(借入額)`, unit: `万円`, value: `3000`, mode: `decimal`, showIf: (s) => s.kind === `mortgage` },
        { key: `useHouse`, label: `住宅用家屋の軽減を使う(自己居住用・床面積50㎡以上などの要件を満たす)`, type: `check`, value: true, showIf: (s) => s.kind !== `land-sale` },
        { key: `houseType`, label: `住宅の種類`, type: `select`, value: `general`, options: [[`general`, `一般の住宅`], [`longlife-apt`, `認定長期優良住宅(マンション等)`], [`longlife-detached`, `認定長期優良住宅(一戸建て)`], [`lowcarbon`, `認定低炭素住宅`]], showIf: (s) => s.useHouse && (s.kind === `bldg-sale` || s.kind === `bldg-new`) },
      ],
      compute: (s) => registration(s),
      summary: (v) => `登録免許税 ${yen(v.tax)}円`,
      render: (v, s, today) => {
        if (!(v.base > 0)) return promptHtml(v.kind === `mortgage` ? `債権額を入力してください。` : `固定資産税評価額を入力してください。`);
        const reduced = v.key !== v.stdKey;
        const rows = [
          { label: v.kind === `mortgage` ? `課税標準(債権額・千円未満切捨て)` : `課税標準(千円未満切捨て)`, value: `${yen(v.base)}円` },
          { label: `適用税率`, value: `${pct(v.rate)}${reduced ? `(本則 ${pct(v.stdRate)})` : ``}`, cls: `is-wrap` },
          reduced ? { label: `本則税率の場合`, value: `${yen(v.stdTax)}円` } : null,
          reduced ? { label: `軽減による差額`, value: `▲${yen(v.saving)}円`, cls: `is-good` } : null,
        ];
        const req = v.useHouse ? `<details class="calc-details"><summary>住宅用家屋の軽減の主な要件(概要)</summary><ul>
            <li>個人が自分の住まいとして使う家屋であること</li>
            <li>登記上の床面積が50㎡以上であること(マンションは専有部分の面積)</li>
            <li>新築または取得後1年以内に登記すること</li>
            <li>中古住宅は昭和57年1月1日以後の建築、または新耐震基準に適合することの証明があること</li>
            <li>市区町村の「住宅用家屋証明書」を登記申請時に添付すること(後から出しても軽減は受けられない)</li>
            <li>抵当権は住宅の新築・取得のための借入れに係るものであること</li>
            <li>建物の所有権移転の軽減(0.3%)は売買・競落による取得に限る(贈与・交換などは対象外)</li>
            <li>認定長期優良住宅・認定低炭素住宅の移転の軽減は、新築で未使用の住宅を取得した場合に限る</li>
          </ul></details>` : ``;
        return cardHtml(`登録免許税の額`, `
          <div class="calc-stats">${statHtml(`納める税額`, v.tax, { primary: true, sub: reduced ? `軽減なしなら ${yen(v.stdTax)}円` : `` })}</div>
          ${tableHtml(rows)}
          ${formulaHtml([`税額 = 課税標準 × 税率 = ${yen(v.base)}円 × ${pct(v.rate)} = ${yen(v.base * v.rate)}円 → 100円未満切捨て${v.minApplied ? `(1,000円未満のため最低税額1,000円)` : ``}`])}
          ${v.kind === `land-sale` ? notesHtml([`土地の売買の軽減税率(1.5%)は、住宅用かどうかに関係なく売買による所有権移転に適用されます。相続(0.4%)・贈与(2%)は別の税率です。`]) : ``}
          ${!v.useHouse && v.kind !== `land-sale` ? notesHtml([`住宅用家屋の軽減を使わない場合(店舗・事務所、要件を満たさない住宅など)は本則税率です。`]) : ``}
          ${req}
          ${basisHtml([v.key, v.stdKey, `regMinimum`], today)}
        `);
      },
    },
    {
      id: `acquisition`, group: `acquire`, label: `不動産取得税`, icon: `home`, title: `不動産取得税`,
      desc: `土地や建物を買ったり建てたりしたときに一度だけ課される都道府県税です。宅地の課税標準1/2、住宅の控除(新築1,200万円など)、住宅用土地の減額を反映します。`,
      extraNote: `課税標準は購入価格ではなく固定資産税評価額です。取得後に都道府県税事務所への申告が必要な場合があり、納税通知書は取得の数か月後に届くのが一般的です。`,
      fields: [
        { key: `acqDate`, label: `取得した日`, type: `select`, value: `after`, options: [[`after`, `令和8年4月1日以後`], [`before`, `令和8年3月31日以前`]] },
        { key: `landMan`, label: `土地の固定資産税評価額`, unit: `万円`, value: `2000`, mode: `decimal`, hint: `土地を取得しない場合は0` },
        { key: `takuchi`, label: `宅地評価土地(宅地・宅地比準土地)である`, type: `check`, value: true, showIf: (s) => num(s.landMan) > 0 },
        { key: `bldgType`, label: `建物の種類`, type: `select`, value: `new-house`, options: [[`new-house`, `新築住宅`], [`used-house`, `中古住宅(自己居住用)`], [`non-house`, `住宅以外(店舗・事務所など)`], [`none`, `建物なし(土地のみ)`]] },
        { key: `bldgMan`, label: `建物の固定資産税評価額`, unit: `万円`, value: `1500`, mode: `decimal`, showIf: (s) => s.bldgType !== `none` },
        { key: `how`, label: `建物の取得方法`, type: `select`, value: `buy`, options: [[`buy`, `購入(売買など)`], [`build`, `自分で建築(新築・増改築)`]], showIf: (s) => s.bldgType !== `none` },
        { key: `longLife`, label: `認定長期優良住宅である`, type: `check`, value: false, showIf: (s) => s.bldgType === `new-house` },
        { key: `usedEra`, label: `中古住宅の新築時期`, type: `select`, value: `h9`, options: ERA_OPTIONS, showIf: (s) => s.bldgType === `used-house` },
        { key: `floorArea`, label: `住宅の床面積(1戸あたり)`, unit: `㎡`, value: `100`, mode: `decimal`, showIf: (s) => s.bldgType === `new-house` || s.bldgType === `used-house` },
        { key: `rentalApt`, label: `戸建以外の貸家住宅(アパートの1室など)`, type: `check`, value: false, showIf: (s) => s.bldgType === `new-house` && s.acqDate === `before` },
        { key: `landReduction`, label: `住宅用土地の減額を計算に入れる(住宅の敷地で要件を満たす)`, type: `check`, value: false, showIf: (s) => num(s.landMan) > 0 && (s.bldgType === `new-house` || s.bldgType === `used-house`) },
        { key: `landArea`, label: `土地の面積`, unit: `㎡`, value: `150`, mode: `decimal`, showIf: (s) => s.landReduction && num(s.landMan) > 0 && (s.bldgType === `new-house` || s.bldgType === `used-house`) },
      ],
      compute: (s) => acquisition(s),
      summary: (v) => `不動産取得税 合計 ${yen(v.total)}円`,
      render: (v, s, today) => {
        if (!(v.land.value > 0) && !(v.bldg.value > 0)) return promptHtml(`土地または建物の固定資産税評価額を入力してください。`);
        const L = v.land;
        const B = v.bldg;
        const keys = [`acqReduced`];
        let landBody = ``;
        if (L.value > 0) {
          if (s.takuchi) keys.push(`acqLandHalf`);
          if (L.reductionApplied) keys.push(`acqLandReduction`);
          landBody = tableHtml([
            { label: `評価額`, value: `${yen(L.value)}円` },
            { label: s.takuchi ? `課税標準(評価額×1/2)` : `課税標準`, value: `${yen(L.base)}円` },
            { label: `税額(${pct(v.rate)})`, value: `${yen(L.taxRaw)}円` },
            L.reductionApplied ? { label: `住宅用土地の減額`, value: `▲${yen(L.reduction)}円`, cls: `is-good` } : null,
            { label: `土地の税額`, value: L.exempt ? `0円(免税点未満)` : `${yen(L.tax)}円`, cls: `is-total` },
          ], `土地の内訳`) + formulaHtml([
            `課税標準 × 税率 = ${yen(L.base)}円 × ${pct(v.rate)}`,
            L.reductionApplied ? `減額 = 次の多い方: 45,000円 / 1㎡当たり価格${s.takuchi ? `(1/2後)` : ``} ${yen(L.unit)}円 × ${parseFloat(L.reductionArea.toFixed(2))}㎡(床面積×2・200㎡限度) × ${pct(v.rate)} = ${yen(L.reductionCalc)}円` : ``,
            L.reductionApplied && !(num(s.landArea) > 0) ? `土地の面積が未入力のため45,000円で計算しています。` : ``,
          ]);
        }
        let bldgBody = ``;
        if (B.value > 0) {
          if (B.type === `non-house`) keys.push(`acqStd`);
          if (B.dedKey) keys.push(B.dedKey);
          bldgBody = tableHtml([
            { label: `評価額`, value: `${yen(B.value)}円` },
            B.deduction ? { label: `控除額`, value: `▲${yen(B.deduction)}円`, cls: `is-good` } : null,
            { label: `課税標準(千円未満切捨て)`, value: `${yen(B.taxable)}円` },
            { label: `税率`, value: `${pct(B.rate)}${B.type === `non-house` ? `(住宅以外は本則)` : ``}`, cls: `is-wrap` },
            { label: `建物の税額`, value: B.exempt ? `0円(免税点未満)` : `${yen(B.tax)}円`, cls: `is-total` },
          ], `建物の内訳`) + formulaHtml([`(評価額 − 控除額) × 税率 = (${yen(B.value)}円 − ${yen(B.deduction)}円) × ${pct(B.rate)} → 100円未満切捨て`]);
        }
        keys.push(`acqExempt`);
        return cardHtml(`不動産取得税の額`, `
          <div class="calc-stats">${statHtml(`合計`, v.total, { primary: true })}${L.value > 0 ? statHtml(`土地`, L.tax) : ``}${B.value > 0 ? statHtml(`建物`, B.tax) : ``}</div>
          ${notesHtml(v.notes.map((n) => UI.escapeHtml(n)))}
        `) + (landBody ? cardHtml(`土地の内訳`, landBody) : ``) + (bldgBody ? cardHtml(`建物の内訳`, bldgBody) : ``) + cardHtml(`特例の要件(概要)`, `
          ${notesHtml([
            `新築住宅の控除: 床面積${v.after ? `40㎡以上240㎡以下` : `50㎡以上240㎡以下(戸建以外の貸家住宅は40㎡以上)`}。東京都特別区の特定都市再生緊急整備地域は下限50㎡のまま(令和8年度改正)。`,
            `中古住宅の控除: 自己居住用で床面積${v.after ? `40` : `50`}㎡以上240㎡以下。昭和56年12月31日以前の新築は新耐震基準への適合証明が必要。`,
            `住宅用土地の減額: 土地取得から原則2年以内(令和13年3月31日までの取得は3年以内)に住宅を新築した場合など。中古住宅は土地と住宅の取得が前後1年以内。`,
            `免税点(${v.after ? `令和8年4月1日以後` : `令和8年3月31日以前`}の取得): 土地${yen(v.exempt.land)}円・家屋の建築${yen(v.exempt.build)}円・家屋の売買等${yen(v.exempt.other)}円未満は非課税。`,
          ])}
          ${basisHtml(keys, today)}
        `);
      },
    },
    {
      id: `stamp`, group: `acquire`, label: `印紙税`, icon: `receipt`, title: `印紙税(不動産売買契約書など)`,
      desc: `不動産の売買契約書(第1号の1文書)と金銭消費貸借契約書(第1号の3文書)に貼る収入印紙の額を求めます。売買契約書は軽減措置を反映します。`,
      extraNote: `電子契約(PDF等)で作成した契約書には印紙税はかかりません。売主・買主がそれぞれ原本を保存する場合は通数分必要です。`,
      fields: [
        { key: `docType`, label: `文書の種類`, type: `select`, value: `sale`, options: [[`sale`, `不動産売買契約書(第1号の1文書)`], [`loan`, `金銭消費貸借契約書(住宅ローン等・第1号の3文書)`]] },
        { key: `amountMan`, label: `契約書に書かれた契約金額`, unit: `万円`, value: `4000`, mode: `decimal`, showIf: (s) => !s.noAmount },
        { key: `noAmount`, label: `契約金額の記載がない`, type: `check`, value: false },
        { key: `copies`, label: `作成する通数`, unit: `通`, value: `1` },
      ],
      compute: (s) => stamp(s),
      summary: (v) => `印紙税 ${yen(v.total)}円`,
      render: (v, s, today) => {
        if (!s.noAmount && !(v.amount > 0)) return promptHtml(`契約金額を入力してください。`) + cardHtml(`税額表(第1号の1文書)`, stampTableHtml(v));
        const keys = v.reduced !== null ? [`stampReduced`, `stampStd`] : [`stampStd`];
        const rows = [
          { label: `契約金額`, value: s.noAmount ? `記載なし` : `${yen(v.amount)}円` },
          { label: `本則の税額(1通)`, value: v.nonTaxable ? `非課税(1万円未満)` : `${yen(v.std)}円` },
          v.reduced !== null ? { label: `軽減後の税額(1通)`, value: `${yen(v.reduced)}円`, cls: `is-good` } : null,
          { label: `通数`, value: `${v.copies}通` },
          { label: `合計`, value: `${yen(v.total)}円`, cls: `is-total` },
        ];
        const note = [];
        if (v.docType === `sale` && !s.noAmount && v.amount > 0 && v.amount <= 100000 && v.amount >= 10000) note.push(`契約金額10万円以下の不動産売買契約書は軽減の対象外(本則200円)です。`);
        if (v.docType === `loan`) note.push(`金銭消費貸借契約書には軽減措置はありません(軽減は不動産の譲渡に関する契約書と建設工事の請負契約書が対象)。`);
        return cardHtml(`収入印紙の額`, `
          <div class="calc-stats">${statHtml(`合計`, v.total, { primary: true, sub: v.copies > 1 ? `1通あたり ${yen(v.perCopy)}円` : `` })}</div>
          ${tableHtml(rows)}
          ${notesHtml(note)}
          ${basisHtml(keys, today)}
        `) + cardHtml(`税額表(第1号の1文書)`, stampTableHtml(v));
      },
    },
    {
      id: `brokerage`, group: `acquire`, label: `仲介手数料`, icon: `handshake`, title: `仲介手数料(媒介報酬)の上限`,
      desc: `宅建業者が受け取れる媒介報酬の上限額(税込)を計算します。売買は価格帯ごとの料率、800万円以下の低廉な空家等の特例、貸借は賃料1か月分が基準です。`,
      extraNote: `これは法律上の「上限」で、実際の手数料は合意で決まります。宅建業者が消費税の免税事業者の場合は上限額が異なります。`,
      fields: [
        { key: `mode`, label: `取引の種類`, type: `select`, value: `sale`, options: [[`sale`, `売買・交換の媒介`], [`lease`, `賃貸借の媒介`]] },
        { key: `priceMan`, label: `売買価格(建物の消費税を除く)`, unit: `万円`, value: `3000`, mode: `decimal`, showIf: (s) => s.mode !== `lease` },
        { key: `lowCost`, label: `低廉な空家等の特例を使う(800万円以下・事前に説明し合意)`, type: `check`, value: false, showIf: (s) => s.mode !== `lease` },
        { key: `rentYen`, label: `月額賃料(消費税を除く)`, unit: `円`, value: `100000`, showIf: (s) => s.mode === `lease` },
        { key: `residential`, label: `居住用の建物である`, type: `check`, value: true, showIf: (s) => s.mode === `lease` },
        { key: `consent`, label: `依頼者の承諾を得ている(居住用で一方から1か月分を受ける場合)`, type: `check`, value: false, showIf: (s) => s.mode === `lease` && s.residential },
        { key: `longVacant`, label: `長期の空家等の特例(貸主から上乗せ)を使う`, type: `check`, value: false, showIf: (s) => s.mode === `lease` },
      ],
      compute: (s) => brokerage(s),
      summary: (v) => v.mode === `lease` ? `仲介手数料の上限 合計${yen(v.totalIncl)}円` : `仲介手数料の上限 ${yen(v.capIncl)}円`,
      render: (v, s, today) => {
        if (v.mode === `lease`) {
          if (!(v.rent > 0)) return promptHtml(`月額賃料を入力してください。`);
          const keys = [`feeLease`, `consumptionTax`].concat(v.longVacant ? [`feeLongVacant`] : []);
          return cardHtml(`賃貸借の媒介報酬の上限(税込)`, `
            <div class="calc-stats">${statHtml(`貸主・借主の合計`, v.totalIncl, { primary: true })}${statHtml(`借主から受けられる上限`, v.tenantIncl)}</div>
            ${tableHtml([
              { label: `月額賃料`, value: `${yen(v.rent)}円` },
              { label: `合計の上限`, value: `賃料${v.months}か月分 × 1.1 = ${yen(v.totalIncl)}円`, cls: `is-wrap` },
              { label: `借主の上限`, value: `${v.tenantMonths}か月分 × 1.1 = ${yen(v.tenantIncl)}円`, cls: `is-wrap` },
              v.longVacant ? { label: `貸主の上限`, value: `合計${yen(v.totalIncl)}円 − 借主から受けた額`, cls: `is-wrap` } : { label: `貸主の上限`, value: `${v.residential && !v.consent ? `0.5か月分 × 1.1 = ${yen(v.landlordNormalIncl)}円` : `合計${yen(v.totalIncl)}円 − 借主から受けた額`}`, cls: `is-wrap` },
            ])}
            ${notesHtml([
              v.residential && !v.consent ? `居住用建物は、依頼を受ける際に承諾を得ていない限り、依頼者の一方から受けられるのは賃料0.5か月分(+消費税)までです。` : ``,
              v.longVacant ? `長期の空家等の特例: 長期間使われていない(または今後も使用の見込みがない)物件では、貸主から上乗せして合計2か月分(+消費税)まで受けられます。借主の負担は通常の上限のままです。目安は少なくとも1年を超えて使われていない物件です(国土交通省「解釈・運用の考え方」)。` : ``,
              `店舗・事務所など居住用以外で権利金(返還されないもの)の授受がある場合は、権利金を売買代金とみなして売買の計算式で上限を出すこともできます。`,
            ])}
            ${basisHtml(keys, today)}
          `);
        }
        if (!(v.price > 0)) return promptHtml(`売買価格を入力してください。`);
        const keys = [`feeSale`, `consumptionTax`].concat(v.lowCostRequested ? [`feeLowCost`] : []);
        return cardHtml(`売買の媒介報酬の上限(依頼者の一方から・税込)`, `
          <div class="calc-stats">${statHtml(`上限額(税込)`, v.capIncl, { primary: true, sub: v.lowCostApplied ? `特例適用。原則なら ${yen(v.incl)}円` : `税抜 ${yen(v.excl)}円` })}</div>
          ${tableHtml([
            { label: `売買価格`, value: `${yen(v.price)}円` },
            { label: `200万円以下の部分 × 5%`, value: `${yen(v.tiers.t1)}円` },
            { label: `200万円超400万円以下の部分 × 4%`, value: `${yen(v.tiers.t2)}円` },
            { label: `400万円超の部分 × 3%`, value: `${yen(v.tiers.t3)}円` },
            { label: `原則の上限(税抜)`, value: `${yen(v.excl)}円` },
            { label: `原則の上限(税込 ×1.1)`, value: `${yen(v.incl)}円`, cls: v.lowCostApplied ? `` : `is-total` },
            v.lowCostApplied ? { label: `低廉な空家等の特例の上限`, value: `${yen(v.lowCostIncl)}円`, cls: `is-total` } : null,
          ])}
          ${formulaHtml([`速算式: ${v.quick}(税抜)→ ×1.1 で税込`])}
          ${notesHtml([
            v.lowCostRequested && !v.lowCostEligible ? `売買価格が800万円を超えるため、低廉な空家等の特例は使えません。` : ``,
            v.lowCostApplied ? `低廉な空家等の特例: 800万円以下の宅地建物(使用の状態は問わない)は、媒介に要する費用を勘案して30万円×1.1=33万円まで受けられます。媒介契約の締結時に、あらかじめ報酬額を説明し合意することが必要です(令和6年7月1日施行)。` : ``,
            `売主・買主の双方から依頼を受けた場合は、それぞれからこの上限まで受けられます。`,
          ])}
          ${basisHtml(keys, today)}
        `);
      },
    },
    {
      id: `purchase-costs`, group: `acquire`, label: `購入諸費用まとめ`, icon: `list`, title: `購入時の諸費用まとめ`,
      desc: `物件価格と評価額の目安から、仲介手数料・印紙税・登録免許税・不動産取得税をまとめて概算します。司法書士報酬などは分かれば自由に入力できます。`,
      extraNote: `固定資産税・都市計画税の日割り精算金、管理費等の精算、引っ越し費用は含みません。評価額の目安: 土地は公示価格の7割程度とされますが、実際は固定資産税の課税明細書や評価証明書で確認してください。`,
      fields: [
        { key: `priceMan`, label: `物件価格(税込)`, unit: `万円`, value: `4000`, mode: `decimal` },
        { key: `priceTaxMan`, label: `うち建物の消費税(個人売主の中古は0)`, unit: `万円`, value: `0`, mode: `decimal` },
        { key: `brokered`, label: `仲介会社を通して買う(仲介手数料がかかる)`, type: `check`, value: true },
        { key: `landMan`, label: `土地の固定資産税評価額(目安)`, unit: `万円`, value: `2000`, mode: `decimal` },
        { key: `takuchi`, label: `宅地評価土地である`, type: `check`, value: true, showIf: (s) => num(s.landMan) > 0 },
        { key: `bldgType`, label: `建物の種類`, type: `select`, value: `used-house`, options: [[`used-house`, `中古住宅(自己居住用)`], [`new-house`, `新築住宅`], [`non-house`, `住宅以外`], [`none`, `建物なし(土地のみ)`]] },
        { key: `bldgMan`, label: `建物の固定資産税評価額(目安)`, unit: `万円`, value: `800`, mode: `decimal`, showIf: (s) => s.bldgType !== `none` },
        { key: `usedEra`, label: `中古住宅の新築時期`, type: `select`, value: `h9`, options: ERA_OPTIONS, showIf: (s) => s.bldgType === `used-house` },
        { key: `longLife`, label: `認定長期優良住宅である`, type: `check`, value: false, showIf: (s) => s.bldgType === `new-house` },
        { key: `floorArea`, label: `住宅の床面積`, unit: `㎡`, value: `80`, mode: `decimal`, showIf: (s) => s.bldgType === `new-house` || s.bldgType === `used-house` },
        { key: `houseReg`, label: `登録免許税の住宅用家屋の軽減を使う`, type: `check`, value: true, showIf: (s) => s.bldgType === `new-house` || s.bldgType === `used-house` },
        { key: `landReduction`, label: `不動産取得税の住宅用土地の減額を使う`, type: `check`, value: true, showIf: (s) => num(s.landMan) > 0 && (s.bldgType === `new-house` || s.bldgType === `used-house`) },
        { key: `landArea`, label: `土地の面積`, unit: `㎡`, value: `100`, mode: `decimal`, showIf: (s) => num(s.landMan) > 0 && s.landReduction && (s.bldgType === `new-house` || s.bldgType === `used-house`) },
        { key: `loanMan`, label: `住宅ローンの借入額(なしは0)`, unit: `万円`, value: `3000`, mode: `decimal` },
        { key: `shihoMan`, label: `司法書士報酬(任意)`, unit: `万円`, value: ``, mode: `decimal` },
        { key: `loanFeeMan`, label: `ローン事務手数料・保証料(任意)`, unit: `万円`, value: ``, mode: `decimal` },
        { key: `otherMan`, label: `その他の費用(任意)`, unit: `万円`, value: ``, mode: `decimal` },
      ],
      compute: (s) => purchaseCosts(s),
      summary: (v) => `諸費用の合計 ${yen(v.total)}円`,
      render: (v, s, today) => {
        if (!(v.priceYen > 0)) return promptHtml(`物件価格を入力してください。`);
        const rows = v.items.map((it, i) => ({
          label: `${it.label}<button type="button" class="calc-link" data-goto="${it.id}" data-item="${i}">${UI.icon(`chevron-right`, { size: 14 })}<span class="sr-only">${it.label}の</span>詳しく</button>`,
          value: it.skipped ? `—` : `${yen(it.amount)}円`,
          cls: it.skipped ? `is-muted` : ``,
        }));
        v.extras.forEach((x) => rows.push({ label: x.label, value: `${yen(x.amount)}円` }));
        rows.push({ label: `合計`, value: `${yen(v.total)}円`, cls: `is-total` });
        const keys = [`regLandSale`];
        if (v.regBldg) keys.push(v.regBldg.key);
        if (v.regMort) keys.push(v.regMort.key);
        keys.push(`acqReduced`);
        if (s.takuchi) keys.push(`acqLandHalf`);
        if (v.st.reduced !== null) keys.push(`stampReduced`);
        return cardHtml(`諸費用の概算`, `
          <div class="calc-stats">${statHtml(`諸費用の合計`, v.total, { primary: true, sub: `物件価格の約${(v.ratio * 100).toFixed(1)}%` })}${statHtml(`物件価格+諸費用`, v.priceYen + v.total)}</div>
          ${tableHtml(rows, `諸費用の内訳`)}
          ${notesHtml([
            `「詳しく」を押すと、この条件を入れた各計算機を開きます。`,
            `不動産取得税は取得日が令和8年4月1日以後として計算しています。`,
            v.houseRegFloorNg ? `床面積が50㎡未満のため、登録免許税の住宅用家屋の軽減(床面積50㎡以上が要件)は使わず本則税率で計算しています。` : ``,
            `印紙税は物件価格(税込)で判定しています。契約書に消費税額が区分記載されていれば税抜金額で判定します。`,
            v.fee && v.fee.price > 0 ? `仲介手数料は上限額(${UI.escapeHtml(v.fee.quick)}+消費税)です。新築分譲を売主から直接買う場合はかかりません。` : ``,
          ])}
          ${basisHtml(keys, today)}
        `);
      },
      links: (v, s) => ({
        brokerage: { mode: `sale`, priceMan: String((v.priceYen - Math.min(v.priceYen, manToYen(s.priceTaxMan))) / 10000), lowCost: false },
        stamp: { docType: `sale`, amountMan: String(s.priceMan), noAmount: false, copies: `1` },
        registration: { kind: `land-sale`, valueMan: String(s.landMan) },
        acquisition: { acqDate: `after`, landMan: String(s.landMan), takuchi: !!s.takuchi, bldgType: s.bldgType, bldgMan: String(s.bldgMan), how: `buy`, longLife: !!s.longLife, usedEra: s.usedEra, floorArea: String(s.floorArea), landReduction: !!s.landReduction, landArea: String(s.landArea) },
      }),
      itemLinks: (v, s) => v.items.map((it) => {
        if (it.label.includes(`金銭消費貸借`)) return { stamp: { docType: `loan`, amountMan: String(s.loanMan), noAmount: false, copies: `1` } };
        if (it.label.includes(`建物の所有権`)) return { registration: { kind: s.bldgType === `new-house` ? `bldg-new` : `bldg-sale`, valueMan: String(s.bldgMan), useHouse: !!v.houseRegOk, houseType: v.houseType } };
        if (it.label.includes(`抵当権`)) return { registration: { kind: `mortgage`, debtMan: String(s.loanMan), useHouse: !!v.houseRegOk } };
        return null;
      }),
    },
    {
      id: `property-tax`, group: `hold`, label: `固定資産税・都市計画税`, icon: `calendar`, title: `固定資産税・都市計画税(年額)`,
      desc: `毎年1月1日の所有者に課される市町村税です。住宅用地の特例(200㎡まで1/6など)と新築住宅の減額(1/2)を反映して1年度分を概算します。`,
      extraNote: `税率は市町村の条例で決まります(固定資産税は1.4%が標準、都市計画税は0.3%が上限で、課税しない市町村もあります)。住宅用地の負担調整措置、住宅用地の上限(家屋の床面積の10倍)、併用住宅の住宅用地の割合は計算に入れていません。`,
      fields: [
        { key: `landMan`, label: `土地の固定資産税評価額`, unit: `万円`, value: `3000`, mode: `decimal` },
        { key: `landArea`, label: `土地の面積`, unit: `㎡`, value: `150`, mode: `decimal` },
        { key: `landUse`, label: `土地の用途`, type: `select`, value: `res`, options: [[`res`, `住宅用地(住宅の敷地)`], [`nonres`, `住宅用地以外(店舗・駐車場・更地など)`]] },
        { key: `units`, label: `住宅の戸数(200㎡×戸数までが小規模住宅用地)`, unit: `戸`, value: `1`, showIf: (s) => s.landUse !== `nonres` },
        { key: `bldgMan`, label: `建物の固定資産税評価額`, unit: `万円`, value: `1200`, mode: `decimal` },
        { key: `cityPlan`, label: `都市計画税がかかる区域(市街化区域など)`, type: `check`, value: true },
        { key: `fixedRatePct`, label: `固定資産税の税率`, unit: `%`, value: `1.4`, mode: `decimal` },
        { key: `cityRatePct`, label: `都市計画税の税率(市町村により異なる)`, unit: `%`, value: `0.3`, mode: `decimal`, showIf: (s) => s.cityPlan },
        { key: `newHouse`, label: `新築住宅の減額を計算に入れる`, type: `check`, value: true, showIf: (s) => num(s.bldgMan) > 0 },
        { key: `builtDate`, label: `新築した日`, type: `select`, value: `after`, options: [[`after`, `令和8年4月1日以後`], [`before`, `令和8年3月31日以前`]], showIf: (s) => s.newHouse && num(s.bldgMan) > 0 },
        { key: `floorArea`, label: `居住部分の床面積(1戸あたり)`, unit: `㎡`, value: `100`, mode: `decimal`, showIf: (s) => s.newHouse && num(s.bldgMan) > 0 },
        { key: `structure`, label: `構造`, type: `select`, value: `normal`, options: [[`normal`, `一般の住宅(木造など)`], [`fireproof`, `3階建以上の耐火・準耐火建築物`]], showIf: (s) => s.newHouse && num(s.bldgMan) > 0 },
        { key: `longLife`, label: `認定長期優良住宅である`, type: `check`, value: false, showIf: (s) => s.newHouse && num(s.bldgMan) > 0 },
        { key: `rentalApt`, label: `戸建以外の貸家住宅`, type: `check`, value: false, showIf: (s) => s.newHouse && s.builtDate === `before` && num(s.bldgMan) > 0 },
        { key: `yearIndex`, label: `新築後 何年度目か`, unit: `年度目`, value: `1`, showIf: (s) => s.newHouse && num(s.bldgMan) > 0 },
      ],
      compute: (s) => propertyTax(s),
      summary: (v) => `固定資産税・都市計画税 年額 ${yen(v.total)}円`,
      render: (v, s, today) => {
        if (!(v.land.value > 0) && !(v.bldg.value > 0)) return promptHtml(`土地または建物の評価額を入力してください。`);
        const L = v.land;
        const B = v.bldg;
        const keys = [`ptStd`, `ptCityMax`];
        let landBody = ``;
        if (L.value > 0) {
          if (L.residential) keys.push(`ptSmallFixed`, `ptGeneralFixed`, `ptSmallCity`, `ptGeneralCity`);
          else keys.push(`ptCommercialCap`);
          landBody = tableHtml([
            { label: `評価額`, value: `${yen(L.value)}円` },
            L.residential && L.area > 0 ? { label: `小規模住宅用地 / 一般住宅用地`, value: `${parseFloat(L.smallArea.toFixed(2))}㎡ / ${parseFloat(L.generalArea.toFixed(2))}㎡`, cls: `is-wrap` } : null,
            { label: `固定資産税の課税標準`, value: `${yen(L.fixedBase)}円` },
            { label: `固定資産税(${pct(v.fixedRate)})`, value: `${yen(L.fixedTax)}円`, cls: `is-total` },
            v.cityPlan ? { label: `都市計画税の課税標準`, value: `${yen(L.cityBase)}円` } : null,
            v.cityPlan ? { label: `都市計画税(${pct(v.cityRate)})`, value: `${yen(L.cityTax)}円`, cls: `is-total` } : null,
          ], `土地の内訳`) + formulaHtml(L.residential ? [
            `固定資産税の課税標準 = 1㎡当たり評価額 × (200㎡以下の部分 × 1/6 + 超える部分 × 1/3)`,
            v.cityPlan ? `都市計画税の課税標準 = 1㎡当たり評価額 × (200㎡以下の部分 × 1/3 + 超える部分 × 2/3)` : ``,
          ] : [`課税標準 = 評価額 × 70%(商業地等の負担水準の上限。実際は負担水準により異なる)`]);
        }
        let bldgBody = ``;
        if (B.value > 0) {
          if (B.reductionApplied || s.newHouse) keys.push(s.longLife ? `ptLongLife` : `ptNewHouse`);
          bldgBody = tableHtml([
            { label: `課税標準(評価額)`, value: `${yen(B.base)}円` },
            { label: `固定資産税(${pct(v.fixedRate)})`, value: `${yen(B.fixedRaw)}円` },
            B.reductionApplied ? { label: `新築住宅の減額(${B.ratio < 1 ? `120㎡分` : `全額`}の1/2)`, value: `▲${yen(B.reduction)}円`, cls: `is-good` } : null,
            { label: `建物の固定資産税`, value: `${yen(B.fixedTax)}円`, cls: `is-total` },
            v.cityPlan ? { label: `建物の都市計画税(減額なし)`, value: `${yen(B.cityTax)}円`, cls: `is-total` } : null,
          ], `建物の内訳`) + formulaHtml([
            B.reductionApplied ? `減額 = 固定資産税額 × min(1, 120㎡ ÷ 床面積) × 1/2 = ${yen(B.fixedRaw)}円 × ${parseFloat(B.ratio.toFixed(4))} × 1/2` : ``,
            s.newHouse ? `減額期間: ${B.period}年度分(${s.structure === `fireproof` ? `3階建以上の耐火・準耐火` : `一般の住宅`}${s.longLife ? `・認定長期優良住宅` : ``})` : ``,
          ]);
        }
        keys.push(`ptExempt`);
        return cardHtml(`1年度分の税額`, `
          <div class="calc-stats">${statHtml(`合計(年額)`, v.total, { primary: true })}${statHtml(`固定資産税`, v.fixedTotal)}${v.cityPlan ? statHtml(`都市計画税`, v.cityTotal) : ``}</div>
          ${notesHtml(v.notes.map((n) => UI.escapeHtml(n)))}
        `) + (landBody ? cardHtml(`土地の内訳`, landBody) : ``) + (bldgBody ? cardHtml(`建物の内訳`, bldgBody) : ``) + cardHtml(`特例の要件(概要)`, `
          ${notesHtml([
            `新築住宅の減額: 居住部分が床面積の1/2以上で、居住部分の床面積が${s.builtDate === `before` ? `50㎡以上280㎡以下(戸建以外の貸家住宅は40㎡以上)` : `40㎡以上240㎡以下(令和8年4月1日以後の新築。東京都特別区の特定都市再生緊急整備地域は50㎡以上)`}。120㎡までの部分の固定資産税が1/2になります。都市計画税は減額されません。`,
            `減額期間: 一般の住宅3年度分、3階建以上の耐火・準耐火建築物5年度分。認定長期優良住宅はそれぞれ5年度分・7年度分。`,
            `令和11年4月1日以後に災害危険区域等で新築された一定の住宅は対象外になります(令和8年度改正)。`,
            `住宅用地の特例は、空き家で管理不全空家等・特定空家等として勧告を受けると対象外になります。`,
          ])}
          ${basisHtml(keys, today)}
        `);
      },
    },
    {
      id: `transfer`, group: `exit`, label: `譲渡所得税`, icon: `briefcase`, title: `譲渡所得税(不動産の売却)`,
      desc: `不動産を売ったときの譲渡所得税・住民税を概算します。所有期間が「売った年の1月1日時点で5年超」かどうかで税率が大きく変わります。`,
      extraNote: `軽減税率の特例(10年超所有の居住用財産)・買換え特例・取得費加算の特例・建物の減価償却費の控除などは考慮していません。`,
      fields: [
        { key: `priceMan`, label: `譲渡価額(売った金額)`, unit: `万円`, value: `4000`, mode: `decimal` },
        { key: `acqMan`, label: `取得費(0なら概算取得費5%で計算)`, unit: `万円`, value: `0`, mode: `decimal` },
        { key: `expenseMan`, label: `譲渡費用(仲介手数料など)`, unit: `万円`, value: `100`, mode: `decimal` },
        { key: `period`, label: `所有期間`, type: `select`, value: `long`, options: [[`long`, `長期譲渡(5年超)`], [`short`, `短期譲渡(5年以下)`]] },
        { key: `special3000`, label: `居住用財産の3,000万円特別控除を適用する`, type: `check`, value: false },
      ],
      compute: (s) => transfer(s),
      summary: (v) => `譲渡所得税(住民税込み) ${yen(v.tax)}円`,
      render: (v, s, today) => {
        const keys = [v.isLong ? `trLong` : `trShort`];
        if (v.estimatedAcquisition) keys.push(`trEstimatedCost`);
        if (v.useSpecial) keys.push(`trSpecial3000`);
        return cardHtml(`譲渡所得と税額`, `
          <div class="calc-stats">${statHtml(`税額(所得税+復興税+住民税)`, v.tax, { primary: true })}${statHtml(`譲渡所得`, v.gain)}</div>
          ${v.estimatedAcquisition ? alertHtml(`info`, `取得費が未入力のため、概算取得費(譲渡価額の5%)で計算しています。`) : ``}
          ${tableHtml([
            { label: `譲渡価額`, value: `${yen(v.transferPrice)}円` },
            { label: v.estimatedAcquisition ? `取得費(概算 5%)` : `取得費`, value: `▲${yen(v.acquisition)}円` },
            { label: `譲渡費用`, value: `▲${yen(v.expense)}円` },
            v.useSpecial ? { label: `特別控除`, value: `▲${yen(Math.min(Math.max(0, v.grossGain), 30000000))}円`, cls: `is-good` } : null,
            { label: `課税譲渡所得`, value: `${yen(v.gain)}円` },
            { label: `税率`, value: v.isLong ? `20.315%(長期)` : `39.63%(短期)` },
            { label: `税額`, value: `${yen(v.tax)}円`, cls: `is-total` },
          ])}
          ${formulaHtml([`課税譲渡所得 = 譲渡価額 − 取得費 − 譲渡費用${v.useSpecial ? ` − 3,000万円` : ``}`, `税額 = 課税譲渡所得 × ${v.isLong ? `20.315%` : `39.63%`}`])}
          ${basisHtml(keys, today)}
        `);
      },
    },
    {
      id: `inherit`, group: `exit`, label: `相続税の土地評価`, icon: `map`, title: `相続税の土地評価+小規模宅地等の特例`,
      desc: `路線価方式による土地の相続税評価額と、小規模宅地等の特例を使った場合の減額後の評価額を概算します(各種補正率は考慮しない単純計算)。`,
      extraNote: `実際の評価では奥行価格補正・側方路線影響加算などの画地補正や、特例の併用(限度面積の調整)、取得者・継続保有の要件の判定が必要です。`,
      fields: [
        { key: `roadPrice`, label: `路線価(1㎡あたり)`, unit: `円`, value: `200000` },
        { key: `area`, label: `土地の面積`, unit: `㎡`, value: `200`, mode: `decimal` },
        { key: `kind`, label: `特例の種類`, type: `select`, value: `residence`, options: [[`residence`, `特定居住用宅地等(330㎡まで80%減額)`], [`business`, `特定事業用宅地等(400㎡まで80%減額)`], [`rental`, `貸付事業用宅地等(200㎡まで50%減額)`], [`none`, `特例を適用しない`]] },
      ],
      compute: (s) => inherit(s),
      summary: (v) => `特例適用後の評価額 ${yen(v.afterValue)}円`,
      render: (v, s, today) => cardHtml(`土地の評価額`, `
        <div class="calc-stats">${statHtml(v.kind !== `none` ? `特例適用後の評価額` : `評価額`, v.afterValue, { primary: true })}${v.kind !== `none` ? statHtml(`特例による減額`, v.reductionAmount) : ``}</div>
        ${tableHtml([
          { label: `評価額(特例適用前)`, value: `${yen(v.baseValue)}円` },
          v.limit ? { label: `特例の対象面積`, value: `${parseFloat(v.appliedArea.toFixed(2))}㎡(限度${v.limit.limit}㎡)`, cls: `is-wrap` } : null,
          v.limit ? { label: `減額(${Math.round(v.limit.reduction * 100)}%)`, value: `▲${yen(v.reductionAmount)}円`, cls: `is-good` } : null,
          { label: `評価額(特例適用後)`, value: `${yen(v.afterValue)}円`, cls: `is-total` },
        ])}
        ${formulaHtml([`評価額 = 路線価 × 面積`, v.limit ? `減額 = 評価額 × (対象面積 ÷ 面積) × ${Math.round(v.limit.reduction * 100)}%` : ``])}
        ${basisHtml([`inhSmallLand`], today)}
      `),
    },
  ];

  const CALC_BY_ID = {};
  CALCS.forEach((c) => { CALC_BY_ID[c.id] = c; });

  const GROUPS = [
    { id: `loan`, label: `ローン`, icon: `yen`, calcs: [`loan`] },
    { id: `acquire`, label: `取得時の税`, icon: `receipt`, calcs: [`purchase-costs`, `registration`, `acquisition`, `stamp`, `brokerage`] },
    { id: `hold`, label: `保有時の税`, icon: `building`, calcs: [`property-tax`] },
    { id: `exit`, label: `売却・相続`, icon: `scale`, calcs: [`transfer`, `inherit`] },
  ];

  function stampTableHtml(v) {
    const labels = [`10万円以下`, `10万円超 50万円以下`, `50万円超 100万円以下`, `100万円超 500万円以下`, `500万円超 1,000万円以下`, `1,000万円超 5,000万円以下`, `5,000万円超 1億円以下`, `1億円超 5億円以下`, `5億円超 10億円以下`, `10億円超 50億円以下`, `50億円超`];
    const rows = labels.map((label, i) => {
      const std = STAMP_STD[i][1];
      const red = i === 0 ? null : STAMP_REDUCED[i - 1][1];
      const hit = !v.nonTaxable && v.amount > 0 && v.amount <= STAMP_STD[i][0] && (i === 0 || v.amount > STAMP_STD[i - 1][0]);
      return `<tr class="${hit ? `is-hit` : ``}"><th scope="row">${label}</th><td>${yen(std)}円</td><td>${red === null ? `対象外` : `${yen(red)}円`}</td></tr>`;
    }).join(``);
    return `<div class="calc-table-scroll"><table class="calc-table calc-table-3"><thead><tr><th scope="col">契約金額</th><th scope="col">本則</th><th scope="col">軽減後</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${notesHtml([`1万円未満は非課税、契約金額の記載がないものは200円。軽減後の列は不動産売買契約書のみ(令和9年3月31日までの作成分)。`])}`;
  }

  // ===== 入力の保存(端末内) =====
  function loadAllInputs() {
    const all = typeof Storage !== `undefined` && Storage.get ? Storage.get(`calcInputs`, {}) : {};
    return all && typeof all === `object` && !Array.isArray(all) ? all : {};
  }
  function saveInputs(id, values) {
    if (typeof Storage === `undefined` || !Storage.set) return;
    const all = loadAllInputs();
    all[id] = values;
    Storage.set(`calcInputs`, all);
  }
  function initialValues(def) {
    const saved = loadAllInputs()[def.id];
    const out = {};
    def.fields.forEach((f) => {
      const sv = saved && typeof saved === `object` ? saved[f.key] : undefined;
      if (f.type === `check`) out[f.key] = typeof sv === `boolean` ? sv : !!f.value;
      else if (f.type === `select`) out[f.key] = typeof sv === `string` && f.options.some((o) => o[0] === sv) ? sv : f.value;
      else out[f.key] = typeof sv === `string` || typeof sv === `number` ? String(sv) : f.value;
    });
    return out;
  }

  // 全角数字・カンマを許容して数値化
  function parseInput(v) {
    const s = String(v === undefined || v === null ? `` : v)
      .replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[,，\s]/g, ``);
    if (s === ``) return 0;
    const n = Number(s);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function fieldHtml(f, val) {
    const fid = `calc-f-${f.key}`;
    if (f.type === `check`) {
      return `<label class="calc-check" data-field="${f.key}"><input type="checkbox" data-key="${f.key}"${val ? ` checked` : ``}><span>${f.label}</span></label>`;
    }
    if (f.type === `select`) {
      return `<label class="calc-field" data-field="${f.key}"><span class="calc-field-label">${f.label}</span>
        <select id="${fid}" data-key="${f.key}">${f.options.map((o) => `<option value="${o[0]}"${o[0] === val ? ` selected` : ``}>${o[1]}</option>`).join(``)}</select></label>`;
    }
    return `<label class="calc-field" data-field="${f.key}"><span class="calc-field-label">${f.label}<span class="calc-field-unit">(${f.unit})</span></span>
      <span class="calc-input-wrap"><input id="${fid}" type="text" inputmode="${f.mode || `numeric`}" autocomplete="off" data-key="${f.key}" value="${UI.escapeHtml(String(val))}"${f.value === `` ? ` placeholder="0"` : ``}><span class="calc-unit" aria-hidden="true">${f.unit}</span></span>
      ${f.hint ? `<span class="calc-hint">${f.hint}</span>` : ``}
      ${f.unit === `万円` ? `<span class="calc-conv" data-conv="${f.key}"></span>` : ``}
    </label>`;
  }

  function render(root, param) {
    const first = String(param || ``).split(`/`)[0];
    let currentId = CALC_BY_ID[first] ? first : `loan`;
    const lastInGroup = {};

    const wrap = document.createElement(`div`);
    wrap.className = `view calculators-view`;
    wrap.innerHTML = `
      <h2>不動産計算機</h2>
      <p class="view-desc">住宅ローン、買うとき・持っているとき・売るときの税金や費用をその場で概算できます。税率と特例は根拠条文・適用期限つきで表示します(2026年10月時点で確認)。</p>
      <div class="segmented calc-groups" role="group" aria-label="計算機の分類" data-role="groups"></div>
      <div class="chip-row chip-row-scroll calc-chips" role="group" aria-label="計算機を選ぶ" data-role="chips"></div>
      <div data-role="panel"></div>
    `;
    root.appendChild(wrap);

    const groupsEl = wrap.querySelector(`[data-role="groups"]`);
    const chipsEl = wrap.querySelector(`[data-role="chips"]`);
    const panel = wrap.querySelector(`[data-role="panel"]`);

    groupsEl.innerHTML = GROUPS.map((g) => `<button type="button" class="segmented-item" data-group="${g.id}">${UI.icon(g.icon, { size: 16 })}${g.label}</button>`).join(``);
    groupsEl.addEventListener(`click`, (e) => {
      const btn = e.target.closest(`[data-group]`);
      if (!btn) return;
      const g = GROUPS.find((x) => x.id === btn.dataset.group);
      if (!g || g.id === CALC_BY_ID[currentId].group) return;
      switchCalc(lastInGroup[g.id] || g.calcs[0]);
    });
    chipsEl.addEventListener(`click`, (e) => {
      const btn = e.target.closest(`[data-calc]`);
      if (btn && btn.dataset.calc !== currentId) switchCalc(btn.dataset.calc);
    });

    function renderNav() {
      const def = CALC_BY_ID[currentId];
      groupsEl.querySelectorAll(`[data-group]`).forEach((b) => b.setAttribute(`aria-pressed`, String(b.dataset.group === def.group)));
      const g = GROUPS.find((x) => x.id === def.group);
      chipsEl.hidden = g.calcs.length < 2;
      chipsEl.innerHTML = g.calcs.map((id) => {
        const c = CALC_BY_ID[id];
        return `<button type="button" class="chip" data-calc="${id}" aria-pressed="${id === currentId}">${UI.icon(c.icon, { size: 16 })}${c.label}</button>`;
      }).join(``);
      // スマホで横スクロールするチップ列: 選択中のチップが見えるようにする(ページ自体は縦スクロールさせない)
      const active = chipsEl.querySelector(`[aria-pressed="true"]`);
      if (active && chipsEl.scrollWidth > chipsEl.clientWidth) {
        requestAnimationFrame(() => {
          const left = active.offsetLeft - chipsEl.offsetLeft;
          if (left + active.offsetWidth > chipsEl.scrollLeft + chipsEl.clientWidth || left < chipsEl.scrollLeft) {
            chipsEl.scrollLeft = Math.max(0, left - 16);
          }
        });
      }
    }

    function switchCalc(id, opts) {
      if (!CALC_BY_ID[id]) return;
      currentId = id;
      lastInGroup[CALC_BY_ID[id].group] = id;
      history.replaceState(null, ``, `#calculators/${id}`);
      renderNav();
      mount();
      if (opts && opts.scroll) UI.scrollIntoView(panel, `start`);
    }

    let timer = null;
    let lastVm = null;
    let lastState = null;

    function mount() {
      const def = CALC_BY_ID[currentId];
      const values = initialValues(def);
      panel.innerHTML = `
        <section class="calc-panel" aria-labelledby="calc-title">
          <header class="calc-head">
            <span class="calc-head-icon">${UI.icon(def.icon, { size: 22 })}</span>
            <div class="calc-head-text">
              <h3 id="calc-title" class="calc-title">${def.title}</h3>
              <p class="calc-desc">${def.desc}</p>
            </div>
          </header>
          <div class="calc-layout">
            <div class="card calc-form-card">
              <form class="calc-form" data-role="form" novalidate>
                ${def.fields.map((f) => fieldHtml(f, values[f.key])).join(``)}
              </form>
              <div class="calc-form-actions">
                <span class="calc-live-hint">${UI.icon(`refresh`, { size: 14 })}入力するとすぐに再計算します</span>
                <button type="button" class="btn btn-ghost btn-sm" data-role="reset">初期値に戻す</button>
              </div>
            </div>
            <div class="calc-results" data-role="results"></div>
          </div>
          <p class="calc-disclaimer">${UI.icon(`info`, { size: 14 })}<span>※ ${DISCLAIMER}${def.extraNote ? ` ${def.extraNote}` : ``}</span></p>
          <p class="sr-only" aria-live="polite" data-role="live"></p>
        </section>
      `;
      const form = panel.querySelector(`[data-role="form"]`);
      form.addEventListener(`submit`, (e) => e.preventDefault());
      const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(update, 120);
      };
      form.addEventListener(`input`, schedule);
      form.addEventListener(`change`, schedule);
      panel.querySelector(`[data-role="reset"]`).addEventListener(`click`, () => {
        saveInputs(def.id, undefined);
        mount();
      });
      panel.querySelector(`[data-role="results"]`).addEventListener(`click`, (e) => {
        const btn = e.target.closest(`[data-goto]`);
        if (!btn || !lastVm || !def.links) return;
        const target = btn.dataset.goto;
        const itemLinks = def.itemLinks ? def.itemLinks(lastVm, lastState) : [];
        const specific = itemLinks[Number(btn.dataset.item)];
        const prefill = (specific && specific[target]) || def.links(lastVm, lastState)[target];
        if (prefill) {
          const base = initialValues(CALC_BY_ID[target]);
          saveInputs(target, Object.assign(base, prefill));
        }
        switchCalc(target, { scroll: true });
      });
      update(true);
    }

    function readState(def) {
      const raw = {};
      const parsed = {};
      def.fields.forEach((f) => {
        const el = panel.querySelector(`[data-key="${f.key}"]`);
        if (!el) return;
        if (f.type === `check`) { raw[f.key] = el.checked; parsed[f.key] = el.checked; }
        else if (f.type === `select`) { raw[f.key] = el.value; parsed[f.key] = el.value; }
        else { raw[f.key] = el.value; parsed[f.key] = parseInput(el.value); }
      });
      return { raw, parsed };
    }

    function update(initial) {
      const def = CALC_BY_ID[currentId];
      const { raw, parsed } = readState(def);
      def.fields.forEach((f) => {
        const holder = panel.querySelector(`[data-field="${f.key}"]`);
        if (holder && f.showIf) holder.hidden = !f.showIf(parsed);
        if (f.unit === `万円`) {
          const conv = panel.querySelector(`[data-conv="${f.key}"]`);
          if (conv) conv.textContent = parsed[f.key] > 0 ? `= ${yen(manToYen(parsed[f.key]))}円` : ``;
        }
      });
      // 監査済みの3計算機は元の入力処理(Number(値))と同じ値を渡す
      const vm = def.compute(parsed);
      lastVm = vm;
      lastState = parsed;
      const today = todayStr();
      panel.querySelector(`[data-role="results"]`).innerHTML = def.render(vm, parsed, today);
      if (!initial) {
        panel.querySelector(`[data-role="live"]`).textContent = def.summary(vm);
        saveInputs(def.id, raw);
      }
    }

    lastInGroup[CALC_BY_ID[currentId].group] = currentId;
    renderNav();
    mount();
  }

  return { render, _calc: calc, RATES, _internal: { STAMP_STD, STAMP_REDUCED, USED_ERAS, parseInput, CALCS, GROUPS } };
})();
