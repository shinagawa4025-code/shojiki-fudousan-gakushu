// このアプリについて: 概要・運営者・内容の基準日と出典・免責事項・プライバシーポリシー・誤りの報告・ホーム画面への追加・更新履歴・権利表記
// ルート: #about / #about/<operator|sources|terms|privacy|report|install|changelog|rights>(その項目へ移動)
window.Views = window.Views || {};
window.Views.about = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 20 });
  const has = (name) => !!(window.Icons && Icons.has && Icons.has(name));
  const esc = (s) => UI.escapeHtml(s);

  // 目次の順番 = 画面の並び(先頭の「概要」は目次に入れない)
  const SECTIONS = [
    { id: `operator`, label: `運営者` },
    { id: `sources`, label: `内容と出典` },
    { id: `terms`, label: `免責事項` },
    { id: `privacy`, label: `プライバシー` },
    { id: `report`, label: `誤りの報告` },
    { id: `install`, label: `ホーム画面に追加` },
    { id: `changelog`, label: `更新履歴` },
    { id: `rights`, label: `権利表記` },
  ];

  // プライバシーポリシーの制定日・改定日(公開日 SITE.releasedAt とは別に固定する。公開のたびに日付が変わらないように)。
  // ポリシーの文面を変えたら revised に、その版を公開する日を書き、更新履歴(data/changelog.js)にも1行書く
  // (v12: 学習時間・目標・バッジ・解答の記録と「AIに聞く」の扱いを追記。公開日は SITE.releasedAt と同じ日にする)
  const PRIVACY_DATES = { established: `2026-10-12`, revised: `2026-10-19` };

  // 'YYYY-MM-DD' → 'YYYY年M月D日'(形式が違えばそのまま)
  function jpDate(s) {
    const m = String(s || ``).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : String(s || ``);
  }

  function ext(href, label) {
    return `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}${ic(`external`, 14)}</a>`;
  }

  function section(id, title, icon, body) {
    return `
      <section class="card about-section" id="about-${id}" aria-labelledby="about-${id}-title">
        <h3 class="card-title about-section-title" id="about-${id}-title">${ic(icon, 20)}<span>${title}</span></h3>
        ${body}
      </section>`;
  }

  function lawChangesHtml() {
    const list = Array.isArray(window.APP_DATA.lawChanges) ? window.APP_DATA.lawChanges : [];
    if (!list.length) return ``;
    const srcOf = (id) => (id && window.AppIndex && AppIndex.sourcesById ? AppIndex.sourcesById[id] : null);
    return `
      <h4 class="about-sub">法改正・制度変更のまとめ</h4>
      <div class="about-law-list">
        ${list.map((c) => {
          const src = srcOf(c.sourceId);
          return `<div class="about-law-item">
            <p class="about-law-head"><span class="badge ${c.status === `施行` ? `badge-soft` : `badge-accent`}">${esc(jpDate(c.date))} ${esc(c.status || ``)}</span> <strong>${esc(c.title)}</strong></p>
            <p class="about-law-body">${esc(c.body)}</p>
            ${src && src.url ? `<p class="about-law-src">出典: ${ext(src.url, src.orgName)}</p>` : ``}
          </div>`;
        }).join(``)}
      </div>`;
  }

  function changelogHtml() {
    const list = Array.isArray(window.APP_DATA.changelog) ? window.APP_DATA.changelog : [];
    if (!list.length) return `<p>更新履歴はまだありません。</p>`;
    return `<div class="about-changelog">
      ${list.map((v) => `<div class="about-version">
        <h4 class="about-sub">バージョン ${esc(v.version)} ${esc(v.title || ``)}</h4>
        <p class="about-date text-muted">${esc(jpDate(v.date))}</p>
        <ul>${(v.items || []).map((t) => `<li>${esc(t)}</li>`).join(``)}</ul>
      </div>`).join(``)}
    </div>`;
  }

  // 報告フォーム(js/siteConfig.js の SITE.report)が使えるか。未設定のあいだは「準備中」と書き、ないボタンを案内しない
  function reportReady() {
    return !!(window.Report && typeof Report.enabled === `function` && Report.enabled());
  }

  function reportHtml() {
    const u = reportReady() && Report.url ? Report.url({ kind: `page`, title: `アプリ全体へのご意見`, location: `#about/report` }) : null;
    if (!u) {
      return `
      <p class="about-pending">${ic(`info`, 16)}<span>報告フォームは準備中です。</span></p>
      <p>誤りの報告・ご意見は、Googleフォームで受け付ける予定です。用意ができたら、各問題・各項目に「誤りを報告」のリンクを表示し、更新履歴でお知らせします。個別のご相談(「私の場合はどうなるか」など)にはお答えできません。</p>`;
    }
    return `
      <p>解説や問題の誤り、分かりにくいところに気づいたら、各問題・各項目の「誤りを報告」から送ってください。報告フォーム(Googleフォーム)には、どの項目かが自動で入力されます。</p>
      <p>いただいた報告はすべて確認し、修正したものは更新履歴に記載します。返信はしていません。個別のご相談にはお答えできません。氏名・連絡先などの個人情報は書かないでください。</p>
      <div class="card-actions"><a class="btn" href="${esc(u)}" target="_blank" rel="noopener">${ic(`flag`, 18)}ご意見・誤りを送る${ic(`external`, 14)}</a></div>`;
  }

  function render(root, param) {
    const SITE = window.SITE || {};
    const name = SITE.name || ``;
    const asOf = jpDate(SITE.contentAsOf);
    const shareIcon = has(`share`) ? `share` : `external`;
    const ready = reportReady();

    const wrap = document.createElement(`div`);
    wrap.className = `view about-view`;
    wrap.innerHTML = `
      <h2>このアプリについて</h2>
      <nav class="chip-row chip-row-scroll about-toc" aria-label="このページの目次">
        ${SECTIONS.map((s) => `<a class="chip chip-small" href="#about/${s.id}">${s.label}</a>`).join(``)}
      </nav>

      <section class="card about-section about-intro" id="about-intro" aria-labelledby="about-intro-title">
        <h3 class="sr-only" id="about-intro-title">概要</h3>
        <p class="about-lead">${esc(name)}は、不動産の基礎知識から宅地建物取引士(宅建士)試験の対策までを、1日数分ずつ学べる無料の学習アプリです。</p>
        <h4 class="about-sub">こんな人に</h4>
        <ul>
          <li>宅建士試験の合格を目指す人</li>
          <li>はじめて部屋を借りる・家を買う・売る・相続する人</li>
          <li>不動産・金融・保険などの仕事で基礎が必要な人</li>
          <li>税理士試験で不動産と消費税を学ぶ人</li>
        </ul>
        <h4 class="about-sub">できること</h4>
        <ul>
          <li>テーマ別の基礎知識と用語カード</li>
          <li>4択(個数問題・組合せ問題を含む)・○×一問一答・本番形式の模擬試験(宅建士)</li>
          <li>忘れかけたころに出題する「今日の復習」と、間違えた問題の「解き直し」</li>
          <li>住宅ローン・税金・諸費用の計算機</li>
          <li>分野別の進捗・弱点分析・合格予測(アプリ独自の推定)</li>
          <li>試験日から逆算した学習計画・1日の目標・学習時間・バッジ</li>
        </ul>
        <p>無料・登録不要・広告なし。一度開いて読み込みが終わったあとは、インターネットにつながっていなくても使えます(出典や動画のリンク先、Webページ版の解説を見るときは通信が必要です)。</p>
        <p class="about-version-line text-muted">バージョン ${esc(SITE.version || ``)}(${esc(jpDate(SITE.releasedAt))})・内容の確認日 ${esc(asOf)}</p>
        <div class="card-actions">
          <button type="button" class="btn btn-secondary" data-role="share">${ic(shareIcon, 18)}このアプリを紹介する</button>
        </div>
        <p class="about-share-fallback" data-role="share-fallback" hidden>
          <label for="about-share-url">このアプリのURL(長押しまたは選択してコピーしてください)</label>
          <input type="text" class="field-input" id="about-share-url" readonly value="${esc(SITE.url || ``)}">
        </p>
      </section>

      ${section(`operator`, `運営者`, `info`, `
        <p class="about-operator"><strong>運営: 個人(資格試験を勉強中)</strong></p>
        <p>税理士法人に勤務しながら資格試験の勉強をしている個人が、自分の学習のために作り始めたアプリを公開しています。運営者は弁護士・税理士ではなく、このアプリは専門家の監修を受けていません。</p>
        <p>このアプリは勤務先とは関係のない、個人の活動です。勤務先の業務や見解を示すものではありません。</p>
        <p>解説・問題・図解は、このアプリのために新しく作成したものです。文章の作成と確認には、AIツールを多く使っています。公開する前に、法令の条文や行政機関の資料と照らし合わせて確認していますが、誤りが残っていることがあります。市販の教材・講座の内容や、試験の過去問題を転載したものではありません。</p>
      `)}

      ${section(`sources`, `内容の基準日と出典`, `library`, `
        <p>内容は、原則として${esc(asOf)}時点で確認した法令・公表資料に基づいています。個別の項目に別の時点を示している場合は、その時点のものです。</p>
        <p>根拠は一次情報に置いています: e-Gov法令検索(法令の条文)、国土交通省・国税庁・総務省・法務省・消費者庁などの公表資料、裁判所の判例、不動産適正取引推進機構(RETIO)などの公的団体の資料。各項目の「根拠」に条文を、「出典」に確認した資料へのリンクを示しています。</p>
        <p>相場や一般的な手順など、法令上の決まりがない内容には「実務上の目安」と表示しています。</p>
        <p>税率・特例・統計は毎年変わります。法改正や統計の更新は、確認しだい反映し、更新履歴でお知らせします。</p>
        <div class="card-actions"><a class="btn btn-secondary" href="#sources">${ic(`library`, 18)}情報源の一覧へ</a></div>
        <p>各テーマ・用語・図解の解説は、アプリを開かずに読めるWebページ(<a href="learn/">学べるテーマの一覧</a>)としても公開しています。人に紹介するときや、検索から調べるときに使えます。</p>
        ${lawChangesHtml()}
      `)}

      ${section(`terms`, `免責事項・ご利用上の注意`, `shield`, `
        <ul class="about-list">
          <li>このアプリの内容は、不動産と関連する法律・税金について一般的な知識を学ぶためのものです。個別の取引・契約・申告についての法律相談・税務相談ではありません。具体的な判断は、弁護士・税理士・司法書士・宅地建物取引士などの専門家や、行政機関の窓口に確認してください。</li>
          <li>運営者は、個別のご相談(「私の場合はどうなるか」など)にはお答えできません(税理士でない者が、無償であっても、他人の求めに応じて具体的な税額の計算などの税務相談に応じることは、税理士法52条で禁じられています)。</li>
          <li>このアプリは宅地建物取引業者ではなく、物件の紹介や、売買・賃貸の仲介(媒介)・代理は行っていません。特定の不動産会社・金融機関・サービスを勧めるものでもありません。</li>
          <li>法令・税制・統計は改正・更新されます。このアプリの内容は、原則として${esc(asOf)}時点で確認した法令・公表資料に基づいており、それ以後の改正が反映されていないことがあります。</li>
          <li>計算機の結果は、入力値と一定の前提に基づく概算です。実際の金額は、評価額・自治体の条例・特例の適用要件・端数処理などにより異なります。</li>
          <li>4択・○×・模擬試験の問題は、このアプリが独自に作成したものです。宅地建物取引士資格試験・税理士試験の過去問題や、試験を実施する都道府県・指定試験機関(一般財団法人不動産適正取引推進機構)・国税審議会の公式な問題ではありません。合格の目安などの数値も、このアプリ独自のものです。合格予測は、この端末での解答の記録から計算した独自の推定で、合格や得点を保証するものではありません。</li>
          <li>「AIに聞く」で使うAIのサービス(ChatGPT・Claude・Gemini など)は、このアプリとは関係のない外部のサービスです。AIの答えは誤ることがあるため、根拠の条文はe-Gov法令検索などの一次資料で確かめてください。</li>
          <li>内容の正確性には十分注意していますが、誤りが含まれる可能性があります。このアプリの利用によって生じた損害について、運営者は責任を負いかねます(運営者の故意または重大な過失による場合を除きます)。${ready ? `誤りに気づいたときは「誤りを報告」からお知らせください。` : ``}</li>
          <li>記録はお使いの端末のブラウザに保存されます。ブラウザのデータ削除・端末の故障・Safariの保存期間の制限などで記録が消えることがあります。定期的にバックアップを取ってください。</li>
          <li>このアプリは個人が運営する非公式の学習アプリで、試験の実施機関・行政機関・不動産会社などとは関係ありません。</li>
        </ul>
      `)}

      ${section(`privacy`, `プライバシーポリシー`, `shield`, `
        <ol class="about-list">
          <li>このアプリは、氏名・メールアドレスなどの個人情報を取得しません。会員登録の仕組みもありません。</li>
          <li>学習の記録(解いた問題・解答の記録(日ごとの正誤と「勘で当たった」などの自信の有無)・覚えた用語・復習の予定・学習時間・1日の目標と達成した日・バッジ・試験日・設定など)は、お使いの端末のブラウザの保存領域(localStorage)にだけ保存され、運営者を含む外部には送信されません。合格予測と学習計画も、これらの記録を使って端末の中で計算しています。消したいときはブラウザの「サイトデータの削除」で消去できます。バックアップ(JSONファイル)にはこれらの記録が含まれ、利用者が選んだ保存先(端末のファイルなど)に保存されます。運営者には送られません。</li>
          <li>「AIに聞く」ボタンは、押したときにだけ、その問題の問題文・選択肢・利用者の解答・正解・解説・根拠の条文を1つの質問文にまとめて、お使いの端末のクリップボードにコピーします(ほかの学習の記録・試験日・設定などは入れません)。このアプリからAIのサービスには何も送信しません。表示するリンク(ChatGPT・Claude・Gemini)は各サービスのトップページを開くだけで、URLに問題や記録は入れません。コピーした文章を貼り付けて送るかどうかは利用者が決め、送った内容の取扱いには各サービスの利用規約・プライバシーポリシーが適用されます。ボタンは設定で表示しないようにできます。</li>
          <li>アクセス解析ツール・広告・Cookieによる追跡は使っていません。外部のフォントやスクリプトも読み込んでいません。</li>
          <li>このアプリは GitHub Pages(GitHub, Inc.)で公開しています。ページを開くと、通常のWebサイトと同じように、GitHub のサーバーにIPアドレスなどのアクセス記録が残ります(GitHub はセキュリティのために訪問者のIPアドレスを記録・保存すると説明しています。${ext(`https://docs.github.com/ja/pages/getting-started-with-github-pages/about-github-pages`, `GitHub Pages について`)}・${ext(`https://docs.github.com/ja/site-policy/privacy-policies/github-general-privacy-statement`, `GitHub のプライバシーに関する声明`)}をご覧ください)。運営者がこの記録を受け取ることはありません。</li>
          <li>出典リンク(e-Gov法令検索・国土交通省・国税庁など)や動画リンク(YouTube)を押すと、それぞれのサイトに移動します。移動先での情報の取扱いは、各サイトのポリシーに従います。</li>
          <li>${ready ? `誤りの報告・ご意見は Google フォームで受け付けています。` : `誤りの報告・ご意見は Google フォームで受け付ける予定です(準備中)。`}フォームには、報告対象を特定するために、項目のID・名称・画面の場所・アプリのバージョンが自動で入力されます(学習の記録は含みません)。メールアドレスは集めません。氏名・連絡先などの個人情報は書かないでください。送信された内容は確認と修正のためにだけ使い、第三者に提供しません。Google フォームの利用には ${ext(`https://policies.google.com/privacy?hl=ja`, `Google のプライバシーポリシー`)}が適用されます。</li>
          <li>用語の読み上げには、端末・ブラウザに備わる音声合成機能を使います。ブラウザや選んだ音声によっては、読み上げる文章(用語の説明文)が音声合成サービスに送られることがあります。学習の記録が送られることはありません。</li>
          <li>このポリシーを変更するときは、このページと更新履歴でお知らせします。</li>
        </ol>
        <p class="about-date-line text-muted">制定日: ${esc(jpDate(PRIVACY_DATES.established))}${PRIVACY_DATES.revised ? `・最終改定日: ${esc(jpDate(PRIVACY_DATES.revised))}` : ``}</p>
      `)}

      ${section(`report`, `誤り・ご意見`, `flag`, reportHtml())}

      ${section(`install`, `ホーム画面に追加する方法`, `download`, `
        <h4 class="about-sub">iPhone・iPad(Safari)</h4>
        <ol>
          <li>Safariでこのアプリを開く</li>
          <li>共有ボタン(四角から上向きの矢印)をタップ(見当たらないときは「…」の中)</li>
          <li>「ホーム画面に追加」→「追加」をタップ</li>
        </ol>
        <h4 class="about-sub">Android(Chrome)</h4>
        <p>右上の「︙」→「ホーム画面に追加」または「アプリをインストール」をタップします。</p>
        <h4 class="about-sub">パソコン(Chrome・Edge)</h4>
        <p>アドレスバー右端のインストールアイコン、またはメニューの「アプリをインストール」から追加します。</p>
        <div class="card-actions" data-role="install-actions" hidden>
          <button type="button" class="btn" data-role="install">${ic(`download`, 18)}この端末にインストール</button>
        </div>
        <p>ホーム画面から開くと全画面で使え、Safariの保存期間の制限で記録が消えるのを防ぎやすくなります。記録は端末の中だけにあるので、ときどき<a href="#settings">設定</a>からバックアップを取ってください。</p>
      `)}

      ${section(`changelog`, `更新履歴`, `list`, changelogHtml())}

      ${section(`rights`, `権利表記`, `info`, `
        <p>アプリの名前・ロゴ・アイコン・図解・文章はこのアプリのオリジナルです。法令の条文や行政機関の資料は、出典を示して引用しています。</p>
        <p>「<a href="#works">作品で学ぶ</a>」で取り上げているマンガ『正直不動産』(原案 夏原武・漫画 大谷アキラ・脚本 水野光博/小学館)の作品名・各回のタイトル・動画の権利は、各権利者に帰属します。このアプリは作品の権利者・出版社・制作会社とは関係がなく、作品の画像やロゴは使っていません。</p>
      `)}
    `;
    root.appendChild(wrap);

    initShare(wrap, SITE);
    initInstall(wrap);

    // #about/<項目> はその項目へ移動する(戻る/再読み込みで保存位置があるときは Router が元の位置へ戻す)
    const hs = window.history.state && typeof window.history.state === `object` ? window.history.state : {};
    const target = param && SECTIONS.some((s) => s.id === param) ? wrap.querySelector(`#about-${param}`) : null;
    if (target && !(Number(hs.y) > 0)) {
      requestAnimationFrame(() => {
        if (!target.isConnected) return;
        // 画面の出現アニメーション(transform)の影響を受けないよう、offsetTop から位置を求める。
        // 固定ヘッダーの分は html の scroll-padding-top(スマホのみ)、PCは少し余白をあける
        let y = 0;
        for (let el = target; el; el = el.offsetParent) y += el.offsetTop;
        const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 16;
        window.scrollTo(0, Math.max(0, y - pad));
        // スクリーンリーダーにも移動先を伝える
        const h = target.querySelector(`h3`);
        if (h) { h.setAttribute(`tabindex`, `-1`); h.focus({ preventScroll: true }); }
      });
    }
  }

  // 「このアプリを紹介する」: 共有シート → 使えなければURLをコピー → それも無理ならURLを選択して表示
  function initShare(wrap, SITE) {
    const btn = wrap.querySelector(`[data-role="share"]`);
    const fallback = wrap.querySelector(`[data-role="share-fallback"]`);
    const url = SITE.url || location.href.split(`#`)[0];
    function showFallback() {
      fallback.hidden = false;
      const input = fallback.querySelector(`input`);
      input.focus({ preventScroll: true });
      input.select();
    }
    btn.addEventListener(`click`, async () => {
      if (navigator.share) {
        try {
          await navigator.share({ title: SITE.name, text: `${SITE.name}|${SITE.tagline}`, url });
          return;
        } catch (e) {
          if (e && e.name === `AbortError`) return; // 利用者が閉じた
        }
      }
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error(`no clipboard`);
        await navigator.clipboard.writeText(url);
        UI.toast(`このアプリのURLをコピーしました`, `success`);
      } catch (e) {
        showFallback();
      }
    });
  }

  // Chrome・Edge などでインストールできるときだけ「この端末にインストール」を出す(app.js が beforeinstallprompt を InstallPrompt に保存)
  function initInstall(wrap) {
    const box = wrap.querySelector(`[data-role="install-actions"]`);
    if (!box) return;
    const available = () => !!(window.InstallPrompt && typeof window.InstallPrompt.prompt === `function`);
    const paint = () => { box.hidden = !available(); };
    box.querySelector(`[data-role="install"]`).addEventListener(`click`, async () => {
      const ev = window.InstallPrompt;
      if (!ev || typeof ev.prompt !== `function`) { paint(); return; }
      try {
        await ev.prompt();
        const choice = ev.userChoice ? await ev.userChoice : null;
        // 1回使ったイベントは再利用できない
        if (window.InstallPrompt === ev) window.InstallPrompt = null;
        if (choice && choice.outcome === `accepted`) UI.toast(`インストールしました`, `success`);
      } catch (e) {
        if (window.InstallPrompt === ev) window.InstallPrompt = null;
      }
      paint();
    });
    // 画面を開いたあとでインストールできるようになった・インストールされたときも表示を合わせる
    const onChange = () => { if (!wrap.isConnected) { window.removeEventListener(`installprompt:change`, onChange); return; } paint(); };
    window.addEventListener(`installprompt:change`, onChange);
    // 画面を離れたら監視をやめる(ほかの画面に移ったあとも古い画面がメモリに残らないように)
    if (UI.onLeave) UI.onLeave(wrap, () => window.removeEventListener(`installprompt:change`, onChange));
    paint();
  }

  return { render, SECTIONS: SECTIONS.map((s) => s.id) };
})();
