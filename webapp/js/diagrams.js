// 図解: window.Diagrams = { defs: { [図解ID]: { title, alt, caption, group, render } }, byTerm: { [用語ID]: [図解ID] }, groups: [{ id, label, ids }] }
// 色はすべて css/style.css の .dg-* クラス経由(ライト/ダーク両対応)。id・defs・インラインstyleは使わない(1ページに複数並べても衝突しないように)
// v3 の配色では primary(ブランド)と success がどちらも緑なので、同じ図の中で見分けたい系列は青(accent)と青緑(teal。css/learning.css)を使う
// groups は図解の一覧の見出しと並び順(どのグループにも入っていない図は、一覧の「その他」に並ぶ)
window.Diagrams = (function () {
  const W = 360;

  // ---- 描画ヘルパー ----
  function svg(h, label, body) {
    return `<svg class="dg" viewBox="0 0 ${W} ${h}" role="img" aria-label="${label}">${body}</svg>`;
  }
  function rect(x, y, w, h, cls, rx = 6) {
    return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
  }
  function txt(x, y, s, cls = `dg-text`, anchor = `middle`) {
    return `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="central">${s}</text>`;
  }
  function line(x1, y1, x2, y2, cls = `dg-line`) {
    return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  function path(d, cls) {
    return `<path class="${cls}" d="${d}"/>`;
  }
  function circle(cx, cy, r, cls) {
    return `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r}"/>`;
  }
  // 矢じり(先端が(x,y))。dir: r/l/d/u
  function head(x, y, dir, cls = `dg-arrowhead`) {
    const d = { r: `l -7 -4 v 8 z`, l: `l 7 -4 v 8 z`, d: `l -4 -7 h 8 z`, u: `l -4 7 h 8 z` }[dir];
    return path(`M ${x} ${y} ${d}`, cls);
  }
  // 水平・垂直の矢印(線は矢じりの手前で止める)
  function arrow(x1, y1, x2, y2, lineCls = `dg-line`, headCls = `dg-arrowhead`) {
    if (y1 === y2) {
      const dir = x2 > x1 ? `r` : `l`;
      const xe = x2 > x1 ? x2 - 6 : x2 + 6;
      return line(x1, y1, xe, y2, lineCls) + head(x2, y2, dir, headCls);
    }
    const dir = y2 > y1 ? `d` : `u`;
    const ye = y2 > y1 ? y2 - 6 : y2 + 6;
    return line(x1, y1, x2, ye, lineCls) + head(x2, y2, dir, headCls);
  }
  // 複数行の文字(step: 行の間隔)
  function lines(x, y, list, cls, anchor = `middle`, step = 18) {
    return list.map((s, i) => txt(x, y + i * step, s, cls, anchor)).join(``);
  }
  // 判定の流れ図の1段: 左に質問の箱、右に「止まる答え」の結果の箱、左端の縦線で次の段へ
  // q: { y, h, lines: [質問], sub(小さい補足・任意), stop(右へ進む答え), result, resultCls, resultTextCls }
  function decisionStep(q) {
    const qx = 6;
    const qw = 220;
    const rx = 268;
    const rw = 86;
    const mid = q.y + q.h / 2;
    const n = q.lines.length + (q.sub ? 1 : 0);
    const top = mid - ((n - 1) * 17) / 2;
    let s = rect(qx, q.y, qw, q.h, `dg-box`);
    s += lines(qx + qw / 2, top, q.lines, `dg-text`, `middle`, 17);
    if (q.sub) s += txt(qx + qw / 2, top + q.lines.length * 17, q.sub, `dg-text-muted dg-text-sm`);
    s += arrow(qx + qw, mid, rx, mid);
    s += txt((qx + qw + rx) / 2, mid - 10, q.stop, `dg-text dg-text-sm`);
    s += rect(rx, mid - 20, rw, 40, q.resultCls || `dg-box-danger`);
    s += txt(rx + rw / 2, mid, q.result, q.resultTextCls || `dg-text-strong dg-text-danger`);
    return s;
  }
  // 面積の帯(右向きの先端は「以上」): rows: [{ name, tag, from, label }], X: 面積→x座標
  function areaRows(rows, X, y0, step, cls) {
    const xEnd = 322;
    let s = ``;
    rows.forEach((r, i) => {
      const ny = y0 + i * step;
      const by = ny + 12;
      s += txt(12, ny, r.name, `dg-text-strong`, `start`);
      if (r.tag) s += txt(350, ny, r.tag, `dg-text-muted dg-text-sm`, `end`);
      const x1 = X(r.from);
      s += path(`M ${x1} ${by} H ${xEnd} l 12 11 l -12 11 H ${x1} Z`, cls);
      s += txt((x1 + xEnd) / 2, by + 11, r.label, `dg-text dg-text-sm dg-text-on-fill`);
    });
    return s;
  }

  const defs = {};
  function add(id, d) {
    defs[id] = { title: d.title, alt: d.alt, caption: d.caption, group: null, render: () => svg(d.h, d.alt, d.body()) };
  }

  // ---- 1. 法定相続分 ----
  add(`inheritance-shares`, {
    title: `法定相続分の3パターン`,
    alt: `配偶者と子は2分の1ずつ、配偶者と直系尊属は3分の2と3分の1、配偶者と兄弟姉妹は4分の3と4分の1に分けることを帯グラフで示した図`,
    caption: `民法900条。配偶者は常に相続人になり、子がいなければ直系尊属、直系尊属もいなければ兄弟姉妹が配偶者と一緒に相続します。遺言があればそちらが優先されます。`,
    h: 262,
    body: () => {
      const rows = [
        { label: `① 配偶者 ＋ 子`, share: 1 / 2, sf: `1/2`, other: `子`, of: `1/2` },
        { label: `② 配偶者 ＋ 直系尊属(父母など)`, share: 2 / 3, sf: `2/3`, other: `直系尊属`, of: `1/3` },
        { label: `③ 配偶者 ＋ 兄弟姉妹`, share: 3 / 4, sf: `3/4`, other: `兄弟姉妹`, of: `1/4` },
      ];
      const x0 = 16;
      const bw = 328;
      let s = ``;
      rows.forEach((r, i) => {
        const y = 14 + i * 76;
        const w1 = Math.round(bw * r.share);
        const w2 = bw - w1 - 3;
        s += txt(x0, y + 6, r.label, `dg-text-strong`, `start`);
        s += rect(x0, y + 20, w1, 46, `dg-fill-primary`);
        s += rect(x0 + w1 + 3, y + 20, w2, 46, `dg-box-accent`);
        s += txt(x0 + w1 / 2, y + 34, `配偶者`, `dg-text dg-text-on-fill`);
        s += txt(x0 + w1 / 2, y + 53, r.sf, `dg-text-strong dg-text-on-fill`);
        s += txt(x0 + w1 + 3 + w2 / 2, y + 34, r.other, `dg-text`);
        s += txt(x0 + w1 + 3 + w2 / 2, y + 53, r.of, `dg-text-strong`);
      });
      s += txt(W / 2, 250, `同じ立場の人が複数なら、原則その分を人数で等分`, `dg-text-muted dg-text-sm`);
      return s;
    },
  });

  // ---- 2. 用途地域13種類 ----
  add(`zoning-districts`, {
    title: `用途地域の13種類`,
    alt: `用途地域13種類を住居系8つ、商業系2つ、工業系3つのグループに分けて並べた図`,
    caption: `都市計画法9条1〜13項。各名称の「〜地域」は省略しています。田園住居地域は2018年に加わった最も新しい用途地域です。`,
    h: 262,
    body: () => {
      const res = [`第1種低層住居専用`, `第2種低層住居専用`, `第1種中高層住居専用`, `第2種中高層住居専用`, `第1種住居`, `第2種住居`, `準住居`, `田園住居`];
      const com = [`近隣商業`, `商業`];
      const ind = [`準工業`, `工業`, `工業専用`];
      let s = ``;
      let n = 0;
      function group(x, y, w, cls, label, items) {
        let g = rect(x, y, w, 30, cls) + txt(x + w / 2, y + 15, label, `dg-text-strong`);
        items.forEach((name, i) => {
          n += 1;
          const iy = y + 38 + i * 26;
          g += rect(x, iy, w, 22, `dg-box-muted`, 4);
          g += txt(x + 12, iy + 11, String(n), `dg-text-muted dg-text-sm`);
          g += txt(x + 26, iy + 11, name, `dg-text`, `start`);
        });
        return g;
      }
      s += group(8, 8, 200, `dg-box-success`, `住居系(8)`, res);
      s += group(216, 8, 136, `dg-box-danger`, `商業系(2)`, com);
      s += group(216, 108, 136, `dg-box-accent`, `工業系(3)`, ind);
      s += txt(284, 238, `名称の「〜地域」は省略`, `dg-text-muted dg-text-sm`);
      return s;
    },
  });

  // ---- 3. 建蔽率と容積率 ----
  add(`coverage-far`, {
    title: `建蔽率と容積率`,
    alt: `敷地100平方メートルで建蔽率60パーセントなら建築面積60平方メートルまで、容積率200パーセントなら延べ面積200平方メートルまでになることを、上から見た図と横から見た図で示した図`,
    caption: `建築基準法52条(容積率)・53条(建蔽率)。例は敷地100㎡・建蔽率60%・容積率200%の場合。実際は前面道路の幅員や緩和規定でも上限が変わります。`,
    h: 266,
    body: () => {
      let s = ``;
      // 左: 上から見た図
      s += txt(92, 12, `上から見ると`, `dg-text-muted`);
      s += rect(27, 26, 130, 130, `dg-box-muted`, 2);
      s += txt(92, 39, `敷地 100㎡`, `dg-text-muted`);
      s += rect(40, 53, 104, 97, `dg-box-primary`, 2);
      s += txt(92, 90, `建築面積`, `dg-text`);
      s += txt(92, 112, `60㎡`, `dg-text-strong dg-text-primary`);
      s += txt(92, 180, `建蔽率`, `dg-text-strong`);
      s += txt(92, 200, `＝建築面積÷敷地面積`, `dg-text`);
      s += txt(92, 224, `60%なら60㎡まで`, `dg-text-strong dg-text-primary`);
      // 区切り
      s += line(180, 8, 180, 236, `dg-line-dashed`);
      // 右: 横から見た図(各階50㎡×4階)
      s += txt(268, 12, `横から見ると`, `dg-text-muted`);
      const fx = 216;
      const fw = 74;
      [`4階`, `3階`, `2階`, `1階`].forEach((f, i) => {
        const y = 36 + i * 30;
        s += rect(fx, y, fw, 30, `dg-box-accent`, 2);
        s += txt(fx + fw / 2, y + 15, `50㎡`, `dg-text`);
        s += txt(fx - 6, y + 15, f, `dg-text-muted dg-text-sm`, `end`);
      });
      s += line(186, 156, 352, 156, `dg-line-strong`);
      // 合計の括弧
      s += path(`M 296 37 h 4 v 118 h -4`, `dg-line`);
      s += txt(305, 86, `合計`, `dg-text-muted`, `start`);
      s += txt(305, 106, `200㎡`, `dg-text-strong`, `start`);
      s += txt(268, 180, `容積率`, `dg-text-strong`);
      s += txt(268, 200, `＝延べ面積÷敷地面積`, `dg-text`);
      s += txt(268, 224, `200%なら延べ200㎡まで`, `dg-text-strong dg-text-primary`);
      s += txt(W / 2, 252, `右図は各階50㎡×4階＝延べ200㎡の例`, `dg-text-muted dg-text-sm`);
      return s;
    },
  });

  // ---- 4. 道路斜線・北側斜線(概念図) ----
  add(`height-setback`, {
    title: `道路斜線と北側斜線(横から見た図)`,
    alt: `前面道路の反対側から立ち上がる道路斜線と、北側の隣地境界線上の一定の高さから立ち上がる北側斜線の内側に、建物の高さが収まる様子を横から見た概念図`,
    caption: `建築基準法56条の考え方を示した概念図で、勾配や高さは実際の数値ではありません。道路斜線は前面道路の反対側の境界線から、北側斜線は北側の境界線上の一定の高さから斜めに立ち上がり、建物はその内側に収める必要があります。適用される斜線は用途地域で異なります。`,
    h: 236,
    body: () => {
      let s = ``;
      s += txt(14, 16, `南`, `dg-text-muted`);
      s += txt(346, 16, `北`, `dg-text-muted`);
      // 地面と道路
      s += rect(20, 200, 80, 8, `dg-fill-muted`, 0);
      s += line(8, 200, 352, 200, `dg-line-strong`);
      s += line(100, 194, 100, 210, `dg-line-dashed`);
      s += txt(60, 220, `前面道路`, `dg-text-muted dg-text-sm`);
      s += txt(182, 220, `敷地`, `dg-text-muted dg-text-sm`);
      s += txt(312, 220, `北側の隣地`, `dg-text-muted dg-text-sm`);
      // 建てられる範囲(斜線の内側)
      s += path(`M 110 200 V 103 L 139 70 H 195 L 255 142 V 200 Z`, `dg-box-primary`);
      s += txt(182, 160, `建てられる範囲`, `dg-text`);
      // 道路斜線: 道路の反対側の境界線から
      s += line(20, 200, 160, 40, `dg-line-danger`);
      s += circle(20, 200, 3.5, `dg-fill-danger`);
      s += txt(52, 100, `道路斜線`, `dg-text-strong dg-text-danger`);
      // 北側斜線: 北側の境界線上の一定の高さから
      s += line(275, 200, 275, 160, `dg-line-dashed`);
      s += line(275, 160, 175, 40, `dg-line-accent`);
      s += circle(275, 160, 3.5, `dg-fill-accent`);
      s += txt(312, 96, `北側斜線`, `dg-text-strong dg-text-accent`);
      s += txt(282, 182, `一定の高さ`, `dg-text-muted dg-text-sm`, `start`);
      return s;
    },
  });

  // ---- 5. 農地法3条・4条・5条 ----
  add(`farmland-act`, {
    title: `農地法3条・4条・5条のちがい`,
    alt: `農地法3条は農地のまま売買・賃貸する場合で農業委員会の許可、4条は自分の農地を転用する場合、5条は転用目的で売買・賃貸する場合で都道府県知事等の許可が必要、市街化区域内では4条と5条だけ農業委員会への届出で足りることを比べた表`,
    caption: `農地法3条・4条・5条。「都道府県知事等」には農林水産大臣が指定する市町村の長を含みます。相続など許可が不要な例外もあります。`,
    h: 262,
    body: () => {
      const cols = [
        { no: `3条`, sub: `権利移動`, what: [`農地のまま`, `売る・貸す`], who: `農業委員会`, city: [`特例なし`, `許可が必要`], ok: false },
        { no: `4条`, sub: `転用`, what: [`自分の農地を`, `宅地などにする`], who: `都道府県知事等`, city: [`農業委員会へ`, `届出で足りる`], ok: true },
        { no: `5条`, sub: `転用目的の権利移動`, what: [`転用するために`, `売る・貸す`], who: `都道府県知事等`, city: [`農業委員会へ`, `届出で足りる`], ok: true },
      ];
      let s = ``;
      s += txt(8, 70, `何をするとき?`, `dg-text-muted`, `start`);
      s += txt(8, 142, `許可するのは`, `dg-text-muted`, `start`);
      s += txt(8, 200, `市街化区域内なら`, `dg-text-muted`, `start`);
      cols.forEach((c, i) => {
        const x = 6 + i * 117;
        const cx = x + 57;
        s += rect(x, 6, 114, 48, `dg-fill-primary`);
        s += txt(cx, 22, c.no, `dg-text-strong dg-text-on-fill`);
        s += txt(cx, 41, c.sub, `dg-text dg-text-sm dg-text-on-fill`);
        s += rect(x, 80, 114, 44, `dg-box-muted`);
        s += txt(cx, 94, c.what[0], `dg-text`);
        s += txt(cx, 111, c.what[1], `dg-text`);
        s += rect(x, 152, 114, 30, `dg-box`);
        s += txt(cx, 167, c.who, `dg-text`);
        s += rect(x, 210, 114, 44, c.ok ? `dg-box-success` : `dg-box-danger`);
        s += txt(cx, 224, c.city[0], c.ok ? `dg-text` : `dg-text-strong dg-text-danger`);
        s += txt(cx, 241, c.city[1], c.ok ? `dg-text-strong` : `dg-text`);
      });
      return s;
    },
  });

  // ---- 6. 借地権の種類 ----
  add(`leasehold-types`, {
    title: `借地権の種類と存続期間`,
    alt: `普通借地権は30年以上で更新あり、一般定期借地権は50年以上、事業用定期借地権等は10年以上50年未満で事業用のみ・公正証書、建物譲渡特約付借地権は30年以上経過後に建物を地主に譲渡する、という存続期間を年数の軸上の帯で比べた図`,
    caption: `借地借家法3条・4条・22条・23条・24条。帯は設定できる存続期間の範囲で、右向きの先端は「以上」を表します。`,
    h: 262,
    body: () => {
      const X = (y) => 24 + y * 4.8;
      let s = ``;
      // 凡例
      s += rect(12, 8, 14, 12, `dg-fill-accent`, 2);
      s += txt(32, 14, `更新あり`, `dg-text-muted dg-text-sm`, `start`);
      s += rect(100, 8, 14, 12, `dg-fill-success`, 2);
      s += txt(120, 14, `更新なし(定期借地権)`, `dg-text-muted dg-text-sm`, `start`);
      const rows = [
        { name: `普通借地権`, tag: `更新後は20年→以後10年`, from: 30, to: null, cls: `dg-fill-accent`, label: `30年以上` },
        { name: `一般定期借地権`, tag: `書面(公正証書等)で`, from: 50, to: null, cls: `dg-fill-success`, label: `50年以上` },
        { name: `事業用定期借地権等`, tag: `事業用のみ・公正証書`, from: 10, to: 50, cls: `dg-fill-success`, label: `10年以上50年未満` },
        { name: `建物譲渡特約付借地権`, tag: `建物を地主に譲渡`, from: 30, to: null, cls: `dg-fill-success`, label: `30年以上` },
      ];
      rows.forEach((r, i) => {
        const ny = 40 + i * 50;
        const by = ny + 11;
        // 目盛りの補助線(帯の高さだけ)
        [10, 30, 50].forEach((t) => { s += line(X(t), by - 3, X(t), by + 25, `dg-line-dashed`); });
        s += txt(12, ny, r.name, `dg-text-strong`, `start`);
        s += txt(350, ny, r.tag, `dg-text-muted dg-text-sm`, `end`);
        const x1 = X(r.from);
        if (r.to === null) {
          const x2 = X(60) + 4;
          s += path(`M ${x1} ${by} H ${x2} l 12 11 l -12 11 H ${x1} Z`, r.cls);
          s += txt((x1 + x2) / 2, by + 11, r.label, `dg-text dg-text-sm dg-text-on-fill`);
        } else {
          const x2 = X(r.to);
          s += rect(x1, by, x2 - x1, 22, r.cls, 3);
          s += txt((x1 + x2) / 2, by + 11, r.label, `dg-text dg-text-sm dg-text-on-fill`);
        }
      });
      // 年数の軸
      const ay = 236;
      s += line(X(0), ay, X(60) + 16, ay, `dg-line`);
      for (let t = 0; t <= 60; t += 10) {
        s += line(X(t), ay - 4, X(t), ay + 4, `dg-line`);
        s += txt(X(t), ay + 15, t === 60 ? `60年` : String(t), `dg-text-muted dg-text-sm`);
      }
      return s;
    },
  });

  // ---- 7. 小規模宅地等の特例 ----
  add(`small-land-special`, {
    title: `小規模宅地等の特例の限度面積と減額割合`,
    alt: `特定居住用宅地等は330平方メートルまで80パーセント減額、特定事業用宅地等は400平方メートルまで80パーセント減額、貸付事業用宅地等は200平方メートルまで50パーセント減額であることを、面積に比例した帯で比べた図`,
    caption: `租税特別措置法69条の4、国税庁タックスアンサーNo.4124(令和8年4月1日現在法令等)。特定同族会社事業用宅地等も400㎡・80%。取得者や保有・居住の継続などの要件があります。`,
    h: 246,
    body: () => {
      const rows = [
        { name: `特定居住用宅地等(自宅)`, area: 330, rate: `80%減額` },
        { name: `特定事業用宅地等(店舗など)`, area: 400, rate: `80%減額` },
        { name: `貸付事業用宅地等(貸家など)`, area: 200, rate: `50%減額` },
      ];
      let s = ``;
      rows.forEach((r, i) => {
        const ny = 14 + i * 66;
        const by = ny + 14;
        s += txt(12, ny, r.name, `dg-text-strong`, `start`);
        const bw = Math.round(r.area * 0.6);
        s += rect(12, by, bw, 30, `dg-fill-primary`, 4);
        s += txt(12 + bw / 2, by + 15, `${r.area}㎡まで`, `dg-text dg-text-on-fill`);
        s += rect(270, by, 80, 30, i === 2 ? `dg-box-warning` : `dg-box-success`, 15);
        s += txt(310, by + 15, r.rate, `dg-text-strong`);
      });
      s += txt(12, 214, `※特定居住用と特定事業用は合計730㎡まで併用できる`, `dg-text-muted dg-text-sm`, `start`);
      s += txt(12, 232, `※貸付事業用と併用するときは面積の調整計算がある`, `dg-text-muted dg-text-sm`, `start`);
      return s;
    },
  });

  // ---- 8. 媒介契約3種類 ----
  add(`brokerage-contracts`, {
    title: `媒介契約3種類の比較`,
    alt: `一般媒介・専任媒介・専属専任媒介について、他業者への重ねての依頼、自己発見取引、有効期間、指定流通機構への登録期限、業務処理状況の報告頻度を比べた表`,
    caption: `宅建業法34条の2、同法施行規則15条の10。専属専任媒介は、依頼者が自分で見つけた相手とも契約できない特約付きの専任媒介です。レインズは指定流通機構のこと。`,
    h: 306,
    body: () => {
      const cx = [147, 231, 315];
      let s = ``;
      [`一般`, `専任`, `専属専任`].forEach((h, i) => {
        s += rect(cx[i] - 41, 4, 82, 40, `dg-fill-primary`);
        s += txt(cx[i], 18, h, `dg-text-strong dg-text-on-fill`);
        s += txt(cx[i], 35, `媒介契約`, `dg-text dg-text-sm dg-text-on-fill`);
      });
      const rows = [
        { label: [`他の業者にも`, `依頼できる?`], cells: [[`○`, `できる`], [`×`, `できない`], [`×`, `できない`]], sym: true },
        { label: [`自分で見つけた`, `相手と契約?`], cells: [[`○`, `できる`], [`○`, `できる`], [`×`, `できない`]], sym: true },
        { label: [`有効期間`], cells: [[`法律上は`, `制限なし`], [`3か月以内`], [`3か月以内`]] },
        { label: [`レインズ`, `への登録`], cells: [[`義務なし`], [`7日以内`, `休業日除く`], [`5日以内`, `休業日除く`]] },
        { label: [`業務状況の`, `報告`], cells: [[`義務なし`], [`2週間に`, `1回以上`], [`1週間に`, `1回以上`]] },
      ];
      rows.forEach((r, ri) => {
        const y = 48 + ri * 46;
        const my = y + 23;
        if (ri % 2 === 0) s += rect(4, y, 352, 46, `dg-fill-muted`, 0);
        if (r.label.length === 1) s += txt(10, my, r.label[0], `dg-text`, `start`);
        else { s += txt(10, my - 9, r.label[0], `dg-text`, `start`); s += txt(10, my + 9, r.label[1], `dg-text`, `start`); }
        r.cells.forEach((c, ci) => {
          const x = cx[ci];
          if (r.sym) {
            const ok = c[0] === `○`;
            s += txt(x, my - 8, c[0], `dg-text-strong dg-text-lg ${ok ? `dg-text-primary` : `dg-text-danger`}`);
            s += txt(x, my + 11, c[1], `dg-text-muted dg-text-sm`);
          } else if (c.length === 1) {
            s += txt(x, my, c[0], c[0] === `義務なし` ? `dg-text` : `dg-text-strong`);
          } else if (c[1] === `休業日除く`) {
            s += txt(x, my - 8, c[0], `dg-text-strong`);
            s += txt(x, my + 11, c[1], `dg-text-muted dg-text-sm`);
          } else {
            const cls = ri === 4 ? `dg-text-strong` : `dg-text`;
            s += txt(x, my - 9, c[0], cls);
            s += txt(x, my + 9, c[1], cls);
          }
        });
      });
      s += line(4, 278, 356, 278, `dg-line`);
      s += txt(W / 2, 294, `※購入の申込みがあった旨の報告は3種類とも必要`, `dg-text-muted dg-text-sm`);
      return s;
    },
  });

  // ---- 9. 35条書面と37条書面 ----
  add(`doc35-vs-37`, {
    title: `35条書面と37条書面のちがい`,
    alt: `35条書面は契約成立前に買主・借主などへ宅建士が説明し記名する書面、37条書面は契約成立後に契約の当事者に交付し宅建士の記名は必要だが説明は不要な書面であることを比べた表`,
    caption: `宅建業法35条(重要事項の説明等)・37条(書面の交付)。記載事項は一部の例です。37条書面は、売買・交換では契約成立後遅滞なく(37条1項)、貸借では契約が成立したときに(同条2項)交付します。相手方が宅建業者なら35条の説明は不要(書面の交付と宅建士の記名は必要)。相手方の承諾があれば電磁的方法での提供もできます。`,
    h: 340,
    body: () => {
      const L = 6;
      const R = 184;
      const cw = 170;
      const lc = L + cw / 2;
      const rc = R + cw / 2;
      let s = ``;
      s += rect(L, 4, cw, 46, `dg-fill-primary`);
      s += txt(lc, 20, `35条書面`, `dg-text-strong dg-text-on-fill`);
      s += txt(lc, 38, `重要事項説明書`, `dg-text dg-text-sm dg-text-on-fill`);
      s += rect(R, 4, cw, 46, `dg-fill-primary`);
      s += txt(rc, 20, `37条書面`, `dg-text-strong dg-text-on-fill`);
      s += txt(rc, 38, `契約内容を記した書面`, `dg-text dg-text-sm dg-text-on-fill`);
      // 誰に
      s += txt(8, 66, `誰に`, `dg-text-muted`, `start`);
      s += rect(L, 76, cw, 44, `dg-box-muted`);
      s += txt(lc, 90, `買主・借主など`, `dg-text-strong`);
      s += txt(lc, 108, `取得する人・借りる人`, `dg-text-muted dg-text-sm`);
      s += rect(R, 76, cw, 44, `dg-box-muted`);
      s += txt(rc, 90, `契約の当事者`, `dg-text-strong`);
      s += txt(rc, 108, `媒介なら当事者の双方`, `dg-text-muted dg-text-sm`);
      // いつ
      s += txt(8, 136, `いつ`, `dg-text-muted`, `start`);
      s += rect(L, 146, cw, 30, `dg-box-muted`);
      s += txt(lc, 161, `契約が成立する前`, `dg-text-strong`);
      s += rect(R, 146, cw, 30, `dg-box-muted`);
      s += txt(rc, 161, `契約が成立した後`, `dg-text-strong`);
      // 宅建士
      s += txt(8, 192, `宅建士がすること`, `dg-text-muted`, `start`);
      s += rect(L, 202, cw, 40, `dg-box-primary`);
      s += txt(lc, 222, `説明 ＋ 記名`, `dg-text-strong dg-text-primary`);
      s += rect(R, 202, cw, 40, `dg-box-primary`);
      s += txt(rc, 214, `記名のみ`, `dg-text-strong dg-text-primary`);
      s += txt(rc, 232, `説明は不要`, `dg-text-muted dg-text-sm`);
      // 主な記載事項
      s += txt(8, 258, `主な記載事項(例)`, `dg-text-muted`, `start`);
      s += rect(L, 268, cw, 64, `dg-box-muted`);
      [`登記された権利`, `法令上の制限`, `水道・電気・ガス`].forEach((t, i) => { s += txt(lc, 284 + i * 16, t, `dg-text`); });
      s += rect(R, 268, cw, 64, `dg-box-muted`);
      [`当事者の氏名・住所`, `代金・借賃と支払方法`, `引渡しの時期`].forEach((t, i) => { s += txt(rc, 284 + i * 16, t, `dg-text`); });
      return s;
    },
  });

  // ---- 10. 8種制限 ----
  add(`eight-restrictions`, {
    title: `8種制限(宅建業者が自ら売主の場合)`,
    alt: `売主が宅建業者で買主が宅建業者以外のときだけ適用される8種制限、すなわち他人物売買等の制限、クーリング・オフ、損害賠償額の予定等の制限、手付の額の制限等、担保責任の特約の制限、手付金等の保全、割賦販売の解除等の制限、所有権留保等の禁止を並べた図`,
    caption: `宅建業法33条の2・37条の2・38〜43条。78条2項により宅建業者どうしの取引には適用されません。`,
    h: 290,
    body: () => {
      const items = [
        [`他人物売買等の制限`, `33条の2`],
        [`クーリング・オフ`, `37条の2`],
        [`損害賠償額の予定等`, `38条・代金の2/10まで`],
        [`手付の額の制限等`, `39条・代金の2/10まで`],
        [`担保責任の特約制限`, `40条・不利な特約は無効`],
        [`手付金等の保全`, `41条・41条の2`],
        [`割賦の解除等の制限`, `42条・30日以上の催告`],
        [`所有権留保等の禁止`, `43条`],
      ];
      let s = ``;
      s += rect(6, 4, 348, 52, `dg-box-warning`);
      s += txt(W / 2, 22, `売主＝宅建業者 × 買主＝業者以外`, `dg-text-strong`);
      s += txt(W / 2, 42, `のときだけ適用(業者どうしの取引には適用なし)`, `dg-text dg-text-sm`);
      items.forEach((it, i) => {
        const x = i % 2 === 0 ? 6 : 184;
        const y = 66 + Math.floor(i / 2) * 56;
        s += rect(x, y, 170, 48, `dg-box`);
        s += circle(x + 16, y + 24, 10, `dg-fill-primary`);
        s += txt(x + 16, y + 24, String(i + 1), `dg-text dg-text-sm dg-text-on-fill`);
        s += txt(x + 32, y + 16, it[0], `dg-text`, `start`);
        s += txt(x + 32, y + 34, it[1], `dg-text-muted dg-text-sm`, `start`);
      });
      return s;
    },
  });

  // ---- 11. 賃貸借契約までの流れ ----
  add(`rental-flow`, {
    title: `賃貸借契約を結ぶまでの流れ`,
    alt: `物件探し、内見、入居申込み、入居審査、重要事項説明、契約締結、初期費用の支払い、鍵を受け取って入居、という順番を縦に並べた流れ図`,
    caption: `一般的な順番です。会社によっては契約締結と初期費用の支払いの順が前後することもあります。重要事項説明は宅建業法35条、契約書面は37条。`,
    h: 324,
    body: () => {
      const steps = [
        [`物件探し`, `エリアと予算を決める`],
        [`内見`, `部屋と周辺を実際に確認`],
        [`入居申込み`, `身分証・収入資料を準備`],
        [`入居審査`, `大家や保証会社が審査`],
        [`重要事項説明`, `宅建士が説明(35条)`],
        [`契約締結`, `契約書面を受け取る(37条)`],
        [`初期費用の支払い`, `敷金・礼金・前家賃など`],
        [`鍵を受け取って入居`, ``],
      ];
      const bx = 36;
      const bw = 146;
      const bc = bx + bw / 2;
      let s = ``;
      steps.forEach((st, i) => {
        const y = 8 + i * 40;
        const last = i === steps.length - 1;
        const cls = last ? `dg-box-success` : (i === 4 || i === 5 ? `dg-box-accent` : `dg-box`);
        s += circle(18, y + 14, 11, last ? `dg-fill-success` : `dg-fill-accent`);
        s += txt(18, y + 14, String(i + 1), `dg-text-strong dg-text-on-fill`);
        s += rect(bx, y, bw, 28, cls);
        s += txt(bc, y + 14, st[0], last ? `dg-text-strong` : `dg-text`);
        if (st[1]) s += txt(192, y + 14, st[1], `dg-text-muted dg-text-sm`, `start`);
        if (!last) s += arrow(bc, y + 28, bc, y + 40);
      });
      return s;
    },
  });

  // ---- 12. 間隔反復学習のしくみ ----
  add(`srs-cycle`, {
    title: `間隔反復学習のしくみ`,
    alt: `用語カードは今日学習したあと、思い出せれば1日後、6日後、15日後と復習の間隔がのびていき、もう一度を押すと今日の復習に戻ること、問題で間違えた用語も今日の復習に入ることを示した図`,
    caption: `間隔は「普通」を選び続けたときの目安です。「簡単」ならもっと延び、「難しい」なら短めになります。`,
    h: 216,
    body: () => {
      const boxes = [
        [`今日`, `覚える`],
        [`1日後`, `復習`],
        [`6日後`, `復習`],
        [`15日後`, `さらに先へ`],
      ];
      let s = ``;
      s += txt(W / 2, 14, `思い出せたら、次の復習までの間隔がのびる`, `dg-text-strong`);
      boxes.forEach((b, i) => {
        const x = 6 + i * 93;
        s += rect(x, 32, 72, 48, i === 0 ? `dg-box-primary` : `dg-box`);
        s += txt(x + 36, 48, b[0], `dg-text-strong`);
        s += txt(x + 36, 67, b[1], `dg-text-muted dg-text-sm`);
        if (i < boxes.length - 1) s += arrow(x + 72, 56, x + 93, 56, `dg-line-primary`, `dg-arrowhead-primary`);
      });
      // 「もう一度」で今日へ戻るループ
      s += path(`M 135 80 V 108 M 228 80 V 108 M 321 80 V 108 H 42 V 87`, `dg-line-danger`);
      s += path(`M 42 81 l -5 8 h 10 z`, `dg-fill-danger`);
      s += txt(W / 2, 126, `「もう一度」を押すと、今日の復習に戻る`, `dg-text dg-text-danger`);
      // 問題との連携
      s += rect(30, 150, 300, 58, `dg-box-warning`);
      s += txt(W / 2, 168, `問題で間違えた用語も`, `dg-text`);
      s += txt(W / 2, 190, `自動で「今日の復習」に入る`, `dg-text-strong`);
      return s;
    },
  });

  // ---- 13. 宅建業の免許の種類と有効期間 ----
  add(`license-types`, {
    title: `宅建業の免許の種類と有効期間`,
    alt: `宅建業の免許は、事務所を1つの都道府県内だけに置くなら都道府県知事の免許、2つ以上の都道府県に置くなら国土交通大臣の免許で、区別は事務所の場所によること、どちらも有効期間は5年で、更新の申請は有効期間の満了日の90日前から30日前までに行い、満了日までに処分がなければ処分があるまで従前の免許が有効で、更新後の有効期間は従前の満了日の翌日から5年になることを示した図`,
    caption: `宅建業法3条1項〜5項、同法施行令1条の2、同法施行規則3条。事務所は本店・支店と、継続的に業務を行える施設で契約締結権限のある使用人を置く場所です。宅建業を営まない支店は事務所に当たりません(国交省「宅地建物取引業法の解釈・運用の考え方」)。事務所の新設・廃止で免許権者が変わるときは免許換えが必要です(7条)。`,
    h: 318,
    body: () => {
      let s = ``;
      const cols = [
        { x: 6, head: `都道府県知事の免許`, note: `事務所が1つの都道府県内だけ` },
        { x: 184, head: `国土交通大臣の免許`, note: `2つ以上の都道府県に事務所` },
      ];
      cols.forEach((c) => {
        s += rect(c.x, 4, 170, 32, `dg-fill-primary`);
        s += txt(c.x + 85, 20, c.head, `dg-text-strong dg-text-on-fill`);
        s += txt(c.x + 85, 124, c.note, `dg-text dg-text-sm`);
      });
      // 事務所の置き方(左: 1つの県だけ / 右: 2つの県)
      const office = (x, label) => rect(x, 70, 52, 26, `dg-box-primary`, 4) + txt(x + 26, 83, label, `dg-text dg-text-sm`);
      s += rect(16, 44, 150, 66, `dg-box-muted`, 10);
      s += txt(24, 56, `A県`, `dg-text-muted dg-text-sm`, `start`);
      s += office(34, `本店`) + office(98, `支店`);
      s += rect(190, 44, 76, 66, `dg-box-muted`, 10);
      s += txt(198, 56, `A県`, `dg-text-muted dg-text-sm`, `start`);
      s += office(202, `本店`);
      s += rect(272, 44, 76, 66, `dg-box-muted`, 10);
      s += txt(280, 56, `B県`, `dg-text-muted dg-text-sm`, `start`);
      s += office(284, `支店`);
      // 共通点
      s += rect(6, 140, 348, 50, `dg-box-warning`);
      s += txt(W / 2, 157, `どちらも有効期間は5年`, `dg-text-strong`);
      s += txt(W / 2, 177, `区別は事務所の場所(取引できる地域の差ではない)`, `dg-text dg-text-sm`);
      // 更新の申請期間(時間の軸は途中を省略)
      s += txt(8, 210, `更新は満了日の90日前〜30日前に申請`, `dg-text-strong`, `start`);
      const ay = 246;
      s += line(16, ay, 344, ay, `dg-line`);
      s += path(`M 102 ${ay + 7} l 6 -14 M 110 ${ay + 7} l 6 -14`, `dg-line`);
      s += txt(60, 234, `有効期間5年`, `dg-text-muted dg-text-sm`);
      s += rect(210, ay - 11, 70, 22, `dg-fill-primary`, 3);
      s += txt(245, ay, `申請期間`, `dg-text dg-text-sm dg-text-on-fill`);
      [16, 210, 280, 330].forEach((x) => { s += line(x, ay - 5, x, ay + 5, `dg-line-strong`); });
      s += txt(16, 266, `免許の日`, `dg-text-muted dg-text-sm`, `start`);
      s += txt(210, 266, `90日前`, `dg-text dg-text-sm`);
      s += txt(280, 266, `30日前`, `dg-text dg-text-sm`);
      s += txt(330, 266, `満了日`, `dg-text-strong`);
      s += txt(8, 288, `満了日までに処分がなければ、処分があるまで従前の免許が有効`, `dg-text dg-text-sm`, `start`);
      s += txt(8, 306, `更新後の有効期間は、従前の満了日の翌日から5年`, `dg-text dg-text-sm`, `start`);
      return s;
    },
  });

  // ---- 14. 営業保証金と保証協会 ----
  add(`deposit-vs-guarantee`, {
    title: `営業保証金と保証協会(弁済業務保証金分担金)`,
    alt: `営業保証金と、保証協会に加入する場合の弁済業務保証金分担金を比べた表。営業保証金は主たる事務所の最寄りの供託所に、本店1,000万円と支店1か所ごとに500万円を供託し、供託して免許権者に届け出た後でなければ事業を開始できず、支店を増やしたときも供託と届出の後にその支店で事業を開始する。保証協会に加入する場合は、本店60万円と支店1か所ごとに30万円の分担金を加入しようとする日までに協会に納付し(協会が供託所に供託する)、支店を増やしたときは増設の日から2週間以内に納付する。還付の上限は、営業保証金は供託した額、保証協会は営業保証金と同じ額(協会の認証が必要)で、還付を受けられるのは宅建業者以外の取引の相手方。例えば本店と支店2か所なら、営業保証金は2,000万円、分担金は120万円`,
    caption: `宅建業法25条〜27条・64条の7〜64条の9、同法施行令2条の4・7条。保証協会は納付を受けた日から1週間以内に、同じ額の弁済業務保証金を供託します(64条の7)。`,
    h: 354,
    body: () => {
      const cx = [162, 290];
      let s = ``;
      [[`営業保証金`, `供託所に供託`], [`保証協会に加入`, `分担金を納付`]].forEach((hd, i) => {
        s += rect(cx[i] - 61, 4, 122, 44, `dg-fill-primary`);
        s += txt(cx[i], 18, hd[0], `dg-text-strong dg-text-on-fill`);
        s += txt(cx[i], 36, hd[1], `dg-text dg-text-sm dg-text-on-fill`);
      });
      const rows = [
        { label: [`預ける先`], cells: [[`主たる事務所の`, `最寄りの供託所`], [`保証協会`, `(協会が供託所へ)`]] },
        { label: [`本店`, `主たる事務所`], cells: [[`1,000万円`], [`60万円`]], big: true },
        { label: [`支店`, `1か所ごとに`], cells: [[`500万円`], [`30万円`]], big: true },
        { label: [`いつまでに`], cells: [[`供託・届出の後に`, `事業を開始`], [`加入しようと`, `する日まで`]] },
        { label: [`支店を`, `増やしたら`], cells: [[`供託・届出の後に`, `その支店で開始`], [`増設の日から`, `2週間以内に納付`]] },
        { label: [`還付の上限`], cells: [[`供託した`, `営業保証金の額`], [`営業保証金と同じ額`, `協会の認証が必要`]] },
      ];
      rows.forEach((r, ri) => {
        const y = 52 + ri * 42;
        const my = y + 21;
        if (ri % 2 === 0) s += rect(4, y, 352, 42, `dg-fill-muted`, 0);
        if (r.label.length === 1) s += txt(10, my, r.label[0], `dg-text`, `start`);
        else { s += txt(10, my - 8, r.label[0], `dg-text`, `start`); s += txt(10, my + 9, r.label[1], `dg-text-muted dg-text-sm`, `start`); }
        r.cells.forEach((c, ci) => {
          const x = cx[ci];
          if (r.big) s += txt(x, my, c[0], `dg-text-strong dg-text-lg dg-text-primary`);
          else if (c.length === 1) s += txt(x, my, c[0], `dg-text`);
          else {
            s += txt(x, my - 8, c[0], `dg-text`);
            s += txt(x, my + 9, c[1], ri === 0 || ri === 5 ? `dg-text-muted dg-text-sm` : `dg-text`);
          }
        });
      });
      s += line(4, 308, 356, 308, `dg-line`);
      s += txt(W / 2, 322, `還付を受けられるのは、宅建業者以外の取引の相手方`, `dg-text-muted dg-text-sm`);
      s += txt(W / 2, 340, `例: 本店＋支店2か所なら 2,000万円 と 120万円`, `dg-text-strong`);
      return s;
    },
  });

  // ---- 15. クーリング・オフの判定 ----
  add(`cooling-off-check`, {
    title: `クーリング・オフできるかの判定`,
    alt: `宅建業者が自ら売主で買主が宅建業者以外の売買を前提に、クーリング・オフできるかを判定する流れ図。買受けの申込みをした場所が事務所等(事務所や専任の宅建士を置くべき案内所(土地に定着する建物内のもの)など)ならできない。クーリング・オフについて書面で告げられた日から8日を経過していればできない。物件の引渡しを受け、かつ代金を全部支払っていればできない。どれにも当たらなければ書面でクーリング・オフでき、書面を発した時に効力が生じ、宅建業者は損害賠償や違約金を請求できず、受け取った手付金などを返す`,
    caption: `宅建業法37条の2・78条2項、同法施行規則16条の5・16条の6。事務所等で申込みをすれば、その後どこで契約してもできません。買主が自ら申し出た自宅・勤務先は事務所等に含まれ、土地に定着する建物内にない案内所(テントなど)は含まれません。`,
    h: 384,
    body: () => {
      let s = ``;
      s += rect(6, 4, 348, 46, `dg-box-warning`);
      s += txt(W / 2, 20, `前提: 売主＝宅建業者、買主＝業者以外`, `dg-text-strong`);
      s += txt(W / 2, 39, `宅建業者どうしの取引には適用されない`, `dg-text dg-text-sm`);
      const steps = [
        { y: 72, h: 62, lines: [`買受けの申込みをした場所は`, `「事務所等」?`], sub: `事務所・専任の宅建士を置くべき案内所等` },
        { y: 164, h: 50, lines: [`クーリング・オフについて書面で`, `告げられた日から8日経過した?`] },
        { y: 244, h: 50, lines: [`物件の引渡しを受け、かつ`, `代金を全部支払った?`] },
      ];
      s += arrow(24, 50, 24, 72);
      steps.forEach((q, i) => {
        s += decisionStep(Object.assign({ stop: `はい`, result: `できない` }, q));
        const y1 = q.y + q.h;
        const y2 = i < steps.length - 1 ? steps[i + 1].y : 318;
        s += arrow(24, y1, 24, y2);
        s += txt(32, (y1 + y2) / 2, `いいえ`, `dg-text dg-text-sm`, `start`);
      });
      s += rect(6, 318, 348, 62, `dg-box-success`);
      s += txt(W / 2, 334, `クーリング・オフできる`, `dg-text-strong`);
      s += txt(W / 2, 353, `書面を発した時に効力が生じる`, `dg-text dg-text-sm`);
      s += txt(W / 2, 370, `業者は損害賠償等を請求できず、受け取った金銭を返す`, `dg-text dg-text-sm`);
      return s;
    },
  });

  // ---- 16. 売買の媒介報酬の上限 ----
  add(`brokerage-fee-cap`, {
    title: `売買の媒介報酬の上限(依頼者の一方から)`,
    alt: `売買の媒介で宅建業者が依頼者の一方から受け取れる報酬の上限を示した図。税抜の代金のうち200万円以下の部分に5パーセント、200万円超400万円以下の部分に4パーセント、400万円を超える部分に3パーセントを掛けて合計する。速算式は、代金が400万円超なら代金×3パーセント＋6万円、200万円超400万円以下なら代金×4パーセント＋2万円、200万円以下なら代金×5パーセントで、課税事業者はこれに消費税等相当額の10パーセントを加える。例えば代金3,000万円なら96万円、税込105万6,000円。代金(税抜)800万円以下の低廉な空家等の売買の媒介は、費用を勘案して30万円の1.1倍の33万円まで受け取れるが、媒介契約の締結時にあらかじめ報酬額を依頼者に説明し、合意しておく必要がある`,
    caption: `宅建業法46条、報酬告示(昭和45年建設省告示第1552号、最終改正 令和6年国土交通省告示第949号)の第二・第七、国交省「宅地建物取引業法の解釈・運用の考え方」(46条1項関係)。代理は媒介の上限の2倍まで(第三)、貸借の媒介は双方から合計で借賃1か月分×1.1まで(第四)。`,
    h: 394,
    body: () => {
      let s = ``;
      s += txt(8, 12, `代金(税抜)を価格帯に分け、それぞれに率を掛けて合計`, `dg-text-muted`, `start`);
      const segs = [
        { x: 8, w: 104, cls: `dg-box-accent`, rate: `5%`, inc: `税込5.5%` },
        { x: 114, w: 104, cls: `dg-box-teal`, rate: `4%`, inc: `税込4.4%` },
      ];
      segs.forEach((g) => {
        s += rect(g.x, 28, g.w, 44, g.cls, 4);
        s += txt(g.x + g.w / 2, 44, g.rate, `dg-text-strong dg-text-lg`);
        s += txt(g.x + g.w / 2, 62, g.inc, `dg-text-muted dg-text-sm`);
      });
      s += path(`M 220 28 H 338 l 14 22 l -14 22 H 220 Z`, `dg-box-success`);
      s += txt(279, 44, `3%`, `dg-text-strong dg-text-lg`);
      s += txt(279, 62, `税込3.3%`, `dg-text-muted dg-text-sm`);
      s += txt(113, 86, `200万円`, `dg-text-muted dg-text-sm`);
      s += txt(219, 86, `400万円`, `dg-text-muted dg-text-sm`);
      s += txt(8, 108, `速算式(代金は税抜)`, `dg-text-strong`, `start`);
      [[`400万円超`, `代金×3%＋6万円`], [`200万円超〜400万円以下`, `代金×4%＋2万円`], [`200万円以下`, `代金×5%`]].forEach((r, i) => {
        const y = 120 + i * 30;
        s += rect(8, y, 344, 26, `dg-box-muted`, 4);
        s += txt(18, y + 13, r[0], `dg-text`, `start`);
        s += txt(342, y + 13, r[1], `dg-text-strong`, `end`);
      });
      s += txt(W / 2, 220, `課税事業者は、これに消費税等相当額(10%)を加える`, `dg-text dg-text-sm`);
      s += rect(8, 234, 344, 66, `dg-box-warning`);
      s += txt(W / 2, 251, `例: 代金3,000万円の売買の媒介`, `dg-text-strong`);
      s += txt(W / 2, 270, `3,000万円×3%＋6万円＝96万円`, `dg-text`);
      s += txt(W / 2, 288, `税込なら105万6,000円まで`, `dg-text-strong`);
      s += rect(8, 308, 344, 80, `dg-box-success`);
      s += txt(W / 2, 324, `低廉な空家等の特例(2024年7月〜)`, `dg-text-strong`);
      s += txt(W / 2, 343, `代金(税抜)800万円以下の宅地・建物の売買の媒介は`, `dg-text dg-text-sm`);
      s += txt(W / 2, 360, `費用を勘案して30万円×1.1(33万円)まで`, `dg-text dg-text-sm`);
      s += txt(W / 2, 377, `媒介契約の締結時に、事前の説明と合意が必要`, `dg-text-strong dg-text-sm`);
      return s;
    },
  });

  // ---- 17. 手付金等の保全措置 ----
  add(`deposit-protection`, {
    title: `手付金等の保全措置が必要になる額`,
    alt: `宅建業者が自ら売主となり買主が宅建業者以外の売買で、手付金等を受け取る前に保全措置が必要になる額を、未完成物件と完成物件で比べた図。未完成物件は代金の5パーセント超または1,000万円超、完成物件は代金の10パーセント超または1,000万円超で必要になる。保全の方法は、未完成物件では銀行等による保証と保険事業者の保証保険、完成物件ではこの2つのほか指定保管機関による保管も使える。例えば代金4,000万円なら未完成物件は200万円、完成物件は400万円を超えると必要で、代金1億5,000万円なら未完成物件は750万円、完成物件は1,000万円を超えると必要。基準を超えたら超えた部分だけでなく全額を保全し、買主への所有権移転の登記がされたら不要`,
    caption: `宅建業法41条・41条の2・78条2項、同法施行令3条の5。宅建業者が自ら売主で、買主が宅建業者以外の場合の規制です。手付金等は、契約の日以後・引渡し前に支払われ代金に充てられる手付金・中間金などです。完成・未完成は売買契約の時点で判断します。保全措置がなければ、買主は手付金等を支払わないことができます(41条4項)。`,
    h: 384,
    body: () => {
      const cols = [
        { x: 6, head: `未完成物件`, sub: `契約時に工事完了前`, rate: `代金の5%超`, how: [`銀行等による保証`, `保険事業者の保証保険`], ex1: `200万円を超えたら必要`, ex2: `750万円を超えたら必要` },
        { x: 184, head: `完成物件`, sub: `契約時に工事完了後`, rate: `代金の10%超`, how: [`左の2つのほか`, `指定保管機関による保管`], ex1: `400万円を超えたら必要`, ex2: `1,000万円を超えたら必要` },
      ];
      let s = ``;
      s += txt(8, 64, `保全措置が必要になる手付金等の額`, `dg-text-muted`, `start`);
      s += txt(8, 146, `保全の方法`, `dg-text-muted`, `start`);
      s += txt(8, 222, `例: 代金4,000万円なら`, `dg-text-muted`, `start`);
      s += txt(8, 282, `例: 代金1億5,000万円なら`, `dg-text-muted`, `start`);
      cols.forEach((c) => {
        const cx = c.x + 85;
        s += rect(c.x, 4, 170, 46, `dg-fill-primary`);
        s += txt(cx, 19, c.head, `dg-text-strong dg-text-on-fill`);
        s += txt(cx, 37, c.sub, `dg-text dg-text-sm dg-text-on-fill`);
        s += rect(c.x, 74, 170, 56, `dg-box-primary`);
        s += txt(cx, 92, c.rate, `dg-text-strong dg-text-lg dg-text-primary`);
        s += txt(cx, 114, `または1,000万円超`, `dg-text-strong`);
        s += rect(c.x, 156, 170, 50, `dg-box-muted`);
        s += lines(cx, 172, c.how, `dg-text`, `middle`, 18);
        s += rect(c.x, 232, 170, 34, `dg-box`);
        s += txt(cx, 249, c.ex1, `dg-text`);
        s += rect(c.x, 292, 170, 34, `dg-box`);
        s += txt(cx, 309, c.ex2, `dg-text`);
      });
      s += txt(W / 2, 348, `基準を超えたら、超えた部分だけでなく全額を保全`, `dg-text dg-text-sm`);
      s += txt(W / 2, 368, `買主への所有権移転の登記がされたら不要`, `dg-text-muted dg-text-sm`);
      return s;
    },
  });

  // ---- 18. 二重譲渡と対抗要件 ----
  add(`double-sale`, {
    title: `二重譲渡は先に登記した方が勝つ(民法177条)`,
    alt: `売主Aが同じ不動産を先にBへ、後でCへ売った二重譲渡で、契約の先後ではなく登記の先後で決まり、先に登記をしたCが所有権を主張でき、登記のないBはCに所有権を対抗できないこと、BはAに債務不履行の責任(損害賠償など)を問えること、ただしCが背信的悪意者ならBは登記がなくてもCに対抗でき、単に事情を知っていただけのCは保護されることを示した図`,
    caption: `民法177条・415条。177条の第三者は登記がないことを主張する正当な利益を持つ者に限られ、背信的悪意者(最判昭和43年8月2日 民集22巻8号1571頁)や不法占拠者には登記がなくても対抗できます(判例)。`,
    h: 336,
    body: () => {
      let s = ``;
      s += txt(W / 2, 12, `契約の先後ではなく、登記の先後で決まる`, `dg-text-strong`);
      s += rect(120, 28, 120, 40, `dg-box`);
      s += txt(W / 2, 48, `A(売主)`, `dg-text-strong`);
      s += path(`M 150 68 V 84 H 72 V 112`, `dg-line`) + head(72, 118, `d`);
      s += path(`M 210 68 V 84 H 288 V 112`, `dg-line`) + head(288, 118, `d`);
      s += txt(12, 84, `①先に契約`, `dg-text dg-text-sm`, `start`);
      s += txt(348, 84, `②後で契約`, `dg-text dg-text-sm`, `end`);
      s += rect(12, 118, 120, 54, `dg-box`);
      s += txt(72, 136, `B(買主1)`, `dg-text-strong`);
      s += txt(72, 156, `登記なし`, `dg-text dg-text-sm dg-text-danger`);
      s += rect(228, 118, 120, 54, `dg-box-accent`);
      s += txt(288, 136, `C(買主2)`, `dg-text-strong`);
      s += txt(288, 156, `③先に登記`, `dg-text dg-text-sm dg-text-accent`);
      s += rect(12, 184, 120, 44, `dg-box-danger`);
      s += txt(72, 199, `Cに所有権を`, `dg-text dg-text-sm`);
      s += txt(72, 216, `対抗できない`, `dg-text-strong dg-text-danger`);
      s += rect(228, 184, 120, 44, `dg-box-success`);
      s += txt(288, 199, `所有権を`, `dg-text dg-text-sm`);
      s += txt(288, 216, `主張できる`, `dg-text-strong`);
      s += txt(W / 2, 246, `BはAに債務不履行の責任(損害賠償など)を問える`, `dg-text dg-text-sm`);
      s += rect(6, 262, 348, 66, `dg-box-warning`);
      s += txt(W / 2, 278, `例外: Cが「背信的悪意者」なら`, `dg-text-strong`);
      s += txt(W / 2, 297, `Bは登記がなくてもCに対抗できる`, `dg-text dg-text-sm`);
      s += txt(W / 2, 314, `単に事情を知っていただけ(悪意)ならCが勝つ`, `dg-text dg-text-sm`);
      return s;
    },
  });

  // ---- 19. 法定地上権の成否 ----
  add(`statutory-superficies`, {
    title: `法定地上権が成立するか`,
    alt: `法定地上権が成立するかを判定する流れ図。抵当権を設定した時点で判断し、抵当権は土地と建物の一方でも両方でもよい。設定の時に土地の上に建物がなければ成立せず、更地に抵当権を設定した後で建てた建物は、抵当権者が建築を承認していても成立しない。設定の時に土地と建物の所有者が別々なら成立しない。どちらも満たし、抵当権の実行(競売)で土地と建物の所有者が別々になると法定地上権が成立し、地代は当事者の請求により裁判所が定める`,
    caption: `民法388条、最判昭和36年2月10日(民集15巻2号219頁)。更地に抵当権を設定した後に建てられた建物は、原則として土地と一括して競売できます(389条。優先して弁済を受けられるのは土地の代価だけ)。`,
    h: 326,
    body: () => {
      let s = ``;
      s += rect(6, 4, 348, 46, `dg-box-warning`);
      s += txt(W / 2, 20, `抵当権を設定した時点で判断する`, `dg-text-strong`);
      s += txt(W / 2, 39, `抵当権は土地・建物の一方でも両方でもよい`, `dg-text dg-text-sm`);
      const stepCls = { stop: `いいえ`, result: `成立しない` };
      s += arrow(24, 50, 24, 72);
      s += decisionStep(Object.assign({ y: 72, h: 50, lines: [`そのとき土地の上に`, `建物があった?`] }, stepCls));
      s += txt(44, 136, `更地に設定した後で建てた建物は×(建築を承認していても)`, `dg-text-muted dg-text-sm`, `start`);
      s += arrow(24, 122, 24, 164);
      s += txt(32, 154, `はい`, `dg-text dg-text-sm`, `start`);
      s += decisionStep(Object.assign({ y: 164, h: 50, lines: [`そのとき土地と建物の`, `所有者は同じだった?`] }, stepCls));
      s += arrow(24, 214, 24, 240);
      s += txt(32, 227, `はい`, `dg-text dg-text-sm`, `start`);
      s += rect(6, 240, 348, 80, `dg-box-success`);
      s += txt(W / 2, 257, `抵当権の実行(競売)で土地と建物の所有者が別々になると`, `dg-text dg-text-sm`);
      s += txt(W / 2, 280, `法定地上権が成立する`, `dg-text-strong dg-text-lg`);
      s += txt(W / 2, 303, `地代は当事者の請求により裁判所が定める`, `dg-text-muted dg-text-sm`);
      return s;
    },
  });

  // ---- 20. 区分所有法の決議要件 ----
  add(`condo-resolutions`, {
    title: `区分所有法の決議要件(2026年4月施行の改正後)`,
    alt: `2026年4月1日施行の改正後の区分所有法の決議要件を3段階で示した図。普通決議は出席した区分所有者とその議決権の各過半数で、例は管理者の選任・解任や共用部分の管理。特別決議は区分所有者と議決権の各過半数が出席(定足数)したうえで出席者の各4分の3以上で、規約の設定・変更・廃止、共用部分の重大な変更、管理組合法人の設立、義務違反者に対する使用禁止や競売の請求など。建物価格の2分の1を超える部分が滅失したときの復旧と、瑕疵の除去・バリアフリー化のための共用部分の変更は出席者の各3分の2以上。建替え・建物の更新・建物敷地売却・取壊しなどは出席者ではなく区分所有者と議決権の全体の各5分の4以上で、耐震性の不足や外壁等の剝落のおそれなど一定の事由がある建物は各4分の3以上に緩和される。所在等不明の区分所有者は、裁判所の決定で母数から除ける`,
    caption: `区分所有法17条・31条・38条の2・39条・47条・58条〜61条・62条・64条の5〜64条の8(令和7年法律第47号による改正)。建物敷地売却などは敷地利用権の持分の価格の各5分の4以上も必要です。共用部分の重大な変更などは、規約で割合を変えられる場合があります。`,
    h: 388,
    body: () => {
      let s = ``;
      const bar = (y, frac, cls) => rect(16, y, 328, 12, `dg-fill-muted`, 3) + rect(16, y, Math.round(328 * frac), 12, cls, 3);
      // 普通決議
      s += rect(6, 4, 348, 82, `dg-box`);
      s += txt(16, 22, `普通決議`, `dg-text-strong`, `start`);
      s += txt(344, 22, `出席者の各過半数`, `dg-text-strong dg-text-primary`, `end`);
      s += bar(34, 1 / 2, `dg-fill-primary`);
      s += txt(16, 60, `母数は出席した区分所有者・議決権`, `dg-text-muted dg-text-sm`, `start`);
      s += txt(16, 76, `例: 管理者の選任・解任、共用部分の管理`, `dg-text dg-text-sm`, `start`);
      // 特別決議
      s += rect(6, 94, 348, 136, `dg-box-primary`);
      s += txt(16, 112, `特別決議`, `dg-text-strong`, `start`);
      s += txt(344, 112, `出席者の各3/4以上`, `dg-text-strong dg-text-primary`, `end`);
      s += bar(124, 3 / 4, `dg-fill-primary`);
      s += txt(16, 151, `定足数: 区分所有者・議決権の各過半数が出席`, `dg-text-muted dg-text-sm`, `start`);
      s += txt(16, 169, `規約の設定・変更・廃止、共用部分の重大な変更、`, `dg-text dg-text-sm`, `start`);
      s += txt(16, 185, `管理組合法人の設立、義務違反者の使用禁止・競売請求`, `dg-text dg-text-sm`, `start`);
      s += txt(16, 204, `※大規模滅失の復旧、瑕疵の除去・バリアフリー化の`, `dg-text-muted dg-text-sm`, `start`);
      s += txt(16, 220, `　共用部分の変更は、出席者の各2/3以上`, `dg-text-muted dg-text-sm`, `start`);
      // 建替え決議など
      s += rect(6, 238, 348, 124, `dg-box-accent`);
      s += txt(16, 255, `建替え決議など`, `dg-text-strong`, `start`);
      s += txt(344, 255, `全体の各4/5以上`, `dg-text-strong dg-text-accent`, `end`);
      s += bar(272, 4 / 5, `dg-fill-accent`);
      s += line(262, 267, 262, 289, `dg-line-dashed`);
      s += txt(16, 302, `母数は出席者ではなく、区分所有者・議決権の全体`, `dg-text-muted dg-text-sm`, `start`);
      s += txt(16, 319, `建替え・建物の更新・建物敷地売却・取壊しなど`, `dg-text dg-text-sm`, `start`);
      s += txt(16, 336, `耐震性不足・外壁等の剝落のおそれなど一定の建物は`, `dg-text dg-text-sm`, `start`);
      s += txt(16, 352, `各3/4以上に緩和(点線の位置)`, `dg-text-strong dg-text-sm`, `start`);
      s += txt(W / 2, 378, `所在等不明の区分所有者は、裁判所の決定で母数から除ける`, `dg-text-muted dg-text-sm`);
      return s;
    },
  });

  // ---- 21. 普通借家と定期借家 ----
  add(`lease-ordinary-vs-fixed`, {
    title: `普通借家契約と定期借家契約のちがい`,
    alt: `普通借家契約と定期借家契約を比べた表。普通借家は書面でなくても契約でき、借地借家法上の事前の説明は不要、期間1年未満は期間の定めがない契約とみなされ、期間満了のとき貸主が更新を拒むには正当事由が必要で、期間中の借主の解約は解約できる特約がある場合だけで、賃料の増減を請求できる。定期借家は書面(電磁的記録も可)で契約し、更新がない旨を書面を交付して事前に説明する必要があり、期間1年未満もそのまま有効で、更新なく期間満了で終了し、期間1年以上なら貸主は満了の1年前から6か月前までに終了を通知する必要がある。床面積200平方メートル未満の居住用で、転勤・療養・介護などやむを得ない事情があれば、借主は解約を申し入れて1か月で終了でき、賃料改定の特約があれば増減請求の規定は適用されない。説明をしないと更新がない旨の定めは無効`,
    caption: `借地借家法26条〜29条・32条・38条、民法601条・618条。定期借家の説明の書面は、借主の承諾を得て電磁的方法で提供することもできます(38条4項)。`,
    h: 368,
    body: () => {
      const cx = [149, 288];
      let s = ``;
      [[`普通借家契約`, `更新がある`], [`定期借家契約`, `更新がない`]].forEach((hd, i) => {
        s += rect(cx[i] - 67, 4, 134, 40, `dg-fill-primary`);
        s += txt(cx[i], 17, hd[0], `dg-text-strong dg-text-on-fill`);
        s += txt(cx[i], 34, hd[1], `dg-text dg-text-sm dg-text-on-fill`);
      });
      // 各セル: [文字, 小さい補足か] の配列
      const rows = [
        { h: 44, label: [`契約の方法`], cells: [[[`書面でなくても`], [`よい`]], [[`書面で契約`], [`電磁的記録も可`, 1]]] },
        { h: 48, label: [`事前の説明`], cells: [[[`借地借家法上は`], [`不要`]], [[`更新がない旨を`], [`書面を交付して説明`]]] },
        { h: 46, label: [`期間が`, `1年未満`], cells: [[[`期間の定めのない`], [`契約とみなす`]], [[`そのまま有効`]]] },
        { h: 60, label: [`期間満了`], cells: [[[`貸主が更新を拒むには`], [`正当事由が必要`]], [[`更新なく終了`], [`1年以上なら1年前〜`, 1], [`6か月前に終了の通知`, 1]]] },
        { h: 48, label: [`期間中の`, `借主の解約`], cells: [[[`解約できる特約が`], [`ある場合だけ`]], [[`居住用200㎡未満で`], [`やむを得ない事情→1か月`, 1]]] },
        { h: 46, label: [`賃料の`, `増減請求`], cells: [[[`できる`]], [[`改定の特約が`], [`あれば適用なし`]]] },
      ];
      let y = 48;
      rows.forEach((r, ri) => {
        const my = y + r.h / 2;
        if (ri % 2 === 0) s += rect(4, y, 352, r.h, `dg-fill-muted`, 0);
        if (r.label.length === 1) s += txt(10, my, r.label[0], `dg-text-muted`, `start`);
        else { s += txt(10, my - 8, r.label[0], `dg-text-muted`, `start`); s += txt(10, my + 9, r.label[1], `dg-text-muted`, `start`); }
        r.cells.forEach((c, ci) => {
          const top = my - ((c.length - 1) * 16) / 2;
          c.forEach((ln, li) => {
            s += txt(cx[ci], top + li * 16, ln[0], ln[1] ? `dg-text-muted dg-text-sm` : `dg-text`);
          });
        });
        y += r.h;
      });
      s += line(4, y + 2, 356, y + 2, `dg-line`);
      s += txt(W / 2, y + 18, `定期借家で説明をしないと、更新がない旨の定めは無効`, `dg-text-strong dg-text-sm`);
      return s;
    },
  });

  // ---- 22. 開発許可が必要になる面積 ----
  add(`development-permit-area`, {
    title: `開発許可が必要になる面積(区域ごと)`,
    alt: `開発許可が必要になる開発区域の面積を区域ごとに帯で示した図。市街化区域は1,000平方メートル以上(三大都市圏の既成市街地などは500平方メートル以上)、市街化調整区域は面積にかかわらず必要、区域区分のない都市計画区域と準都市計画区域は3,000平方メートル以上、都市計画区域と準都市計画区域の外は1ヘクタール以上で許可が必要。市街化区域と区域区分のない都市計画区域・準都市計画区域の面積は、条例で300平方メートルまで引き下げられることがある。農林漁業用の建築物や公益上必要な建築物のための開発行為など、面積にかかわらず許可が不要な例外は図では省略している`,
    caption: `都市計画法29条1項・2項、同法施行令19条・22条の2。農林漁業用の建築物(市街化区域以外)や駅舎・図書館など公益上必要な建築物のための開発行為、都市計画事業・土地区画整理事業の施行として行うものなどは、面積にかかわらず許可が不要です。`,
    h: 320,
    body: () => {
      // 目盛りは等間隔ではない(0〜1,000・1,000〜3,000・3,000〜10,000㎡をそれぞれ80px前後に)
      const X = (a) => (a <= 1000 ? 24 + a * 0.08 : a <= 3000 ? 104 + (a - 1000) * 0.04 : 184 + (a - 3000) * (78 / 7000));
      let s = ``;
      s += rect(12, 8, 14, 12, `dg-fill-primary`, 2);
      s += txt(32, 14, `許可が必要な面積(右向きの先端は「以上」)`, `dg-text-muted dg-text-sm`, `start`);
      const rows = [
        { name: `市街化区域`, tag: `三大都市圏の一部は500㎡`, from: 1000, label: `1,000㎡以上` },
        { name: `市街化調整区域`, tag: `小規模でも必要`, from: 0, label: `面積にかかわらず必要` },
        { name: `区域区分のない都市計画区域・準都市計画区域`, from: 3000, label: `3,000㎡以上` },
        { name: `都市計画区域・準都市計画区域の外`, from: 10000, label: `1ha以上` },
      ];
      rows.forEach((r, i) => {
        const by = 52 + i * 50;
        [1000, 3000, 10000].forEach((t) => { s += line(X(t), by, X(t), by + 22, `dg-line-dashed`); });
      });
      s += areaRows(rows, X, 40, 50, `dg-fill-primary`);
      const ay = 246;
      s += line(24, ay, 334, ay, `dg-line`);
      [[0, `0`], [1000, `1,000㎡`], [3000, `3,000㎡`], [10000, `1ha`]].forEach((t) => {
        s += line(X(t[0]), ay - 4, X(t[0]), ay + 4, `dg-line`);
        s += txt(X(t[0]), ay + 15, t[1], `dg-text-muted dg-text-sm`);
      });
      s += txt(12, 280, `※目盛りは等間隔ではありません`, `dg-text-muted dg-text-sm`, `start`);
      s += txt(12, 296, `※1,000㎡・3,000㎡は条例で300㎡まで引き下げ可`, `dg-text-muted dg-text-sm`, `start`);
      s += txt(12, 312, `※農林漁業用・公益上必要な建築物などの例外は省略`, `dg-text-muted dg-text-sm`, `start`);
      return s;
    },
  });

  // ---- 23. 国土利用計画法の事後届出 ----
  add(`land-act-notice`, {
    title: `国土利用計画法の事後届出(面積と期限)`,
    alt: `国土利用計画法の事後届出が必要になる面積は、市街化区域が2,000平方メートル以上、市街化調整区域などその他の都市計画区域が5,000平方メートル以上、準都市計画区域を含む都市計画区域外が1ヘクタール以上で、権利取得者が取得する一団の土地の合計で判断すること、土地売買等の契約を結んだら権利取得者が契約の日から2週間以内に市町村長を経由して都道府県知事に届け出て、知事は届出から3週間以内に土地の利用目的について勧告することがあること、届出をしなくても契約は無効にならないが罰則があることを示した図`,
    caption: `国土利用計画法23条・24条・26条・47条。届出事項には対価の額も含まれますが、勧告の対象は利用目的だけです。勧告の期間は3週間の範囲で延長されることがあり、勧告に従わないと公表されることがあります(契約は有効)。当事者の一方が国・地方公共団体等の場合や、注視区域・監視区域・規制区域内の取引などは事後届出が不要です。`,
    h: 344,
    body: () => {
      const X = (a) => (a <= 2000 ? 24 + a * 0.04 : a <= 5000 ? 104 + (a - 2000) * (80 / 3000) : 184 + (a - 5000) * (78 / 5000));
      let s = ``;
      s += rect(12, 6, 14, 12, `dg-fill-primary`, 2);
      s += txt(32, 12, `届出が必要な面積(右向きの先端は「以上」)`, `dg-text-muted dg-text-sm`, `start`);
      const rows = [
        { name: `市街化区域`, from: 2000, label: `2,000㎡以上` },
        { name: `その他の都市計画区域`, tag: `市街化調整区域など`, from: 5000, label: `5,000㎡以上` },
        { name: `都市計画区域外`, tag: `準都市計画区域を含む`, from: 10000, label: `1ha以上` },
      ];
      rows.forEach((r, i) => {
        const by = 48 + i * 46;
        [2000, 5000, 10000].forEach((t) => { s += line(X(t), by, X(t), by + 22, `dg-line-dashed`); });
      });
      s += areaRows(rows, X, 36, 46, `dg-fill-primary`);
      const ay = 180;
      s += line(24, ay, 334, ay, `dg-line`);
      [[0, `0`], [2000, `2,000㎡`], [5000, `5,000㎡`], [10000, `1ha`]].forEach((t) => {
        s += line(X(t[0]), ay - 4, X(t[0]), ay + 4, `dg-line`);
        s += txt(X(t[0]), ay + 15, t[1], `dg-text-muted dg-text-sm`);
      });
      // 契約から勧告までの流れ
      s += txt(8, 216, `契約したら(事後届出)`, `dg-text-strong`, `start`);
      s += rect(6, 230, 84, 74, `dg-box`);
      s += txt(48, 258, `契約を`, `dg-text-strong`);
      s += txt(48, 277, `締結`, `dg-text-strong`);
      s += arrow(90, 267, 148, 267);
      s += txt(119, 255, `2週間以内`, `dg-text-strong dg-text-sm`);
      s += rect(148, 230, 100, 74, `dg-box-primary`);
      s += txt(198, 246, `届出`, `dg-text-strong`);
      s += lines(198, 264, [`権利取得者が`, `市町村長を経由し`, `知事に届け出る`], `dg-text dg-text-sm`, `middle`, 15);
      s += arrow(248, 267, 268, 267);
      s += rect(268, 230, 86, 74, `dg-box-muted`);
      s += txt(311, 246, `知事の勧告`, `dg-text-strong`);
      s += lines(311, 264, [`届出から`, `3週間以内`, `利用目的のみ`], `dg-text dg-text-sm`, `middle`, 15);
      s += txt(8, 318, `面積は、権利取得者が取得する一団の土地の合計で判断`, `dg-text dg-text-sm`, `start`);
      s += txt(8, 334, `届出をしなくても契約は無効にならないが、罰則がある`, `dg-text-muted dg-text-sm`, `start`);
      return s;
    },
  });

  // ---- 24. 不動産を取得したときの税 ----
  add(`acquisition-taxes`, {
    title: `不動産を買ったときにかかる3つの税`,
    alt: `不動産を買ったときにかかる3つの税を比べた図。不動産取得税は都道府県が課す地方税で、課税標準は固定資産課税台帳の価格、税率は本則4パーセントで土地と住宅は特例で3パーセント、宅地は課税標準が2分の1、新築住宅は1,200万円控除などの軽減があり、3パーセントと2分の1の特例は2027年3月31日までの取得が対象。登録免許税は国税で、課税標準は不動産の価額(固定資産課税台帳の価格が基礎)、売買による所有権移転の登記は2パーセントで、土地は2029年3月31日まで1.5パーセント、個人が自分で住む住宅用家屋は2027年3月31日まで移転0.3パーセントなどに軽減。印紙税は国税で、契約書に記載された契約金額に応じた定額が1通ごとにかかり、不動産の売買契約書は2027年3月31日までに作成されたものが軽減され、例えば1,000万円超5,000万円以下は2万円が1万円になる`,
    caption: `地方税法73条の2・73条の13〜73条の15・73条の21・附則11条の2・11条の5、登録免許税法9条・10条・別表第一・附則7条、租税特別措置法72条〜73条・75条・91条、印紙税法3条・別表第一(2026年10月1日現在)。住宅の軽減には床面積などの要件があります。`,
    h: 348,
    body: () => {
      const cards = [
        { name: `不動産取得税`, kind: `都道府県が課す地方税`, rows: [[`課税標準`, `固定資産課税台帳の価格`], [`税率`, `本則4%(土地・住宅は特例で3%)`], [`主な軽減`, `宅地は課税標準1/2、新築住宅は1,200万円控除`, 1]], note: `3%・1/2の特例は2027年3月31日までの取得` },
        { name: `登録免許税`, kind: `国税(登記を受ける人が納める)`, rows: [[`課税標準`, `不動産の価額(台帳の価格が基礎)`], [`税率`, `売買による所有権移転は2%`], [`主な軽減`, `土地は1.5%、自分が住む住宅は移転0.3%など`, 1]], note: `土地は2029年3月31日、住宅は2027年3月31日まで` },
        { name: `印紙税`, kind: `国税(契約書を作った人が納める)`, rows: [[`課税標準`, `契約書に記載された契約金額`], [`税率`, `金額に応じた定額(1通ごと)`], [`主な軽減`, `1,000万円超5,000万円以下は2万円→1万円`, 1]], note: `不動産の譲渡契約書で、2027年3月31日までの作成分` },
      ];
      let s = ``;
      cards.forEach((c, i) => {
        const y = 4 + i * 116;
        s += rect(6, y, 348, 108, `dg-box-muted`);
        s += txt(16, y + 16, c.name, `dg-text-strong`, `start`);
        s += txt(344, y + 16, c.kind, `dg-text-muted dg-text-sm`, `end`);
        s += line(16, y + 30, 344, y + 30, `dg-line-dashed`);
        c.rows.forEach((r, ri) => {
          const ry = y + 44 + ri * 18;
          s += txt(16, ry, r[0], `dg-text-muted dg-text-sm`, `start`);
          s += txt(76, ry, r[1], r[2] ? `dg-text dg-text-sm` : `dg-text`, `start`);
        });
        s += txt(76, y + 94, c.note, `dg-text-strong dg-text-sm dg-text-primary`, `start`);
      });
      return s;
    },
  });

  // ---- 25. 消費税の課税・非課税の判定 ----
  add(`consumption-tax-realestate`, {
    title: `不動産取引と消費税(課税・非課税の判定)`,
    alt: `不動産取引に消費税がかかるかを判定する図。国内で事業者が事業として対価を得て行う譲渡や貸付けでなければ不課税(個人が自宅を売る場合など)。土地(借地権などを含む)の譲渡は非課税、土地の貸付けも非課税だが、貸付期間が1か月未満の場合と、駐車場など施設の利用に伴う場合は課税(区画・舗装などの施設がない土地をそのまま駐車用に貸すのは非課税)。建物の譲渡は住宅でも課税。住宅の貸付けは非課税だが、貸付期間が1か月未満の場合と旅館業(ホテルなど)に当たる場合は課税。店舗・事務所など住宅以外の建物の貸付けは課税。土地付き建物の売買は代金を区分して建物部分だけに課税し、住宅の貸付けが非課税になるのは居住用であることが明らかなものに限る`,
    caption: `消費税法2条1項8号・4条1項・6条1項・別表第二第1号・第13号、同法施行令8条・16条の2・45条3項。住宅の貸付けは、契約で居住用と明らかにされている場合(契約で用途が明らかでないときは、貸付け等の状況から居住用であることが明らかな場合を含む)に非課税です。`,
    h: 340,
    body: () => {
      let s = ``;
      s += rect(6, 4, 220, 48, `dg-box`);
      s += txt(116, 20, `国内で事業者が事業として対価を`, `dg-text`);
      s += txt(116, 37, `得て行う譲渡・貸付け?`, `dg-text`);
      s += arrow(226, 28, 268, 28);
      s += txt(247, 18, `いいえ`, `dg-text dg-text-sm`);
      s += rect(268, 4, 86, 48, `dg-box-muted`);
      s += txt(311, 21, `不課税`, `dg-text-strong`);
      s += txt(311, 39, `自宅の売却など`, `dg-text-muted dg-text-sm`);
      s += path(`M 116 52 V 70 M 92 70 H 268`, `dg-line`);
      s += arrow(92, 70, 92, 88) + arrow(268, 70, 268, 88);
      s += txt(124, 61, `はい`, `dg-text dg-text-sm`, `start`);
      s += rect(6, 88, 172, 28, `dg-fill-primary`);
      s += txt(92, 102, `土地(借地権などを含む)`, `dg-text-strong dg-text-on-fill`);
      s += rect(182, 88, 172, 28, `dg-fill-primary`);
      s += txt(268, 102, `建物`, `dg-text-strong dg-text-on-fill`);
      // 行: 見出し・結果のチップ・小さい補足
      const row = (x, y, h, label, taxed, sub) => {
        let r = rect(x, y, 172, h, `dg-box-muted`);
        const cw = taxed ? 48 : 62;
        r += txt(x + 10, y + 18, label, `dg-text-strong`, `start`);
        r += rect(x + 164 - cw, y + 6, cw, 24, taxed ? `dg-box-accent` : `dg-box-success`, 12);
        r += txt(x + 164 - cw / 2, y + 18, taxed ? `課税` : `非課税`, `dg-text-strong`);
        (sub || []).forEach((t, i) => { r += txt(x + 10, y + 44 + i * 16, t, `dg-text dg-text-sm`, `start`); });
        return r;
      };
      s += row(6, 122, 36, `譲渡`, false);
      s += row(6, 164, 72, `貸付け`, false, [`1か月未満の貸付けや、`, `施設を伴う駐車場などは課税`]);
      s += row(182, 122, 52, `譲渡`, true, [`住宅の売却も課税`]);
      s += row(182, 180, 72, `住宅の貸付け`, false, [`1か月未満の貸付けや、`, `旅館業(ホテル等)は課税`]);
      s += row(182, 258, 36, `店舗等の貸付け`, true);
      s += txt(W / 2, 312, `土地付き建物の売買は、代金を区分して建物部分だけ課税`, `dg-text-muted dg-text-sm`);
      s += txt(W / 2, 330, `住宅の貸付けは、居住用であることが明らかなものに限る`, `dg-text-muted dg-text-sm`);
      return s;
    },
  });

  // ---- 26. 相続後の主な期限 ----
  add(`inheritance-deadlines`, {
    title: `相続が始まった後の主な期限`,
    alt: `相続が始まった後の主な期限を時系列に並べた図。自己のために相続の開始があったことを知った時から3か月以内に相続放棄か限定承認を家庭裁判所に申述し、しなければ単純承認とみなされる(期間は家庭裁判所で伸長できる)。申告が必要な場合は、相続の開始を知った日の翌日から4か月以内に亡くなった人の所得税の準確定申告、10か月以内に相続税の申告と納付。不動産を相続で取得した人は、相続の開始と取得を知った日から3年以内に相続登記を申請し、正当な理由なく怠ると10万円以下の過料。相続開始から10年を過ぎた遺産分割では、原則として特別受益や寄与分を主張できない`,
    caption: `民法904条の3・915条・921条・924条・938条、所得税法124条・125条、相続税法27条・33条、不動産登記法76条の2・164条。起算点は手続ごとに少しずつ異なります。相続放棄などの3か月は、亡くなったことと自分が相続人になったことを知った時から数え、家庭裁判所で伸ばしてもらえます。過料は正当な理由なく申請を怠った場合です。`,
    h: 362,
    body: () => {
      const items = [
        { when: `3か月以内`, what: `相続放棄・限定承認(家庭裁判所に申述)`, sub: `自分が相続人と知った時から。過ぎると単純承認に` },
        { when: `4か月以内`, what: `準確定申告(亡くなった人の所得税)`, sub: `申告が必要な場合。知った日の翌日から数える` },
        { when: `10か月以内`, what: `相続税の申告と納付`, sub: `申告が必要な場合。知った日の翌日から数える` },
        { when: `3年以内`, what: `相続登記の申請(不動産を取得した人)`, sub: `相続と取得を知った日から。怠ると10万円以下の過料` },
        { when: `10年を過ぎると`, what: `遺産分割で特別受益・寄与分を主張できない`, sub: `原則。相続開始の時から数える` },
      ];
      let s = ``;
      s += line(24, 24, 24, 319, `dg-line-strong`);
      s += circle(24, 18, 7, `dg-fill-primary`);
      s += txt(40, 18, `相続の開始(亡くなったこと)を知った日`, `dg-text-strong`, `start`);
      items.forEach((it, i) => {
        const y = 40 + i * 62;
        const my = y + 27;
        s += circle(24, my, 5, `dg-fill-primary`);
        s += line(29, my, 44, my, `dg-line`);
        s += rect(44, y, 310, 54, i === 3 ? `dg-box-primary` : `dg-box-muted`);
        s += txt(54, y + 12, it.when, `dg-text-strong dg-text-primary`, `start`);
        s += txt(54, y + 29, it.what, `dg-text`, `start`);
        s += txt(54, y + 45, it.sub, `dg-text-muted dg-text-sm`, `start`);
      });
      s += txt(W / 2, 354, `※亡くなった日と、それを知った日が違うこともある`, `dg-text-muted dg-text-sm`);
      return s;
    },
  });

  // ---- 27. 元利均等返済と元金均等返済 ----
  add(`loan-repayment`, {
    title: `元利均等返済と元金均等返済`,
    alt: `2,000万円を年1.5パーセントの固定金利・30年・ボーナス払いなしで借りた例で、毎月の返済額の内訳の推移を比べた概念図。元利均等返済は毎月の返済額が約6.9万円で一定のまま、利息の割合が減って元金の割合が増えていき、総利息は約485万円。元金均等返済は毎月の元金が一定で、利息が減るため返済額は初回の約8.1万円から最終回の約5.6万円へ減っていき、総利息は約451万円。同じ条件なら総返済額は元金均等返済のほうが少ないが、返済開始当初の負担は重い`,
    caption: `数値は当アプリの概算(手数料・保険料などを含まない)で、住宅金融支援機構【フラット35】サイトの同じ条件の試算(総返済額は元利均等 約2,485万円・元金均等 約2,452万円)とほぼ一致します。`,
    h: 330,
    body: () => {
      const P = 20000000;
      const r = 0.015 / 12;
      const n = 360;
      const A = (P * r) / (1 - Math.pow(1 + r, -n));
      const x0 = 44;
      const x1 = 344;
      const xm = (m) => x0 + ((m - 1) / (n - 1)) * (x1 - x0);
      const yv = (base, v) => base - (v / 85000) * 84;
      const f = (v) => v.toFixed(1);
      // 元利均等: m回目の利息(残高×月利)
      const pts = [];
      let bal = P;
      for (let m = 1; m <= n; m++) {
        const it = bal * r;
        if (m === 1 || m % 12 === 0) pts.push([m, it]);
        bal -= A - it;
      }
      let s = ``;
      s += rect(8, 4, 12, 12, `dg-fill-primary`, 2);
      s += txt(24, 10, `元金`, `dg-text-muted dg-text-sm`, `start`);
      s += rect(60, 4, 12, 12, `dg-box-warning`, 2);
      s += txt(76, 10, `利息`, `dg-text-muted dg-text-sm`, `start`);
      s += txt(352, 10, `例: 2,000万円・年1.5%固定・30年`, `dg-text-muted dg-text-sm`, `end`);
      // 上: 元利均等
      const b1 = 134;
      s += txt(8, 32, `元利均等返済`, `dg-text-strong`, `start`);
      s += txt(352, 32, `総利息 約485万円`, `dg-text dg-text-sm`, `end`);
      const prin = pts.map(([m, it]) => `${f(xm(m))} ${f(yv(b1, A - it))}`);
      s += path(`M ${x0} ${b1} L ${prin.join(` L `)} L ${x1} ${b1} Z`, `dg-fill-primary`);
      s += path(`M ${x0} ${f(yv(b1, A))} H ${x1} L ${prin.slice().reverse().join(` L `)} Z`, `dg-box-warning`);
      s += txt(x1 - 4, f(yv(b1, A) - 9), `毎月 約6.9万円で一定`, `dg-text dg-text-sm`, `end`);
      s += txt(x0 + 8, 79, `利息`, `dg-text dg-text-sm`, `start`);
      s += txt(x0 + 8, 116, `元金`, `dg-text dg-text-sm dg-text-on-fill`, `start`);
      s += line(x0, 46, x0, b1, `dg-line`) + line(x0, b1, x1, b1, `dg-line`);
      // 下: 元金均等
      const b2 = 272;
      const pm = P / n;
      const int1 = P * r;
      const intN = pm * r;
      s += txt(8, 160, `元金均等返済`, `dg-text-strong`, `start`);
      s += txt(352, 160, `総利息 約451万円`, `dg-text dg-text-sm`, `end`);
      s += path(`M ${x0} ${b2} V ${f(yv(b2, pm))} H ${x1} V ${b2} Z`, `dg-fill-primary`);
      s += path(`M ${x0} ${f(yv(b2, pm))} V ${f(yv(b2, pm + int1))} L ${x1} ${f(yv(b2, pm + intN))} V ${f(yv(b2, pm))} Z`, `dg-box-warning`);
      s += txt(x0 + 4, 182, `初回 約8.1万円`, `dg-text dg-text-sm`, `start`);
      s += txt(x1 - 4, 199, `最終回 約5.6万円`, `dg-text dg-text-sm`, `end`);
      s += txt(x0 + 8, 207, `利息`, `dg-text dg-text-sm`, `start`);
      s += txt(x0 + 8, 248, `元金(毎月一定)`, `dg-text dg-text-sm dg-text-on-fill`, `start`);
      s += line(x0, 176, x0, b2, `dg-line`) + line(x0, b2, x1, b2, `dg-line`);
      s += txt(x0, 286, `返済開始`, `dg-text-muted dg-text-sm`, `start`);
      s += txt((x0 + x1) / 2, 286, `15年`, `dg-text-muted dg-text-sm`);
      s += txt(x1, 286, `30年(完済)`, `dg-text-muted dg-text-sm`, `end`);
      s += txt(W / 2, 306, `総返済額は、同じ条件なら元金均等のほうが少ない`, `dg-text dg-text-sm`);
      s += txt(W / 2, 322, `ただし元金均等は、返済開始当初の負担が重い`, `dg-text dg-text-sm`);
      return s;
    },
  });

  // 図解の一覧の見出しと並び順(学習内容の図 → アプリの使い方の図)。各図の group もここから決める
  const groups = [
    { id: `takken`, label: `宅建業法`, ids: [`license-types`, `deposit-vs-guarantee`, `brokerage-contracts`, `brokerage-fee-cap`, `doc35-vs-37`, `eight-restrictions`, `cooling-off-check`, `deposit-protection`] },
    { id: `kenri`, label: `権利関係(民法・借地借家法・区分所有法)`, ids: [`double-sale`, `statutory-superficies`, `leasehold-types`, `lease-ordinary-vs-fixed`, `condo-resolutions`, `inheritance-shares`] },
    { id: `horei`, label: `法令上の制限`, ids: [`zoning-districts`, `coverage-far`, `height-setback`, `development-permit-area`, `land-act-notice`, `farmland-act`] },
    { id: `zei`, label: `税金`, ids: [`acquisition-taxes`, `consumption-tax-realestate`, `small-land-special`] },
    { id: `life`, label: `暮らしとお金`, ids: [`rental-flow`, `loan-repayment`, `inheritance-deadlines`] },
    { id: `app`, label: `アプリの使い方`, ids: [`srs-cycle`] },
  ];
  groups.forEach((g) => g.ids.forEach((id) => { if (defs[id]) defs[id].group = g.id; }));

  // 用語ID → 図解ID(先頭の図が、用語カードの「図解を見る」で開く図)
  const byTerm = {
    basicB16: [`inheritance-shares`, `inheritance-deadlines`],
    basicJ01: [`zoning-districts`],
    basicJ02: [`coverage-far`],
    basicJ03: [`coverage-far`],
    basicJ10: [`height-setback`],
    basicJ24: [`zoning-districts`],
    basicJ26: [`height-setback`],
    basicJ06: [`farmland-act`],
    basicJ07: [`farmland-act`],
    basicJ08: [`farmland-act`],
    basicE04: [`leasehold-types`],
    basicH07: [`small-land-special`],
    basicB01: [`brokerage-contracts`],
    basicK12: [`brokerage-contracts`],
    basicF02: [`brokerage-contracts`],
    basicF03: [`brokerage-contracts`],
    basicF07: [`brokerage-contracts`],
    basicP01: [`brokerage-contracts`],
    basicK11: [`doc35-vs-37`],
    basicK09: [`doc35-vs-37`],
    basicK10: [`doc35-vs-37`],
    term03: [`doc35-vs-37`],
    basicK14: [`eight-restrictions`],
    basicK15: [`eight-restrictions`],
    basicK17: [`eight-restrictions`],
    basicK18: [`eight-restrictions`],
    basicA16: [`rental-flow`],
    basicI05: [`rental-flow`],
    basicI06: [`rental-flow`],
    basicI07: [`rental-flow`, `doc35-vs-37`],
    basicI08: [`rental-flow`],
    // 宅建業法
    basicK02: [`license-types`],
    basicF01: [`license-types`],
    basicK06: [`deposit-vs-guarantee`],
    basicK07: [`deposit-vs-guarantee`],
    basicK25: [`deposit-vs-guarantee`],
    basicG01: [`cooling-off-check`],
    basicK13: [`brokerage-fee-cap`],
    term02: [`brokerage-fee-cap`],
    basicP03: [`brokerage-fee-cap`],
    basicK16: [`deposit-protection`],
    // 権利関係
    basicL06: [`double-sale`],
    term26: [`double-sale`],
    basicB17: [`double-sale`],
    basicE05: [`statutory-superficies`],
    basicL10: [`statutory-superficies`],
    basicD06: [`condo-resolutions`],
    basicD07: [`condo-resolutions`],
    basicD05: [`condo-resolutions`],
    basicL25: [`condo-resolutions`],
    basicL36: [`condo-resolutions`],
    basicA01: [`lease-ordinary-vs-fixed`],
    basicA05: [`lease-ordinary-vs-fixed`],
    basicL23: [`lease-ordinary-vs-fixed`],
    basicL24: [`lease-ordinary-vs-fixed`],
    // 法令上の制限
    basicJ05: [`development-permit-area`],
    basicJ17: [`development-permit-area`],
    basicJ18: [`development-permit-area`],
    basicJ09: [`land-act-notice`],
    basicJ34: [`land-act-notice`],
    // 税金
    basicB05: [`acquisition-taxes`],
    basicB06: [`acquisition-taxes`],
    basicB08: [`acquisition-taxes`],
    basicB19: [`acquisition-taxes`],
    basicH15: [`acquisition-taxes`],
    basicH22: [`acquisition-taxes`],
    basicH24: [`acquisition-taxes`],
    basicH13: [`consumption-tax-realestate`],
    basicO01: [`consumption-tax-realestate`],
    basicO02: [`consumption-tax-realestate`],
    basicO03: [`consumption-tax-realestate`],
    basicO04: [`consumption-tax-realestate`],
    basicO05: [`consumption-tax-realestate`],
    basicO06: [`consumption-tax-realestate`],
    basicO07: [`consumption-tax-realestate`],
    // 暮らしとお金
    basicL26: [`inheritance-deadlines`, `inheritance-shares`],
    basicL08: [`inheritance-deadlines`],
    basicQ02: [`inheritance-deadlines`],
    basicC02: [`loan-repayment`],
    basicC09: [`loan-repayment`],
  };

  return { defs, byTerm, groups };
})();
