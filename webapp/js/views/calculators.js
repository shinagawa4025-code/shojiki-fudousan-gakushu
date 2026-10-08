// 不動産計算機: 住宅ローン/相続税の土地評価/譲渡所得税の概算シミュレーター
window.Views = window.Views || {};
window.Views.calculators = (function () {
  const MODES = [
    { id: `loan`, label: `住宅ローン返済` },
    { id: `inherit`, label: `相続税の土地評価` },
    { id: `transfer`, label: `譲渡所得税` },
  ];

  function yen(n) {
    return Math.round(n).toLocaleString(`ja-JP`);
  }

  function sourceLink(srcId) {
    const src = AppIndex.sourcesById[srcId];
    if (!src) return ``;
    return `<a href="${src.url}" target="_blank" rel="noopener">${src.orgName}</a>`;
  }

  function disclaimer(extra) {
    return `<p class="calc-disclaimer">※ この計算結果はあくまで概算です。実際の金額は金融機関の審査条件・税制改正・個別の事情により異なります。実際の借入・申告にあたっては金融機関や税理士等の専門家に相談してください。${extra ? ` ${extra}` : ``}</p>`;
  }

  function render(root, param) {
    let activeMode = (param && MODES.some((m) => m.id === param)) ? param : `loan`;

    const wrap = document.createElement(`div`);
    wrap.className = `view calculators-view`;
    wrap.innerHTML = `
      <h2>不動産計算機</h2>
      <p class="view-desc">住宅ローン返済・相続税の土地評価・譲渡所得税をその場で概算できます。あくまで学習・目安用の簡易計算です。</p>
      <div class="chip-row" data-role="mode-chips"></div>
      <div data-role="calc-area"></div>
    `;
    root.appendChild(wrap);

    const chipRow = wrap.querySelector(`[data-role="mode-chips"]`);
    const area = wrap.querySelector(`[data-role="calc-area"]`);

    MODES.forEach((m) => {
      const chip = document.createElement(`button`);
      chip.type = `button`;
      chip.className = `chip` + (m.id === activeMode ? ` active` : ``);
      chip.textContent = m.label;
      chip.addEventListener(`click`, () => {
        activeMode = m.id;
        chipRow.querySelectorAll(`.chip`).forEach((c) => c.classList.toggle(`active`, c.textContent === m.label));
        renderMode();
      });
      chipRow.appendChild(chip);
    });

    function renderMode() {
      area.innerHTML = ``;
      if (activeMode === `loan`) renderLoan(area);
      else if (activeMode === `inherit`) renderInherit(area);
      else renderTransfer(area);
    }

    function renderLoan(container) {
      const card = document.createElement(`div`);
      card.className = `card calc-card`;
      card.innerHTML = `
        <h3 class="calc-card-title">住宅ローン返済シミュレーター</h3>
        <p class="view-desc">元利均等返済(毎月の返済額が一定)と元金均等返済(元金部分が一定、利息が徐々に減る)を比較します。</p>
        <div class="calc-field-grid">
          <label class="calc-field">借入金額(万円)<input type="number" data-role="principal" value="3500" min="0"></label>
          <label class="calc-field">年利(%)<input type="number" data-role="rate" value="1.0" min="0" step="0.01"></label>
          <label class="calc-field">返済期間(年)<input type="number" data-role="years" value="35" min="1"></label>
        </div>
        <button type="button" class="btn" data-role="calc-btn">計算する</button>
        <div data-role="calc-result"></div>
        ${disclaimer(`金利は固定金利・ボーナス返済なしの単純計算です。`)}
        <p class="term-citation">参考: ${sourceLink(`src05`)}</p>
      `;
      container.appendChild(card);

      const principalInput = card.querySelector(`[data-role="principal"]`);
      const rateInput = card.querySelector(`[data-role="rate"]`);
      const yearsInput = card.querySelector(`[data-role="years"]`);
      const resultEl = card.querySelector(`[data-role="calc-result"]`);

      function calc() {
        const P = Number(principalInput.value) * 10000;
        const annualRate = Number(rateInput.value) / 100;
        const years = Number(yearsInput.value);
        const n = years * 12;
        const r = annualRate / 12;

        let equalPayment, equalTotal, equalInterest;
        if (r === 0) {
          equalPayment = P / n;
          equalTotal = P;
          equalInterest = 0;
        } else {
          equalPayment = P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
          equalTotal = equalPayment * n;
          equalInterest = equalTotal - P;
        }

        const principalPerMonth = P / n;
        const firstPayment = principalPerMonth + P * r;
        const lastPayment = principalPerMonth + principalPerMonth * r;
        const decliningInterestTotal = r * P * (n + 1) / 2;
        const decliningTotal = P + decliningInterestTotal;

        resultEl.innerHTML = `
          <div class="calc-result-grid">
            <div class="calc-result-col">
              <h4>元利均等返済</h4>
              <p>毎月返済額: <strong>${yen(equalPayment)}円</strong></p>
              <p>総返済額: ${yen(equalTotal)}円</p>
              <p>総利息: ${yen(equalInterest)}円</p>
            </div>
            <div class="calc-result-col">
              <h4>元金均等返済</h4>
              <p>初回返済額: <strong>${yen(firstPayment)}円</strong></p>
              <p>最終返済額: ${yen(lastPayment)}円</p>
              <p>総返済額: ${yen(decliningTotal)}円</p>
              <p>総利息: ${yen(decliningInterestTotal)}円</p>
            </div>
          </div>
        `;
      }

      card.querySelector(`[data-role="calc-btn"]`).addEventListener(`click`, calc);
      calc();
    }

    function renderInherit(container) {
      const card = document.createElement(`div`);
      card.className = `card calc-card`;
      card.innerHTML = `
        <h3 class="calc-card-title">相続税の土地評価+小規模宅地等の特例 概算計算機</h3>
        <p class="view-desc">路線価方式による土地の相続税評価額と、小規模宅地等の特例を適用した場合の減額後評価額を概算します(各種補正率は考慮しない単純計算)。</p>
        <div class="calc-field-grid">
          <label class="calc-field">路線価(円/m²)<input type="number" data-role="roadprice" value="200000" min="0"></label>
          <label class="calc-field">土地面積(m²)<input type="number" data-role="area" value="200" min="0"></label>
          <label class="calc-field">特例の種類
            <select data-role="kind">
              <option value="residence">居住用宅地(330m²まで80%減額)</option>
              <option value="business">事業用宅地(400m²まで80%減額)</option>
              <option value="rental">貸付事業用宅地(200m²まで50%減額)</option>
              <option value="none">特例を適用しない</option>
            </select>
          </label>
        </div>
        <button type="button" class="btn" data-role="calc-btn">計算する</button>
        <div data-role="calc-result"></div>
        ${disclaimer(`実際の評価では奥行価格補正・側方路線影響加算等の各種画地補正、併用要件や保有継続要件の判定が必要です。`)}
        <p class="term-citation">参考: ${sourceLink(`src06`)}, ${sourceLink(`src05`)}</p>
      `;
      container.appendChild(card);

      const roadpriceInput = card.querySelector(`[data-role="roadprice"]`);
      const areaInput = card.querySelector(`[data-role="area"]`);
      const kindSelect = card.querySelector(`[data-role="kind"]`);
      const resultEl = card.querySelector(`[data-role="calc-result"]`);

      const LIMITS = { residence: { limit: 330, reduction: 0.8 }, business: { limit: 400, reduction: 0.8 }, rental: { limit: 200, reduction: 0.5 } };

      function calc() {
        const price = Number(roadpriceInput.value);
        const area = Number(areaInput.value);
        const kind = kindSelect.value;
        const baseValue = price * area;

        let afterValue = baseValue;
        let reductionAmount = 0;
        if (kind !== `none` && LIMITS[kind]) {
          const { limit, reduction } = LIMITS[kind];
          const appliedArea = Math.min(area, limit);
          const perSqmValue = area ? baseValue / area : 0;
          reductionAmount = perSqmValue * appliedArea * reduction;
          afterValue = baseValue - reductionAmount;
        }

        resultEl.innerHTML = `
          <p>土地の評価額(特例適用前): <strong>${yen(baseValue)}円</strong></p>
          ${kind !== `none` ? `<p>特例による減額: ▲${yen(reductionAmount)}円</p><p>特例適用後の評価額: <strong>${yen(afterValue)}円</strong></p>` : ``}
        `;
      }

      card.querySelector(`[data-role="calc-btn"]`).addEventListener(`click`, calc);
      kindSelect.addEventListener(`change`, calc);
      calc();
    }

    function renderTransfer(container) {
      const card = document.createElement(`div`);
      card.className = `card calc-card`;
      card.innerHTML = `
        <h3 class="calc-card-title">譲渡所得税の概算計算機</h3>
        <p class="view-desc">不動産を売却した際の譲渡所得税を概算します。所有期間が「譲渡した年の1月1日時点で5年超」かどうかで税率が大きく変わります。</p>
        <div class="calc-field-grid">
          <label class="calc-field">譲渡価額(万円)<input type="number" data-role="transferprice" value="4000" min="0"></label>
          <label class="calc-field">取得費(万円、不明な場合は概算取得費を使用)<input type="number" data-role="acquisition" value="0" min="0"></label>
          <label class="calc-field">譲渡費用(万円)<input type="number" data-role="expense" value="100" min="0"></label>
          <label class="calc-field">所有期間
            <select data-role="period">
              <option value="long">長期譲渡(5年超)</option>
              <option value="short">短期譲渡(5年以下)</option>
            </select>
          </label>
          <label class="calc-field calc-field-checkbox"><input type="checkbox" data-role="special3000"> 居住用財産の3,000万円特別控除を適用する</label>
        </div>
        <button type="button" class="btn" data-role="calc-btn">計算する</button>
        <div data-role="calc-result"></div>
        ${disclaimer(`軽減税率の特例・買換え特例・取得費加算の特例など他の特例は考慮していません。復興特別所得税(所得税額の2.1%)は税率に含めています。`)}
        <p class="term-citation">参考: ${sourceLink(`src05`)}</p>
      `;
      container.appendChild(card);

      const transferPriceInput = card.querySelector(`[data-role="transferprice"]`);
      const acquisitionInput = card.querySelector(`[data-role="acquisition"]`);
      const expenseInput = card.querySelector(`[data-role="expense"]`);
      const periodSelect = card.querySelector(`[data-role="period"]`);
      const special3000Input = card.querySelector(`[data-role="special3000"]`);
      const resultEl = card.querySelector(`[data-role="calc-result"]`);

      function calc() {
        const transferPrice = Number(transferPriceInput.value) * 10000;
        let acquisition = Number(acquisitionInput.value) * 10000;
        const expense = Number(expenseInput.value) * 10000;
        const isLong = periodSelect.value === `long`;
        const useSpecial = special3000Input.checked;

        let estimatedAcquisition = false;
        if (!acquisition) {
          acquisition = transferPrice * 0.05; // 概算取得費(譲渡価額の5%)
          estimatedAcquisition = true;
        }

        let gain = transferPrice - acquisition - expense;
        if (useSpecial) gain = Math.max(0, gain - 30000000);
        gain = Math.max(0, gain);

        const rate = isLong ? 0.20315 : 0.39630; // 所得税+復興特別所得税+住民税 込み概算税率
        const tax = gain * rate;

        resultEl.innerHTML = `
          ${estimatedAcquisition ? `<p class="calc-note">※ 取得費が未入力のため、概算取得費(譲渡価額の5%)で計算しています。</p>` : ``}
          <p>譲渡所得: <strong>${yen(gain)}円</strong></p>
          <p>適用税率: ${isLong ? `20.315%(長期)` : `39.63%(短期)`}</p>
          <p>概算の譲渡所得税額(住民税込み): <strong>${yen(tax)}円</strong></p>
        `;
      }

      card.querySelector(`[data-role="calc-btn"]`).addEventListener(`click`, calc);
      periodSelect.addEventListener(`change`, calc);
      special3000Input.addEventListener(`change`, calc);
      calc();
    }

    renderMode();
  }

  return { render };
})();
