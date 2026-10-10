// 図解: window.Diagrams = { defs: { [図解ID]: { title, alt, caption, render } }, byTerm: { [用語ID]: [図解ID] } }
// 色はすべて css/style.css の .dg-* クラス経由(ライト/ダーク両対応)。id・defs・インラインstyleは使わない(1ページに複数並べても衝突しないように)
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

  const defs = {};
  function add(id, d) {
    defs[id] = { title: d.title, alt: d.alt, caption: d.caption, render: () => svg(d.h, d.alt, d.body()) };
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
      s += group(216, 108, 136, `dg-box-primary`, `工業系(3)`, ind);
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
      s += rect(12, 8, 14, 12, `dg-fill-primary`, 2);
      s += txt(32, 14, `更新あり`, `dg-text-muted dg-text-sm`, `start`);
      s += rect(100, 8, 14, 12, `dg-fill-success`, 2);
      s += txt(120, 14, `更新なし(定期借地権)`, `dg-text-muted dg-text-sm`, `start`);
      const rows = [
        { name: `普通借地権`, tag: `更新後は20年→以後10年`, from: 30, to: null, cls: `dg-fill-primary`, label: `30年以上` },
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
    alt: `35条書面は契約成立前に買主・借主などへ宅建士が説明し記名する書面、37条書面は契約成立後遅滞なく契約の当事者に交付し宅建士の記名は必要だが説明は不要な書面であることを比べた表`,
    caption: `宅建業法35条(重要事項の説明等)・37条(書面の交付)。記載事項は一部の例です。相手方の承諾があれば電磁的方法での提供もできます。`,
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
      s += txt(rc, 161, `契約成立後、遅滞なく`, `dg-text-strong`);
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
        const cls = last ? `dg-box-success` : (i === 4 || i === 5 ? `dg-box-primary` : `dg-box`);
        s += circle(18, y + 14, 11, last ? `dg-fill-success` : `dg-fill-primary`);
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
    alt: `用語カードは今日学習したあと、思い出せれば1日後、6日後、15日後と復習の間隔がのびていき、もう一度を押すと今日の復習に戻ること、クイズで間違えた用語も今日の復習に入ることを示した図`,
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
      // クイズとの連携
      s += rect(30, 150, 300, 58, `dg-box-warning`);
      s += txt(W / 2, 168, `クイズで間違えた問題の用語も`, `dg-text`);
      s += txt(W / 2, 190, `自動で「今日の復習」に入る`, `dg-text-strong`);
      return s;
    },
  });

  // 用語ID → 図解ID
  const byTerm = {
    basicB16: [`inheritance-shares`],
    basicJ01: [`zoning-districts`],
    basicJ02: [`coverage-far`],
    basicJ03: [`coverage-far`],
    basicJ10: [`height-setback`],
    basicJ06: [`farmland-act`],
    basicJ07: [`farmland-act`],
    basicJ08: [`farmland-act`],
    basicE04: [`leasehold-types`],
    basicH07: [`small-land-special`],
    basicB01: [`brokerage-contracts`],
    basicK12: [`brokerage-contracts`],
    basicK11: [`doc35-vs-37`],
    basicK14: [`eight-restrictions`],
    basicA16: [`rental-flow`],
  };

  return { defs, byTerm };
})();
