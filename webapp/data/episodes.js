// 通常回: 第1直〜第112直(全56テーマ、前編・後編)。2026年10月4日時点でチャンネルを再確認し第111-112直を追加
window.APP_DATA = window.APP_DATA || {};
window.APP_DATA.episodes = [
  { id: `1-2`, epFirst: 1, epSecond: 2, displayLabel: `第1-2直`, theme: `敷金礼金泥棒`,
    summary: `新人営業マンがウソをつけず窮地に陥る一方、新生活需要を狙い敷金・礼金で儲ける悪徳オーナーの実態を描く`,
    terms: [
      { term: `敷金`, definition: `退去時の原状回復費用に充て契約終了時に返還すべき預け金` },
      { term: `礼金`, definition: `オーナーへの謝礼金で戻らないのが通常` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=QZWeEUx_KTU` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=GTobIcKvpgc` } } },

  { id: `3-4`, epFirst: 3, epSecond: 4, displayLabel: `第3-4直`, theme: `囲い込み`,
    summary: `売却依頼を他社に回さず両手仲介を狙う「囲い込み」の手口と、仲介手数料を下げる交渉法`,
    terms: [
      { term: `囲い込み`, definition: `他社に情報を回さず自社で両手仲介を狙う行為` },
      { term: `仲介手数料`, definition: `成約の対価、家賃1ヶ月分は上限で交渉余地あり` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=jrvZVrN-g0k` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=yb02Td8mie8` } } },

  { id: `5-6`, epFirst: 5, epSecond: 6, displayLabel: `第5-6直`, theme: `店舗契約`,
    summary: `店舗物件で客を騙して契約を取る不動産屋の"仕込み"と、人口減少下での家賃相場の行方`,
    terms: [], termsNote: `テーマ固有の用語は少なく、店舗契約の相場感覚と不動産屋の営業手法を描く回(仲介手数料の交渉は第57-58直も参照)`,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=lmU2G85W2WI` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=Vjwl34LsNFA` } } },

  { id: `7-8`, epFirst: 7, epSecond: 8, displayLabel: `第7-8直`, theme: `新・中間省略登記`,
    summary: `駅から遠い掘り出し物件の判断ポイントと、売主を経由せず利益を抜く「中間省略登記」の仕組み`,
    terms: [
      { term: `中間省略登記`, definition: `転売時に中間業者名義を登記せず直接最終買主へ所有権を移す手法。中抜きの隠れ蓕にも` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=e9YeGOUk6hg` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=fm7-RbTVsE8` } } },

  { id: `9-10`, epFirst: 9, epSecond: 10, displayLabel: `第9-10直`, theme: `建築条件付土地売買`,
    summary: `建築条件付き土地で欠陥住宅を売りつける手口と、違法建築を自分で見抜くポイント`,
    terms: [
      { term: `建築条件付土地売買`, definition: `指定の建築会社で家を建てることを条件に土地を販売する方式` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=8ucr0T9t49k` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=DgVG2YWPMdM` } } },

  { id: `11-12`, epFirst: 11, epSecond: 12, displayLabel: `第11-12直`, theme: `瑕疵担保責任`,
    summary: `欠陥住宅の保証期間を延ばす交渉術と、発覚した欠陥の補強工事費用を誰が負担するかの争い`,
    terms: [
      { term: `瑕疵担保責任(契約不適合責任)`, definition: `引渡し後の欠陥への売主責任、期間は特約で調整可(第87-88直にも登場)` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=1wx6h4C0UJQ` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=R1ydn6M7p7g` } } },

  { id: `13-14`, epFirst: 13, epSecond: 14, displayLabel: `第13-14直`, theme: `告知義務`,
    summary: `事故物件の告知義務の線引きと、それを隠して売り抜けようとする悪徳業者の実態`,
    terms: [
      { term: `告知義務`, definition: `事故物件などの事実を伝える義務、範囲はケースバイケース(第101-102直にも登場)` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=DN7FRUCpH7c` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=sn-6oOtIJmk` } } },

  { id: `15-16`, epFirst: 15, epSecond: 16, displayLabel: `第15-16直`, theme: `使用貸借`,
    summary: `恐怖!家が勝手に売られてる!? と、家賃を払わずに住む使用貸借とは`,
    terms: [
      { term: `使用貸借`, definition: `家賃を取らず無償で貸し借りする契約。賃貸借より借主保護が薄い` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=KqPPTX88cgs` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=MHzQSrmn3RI` } } },

  { id: `17-18`, epFirst: 17, epSecond: 18, displayLabel: `第17-18直`, theme: `融資特約`,
    summary: `住宅ローンの落とし穴…カモられる客たちと、戸建ての契約解除に400万円`,
    terms: [
      { term: `融資特約`, definition: `ローン審査落ちの場合に無条件で解除できる特約、期限内でないと使えない` },
      { term: `契約解除`, definition: `第59-60直も参照` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=gdtbN5icaZQ` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=GRZXnFsFReI` } } },

  { id: `19-20`, epFirst: 19, epSecond: 20, displayLabel: `第19-20直`, theme: `預かり金`,
    summary: `契約直後に家賃を上げられる不当な事例と、預かり金・誇大広告で入居者が騙される手口`,
    terms: [
      { term: `預かり金`, definition: `入居申込時の一時金、契約不成立なら原則返金` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=RUhmoQFbwd8` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=dNC82S1glI4` } } },

  { id: `21-22`, epFirst: 21, epSecond: 22, displayLabel: `第21-22直`, theme: `あんこ業者`,
    summary: `客からは見えない中間業者「あんこ業者」の存在と、キックバックで利益を上乗せする営業の裏側`,
    terms: [
      { term: `あんこ業者`, definition: `売主・買主どちらにも見えず利ざやを抜く中間業者` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=nGlCiuPO3C8` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=piNN81a9kCA` } } },

  { id: `23-24`, epFirst: 23, epSecond: 24, displayLabel: `第23-24直`, theme: `借地権`,
    summary: `16軒をまとめて買い上げる住民説得術と、仕入れ値の20倍で転売する情報戦`,
    terms: [
      { term: `借地権`, definition: `他人の土地を借りて建物を持つ権利。地主との関係整理が売買のカギ(底地投資=第99-100直も参照)` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=kNTBRYPQFV0` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=vfbjUeyMrmg` } } },

  { id: `25-26`, epFirst: 25, epSecond: 26, displayLabel: `第25-26直`, theme: `欠陥マンション`,
    summary: `購入後に大損する欠陥マンションの見抜き方と、事前の建物検査「インスペクション」の重要性`,
    terms: [
      { term: `インスペクション`, definition: `専門家による建物状況調査、既存住宅売買では実施有無の説明が義務(第85-86・87-88直にも登場)` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=IfKEsqYWRi4` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=AEhGdwin-YM` } } },

  { id: `27-28`, epFirst: 27, epSecond: 28, displayLabel: `第27-28直`, theme: `地面師`,
    summary: `プロも騙す「地面師」詐欺の巧妙な罠と、被害者が会社に見捨てられる顛末`,
    terms: [
      { term: `地面師`, definition: `他人の土地所有者になりすまして偽造の書類で売却し代金を詐取する集団` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=CC2HAFb8RdI` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=BF2e0XdmOek` } } },

  { id: `29-30`, epFirst: 29, epSecond: 30, displayLabel: `第29-30直`, theme: `リバースモーゲージ`,
    summary: `死亡時に一括返済する不思議な住宅ローンと、愛着ある持ち家のベストな売り時`,
    terms: [
      { term: `リバースモーゲージ`, definition: `自宅担保に融資を受け死亡時に一括返済(または売却)する高齢者向けローン` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=2y-tWY7wC8o` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=j9UYWAJpuVE` } } },

  { id: `31-32`, epFirst: 31, epSecond: 32, displayLabel: `第31-32直`, theme: `AD物件`,
    summary: `フルコミ営業で月収300万を稼ぐ極意と、仲介手数料無料のAD物件のからくり`,
    terms: [
      { term: `AD物件`, definition: `貸主から広告料が出るため仲介手数料無料で紹介できる物件` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=-TWcehdS7l8` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=SRLajh5Rkf4` } } },

  { id: `33-34`, epFirst: 33, epSecond: 34, displayLabel: `第33-34直`, theme: `中抜き`,
    summary: `不動産屋の中抜きに注意!と、バレなければ大儲けできる業界のタブー`,
    terms: [
      { term: `中抜き`, definition: `取引関与業者が本来受け取るべきでない差額を抜き取ること(中間省略登記=第7-8直も参照)` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=3XqGd-bJQhI` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=bpqxClZ1e4E` } } },

  { id: `35-36`, epFirst: 35, epSecond: 36, displayLabel: `第35-36直`, theme: `トリプル両手`,
    summary: `売値を下げ売買・仲介・買取を三重取りする悪質手法と、二重ローンの恐怖`,
    terms: [
      { term: `両手仲介・トリプル両手`, definition: `売主・買主双方(+買取)から利益を得る手法。売主利益との利益相反に注意` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=OCG82JuYT70` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=Kkkrzv4gN-0` } } },

  { id: `37-38`, epFirst: 37, epSecond: 38, displayLabel: `第37-38直`, theme: `再建築不可`,
    summary: `旗竿地など再建築不可物件の注意点と、隣地の塀の越境トラブル`,
    terms: [
      { term: `再建築不可物件`, definition: `接道義務を満たさず建て替えできない土地。相場より大幅に安い` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=SSIztDFCY5w` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=rB6Om6vXaTU` } } },

  { id: `39-40`, epFirst: 39, epSecond: 40, displayLabel: `第39-40直`, theme: `共有名義`,
    summary: `離婚時のマンション名義問題と、ペアローンの連帯保証の恐怖`,
    terms: [
      { term: `共有名義・ペアローン`, definition: `持分を分け名義共有したりそれぞれローンを組む購入方法。離婚・相続時の整理が複雑` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=Pq3iTrrS3WQ` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=cUbhiBimSVE` } } },

  { id: `41-42`, epFirst: 41, epSecond: 42, displayLabel: `第41-42直`, theme: `埋蔵文化財包蔵地`,
    summary: `埋蔵文化財包蔵地の儲けの仕組みと、サブリースの落とし穴(かぼちゃの馬車事件)`,
    terms: [
      { term: `埋蔵文化財包蔵地`, definition: `遺跡等が眠る可能性のある土地、発掘調査で工期遅延のリスク` },
      { term: `サブリース`, definition: `一括借上げで家賃保証しつつ転貸する仕組み` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=ZXXPGPlhs7A` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=JfufWsjFekA` } } },

  { id: `43-44`, epFirst: 43, epSecond: 44, displayLabel: `第43-44直`, theme: `任意売却`,
    summary: `競売より高く売れる任意売却と、住宅ローン支払い不能時の借金減额手段`,
    terms: [
      { term: `任意売却`, definition: `競売より高値で売れるよう金融機関の同意を得て売却する方法` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=bZi2BHGtIFs` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=1h9uPLYPcNs` } } },

  { id: `45-46`, epFirst: 45, epSecond: 46, displayLabel: `第45-46直`, theme: `賃料増額請求`,
    summary: `家賃が勇手に上がる理屈と、拒否できる法的根拠`,
    terms: [
      { term: `賃料増額請求`, definition: `借地借家法に基づきオーナーが家賃値上げを求める制度、借主は拒否・協議できる` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=q7leCp6mV1w` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=X0pw1QlnjtY` } } },

  { id: `47-48`, epFirst: 47, epSecond: 48, displayLabel: `第47-48直`, theme: `タワーマンション`,
    summary: `タワマン居住のメリット・デメリットと、知っておくべき落とし穴`,
    terms: [
      { term: `タワーマンション`, definition: `高層マンション。管理費・修繕積立金の高さや将来の建て替え合意形成の難しさに注意` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=vm-gMO3rLMI` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=3aSlzPlWfj0` } } },

  { id: `49-50`, epFirst: 49, epSecond: 50, displayLabel: `第49-50直`, theme: `三為業者`,
    summary: `初心者が三為業者にカモられる構図と、スルガ銀行問題を思わせる投資詐欺`,
    terms: [
      { term: `三為業者(第三者のためにする契約)`, definition: `転売目的で安く仕入れ決済と同時に別の買主へ転売する業者` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=JEOwNoaz_X0` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=1VJksp8MQAs` } } },

  { id: `51-52`, epFirst: 51, epSecond: 52, displayLabel: `第51-52直`, theme: `公簿売買`,
    summary: `登記簿がデタラメ!?と、重要事項説明書の記載責任をめぐる争い`,
    terms: [
      { term: `公簿売買・実測売買`, definition: `登記簿面積のまま取引/実測して確定。レズリスクは公簿売買で買主が負う` },
      { term: `重要事項説明書`, definition: `契約前の法定説明書類` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=B50aDiVbzGk` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=q6isR3CIR3M` } } },

  { id: `53-54`, epFirst: 53, epSecond: 54, displayLabel: `第53-54直`, theme: `賃貸管理物件`,
    summary: `管理委託先からの情報漏洩リスクと、アパート経営の心得`,
    terms: [
      { term: `賃貸管理物件`, definition: `管理を不動産屋に委託する物件。入居者情報の取扱いに注意が必要` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=1b-ct3bnok0` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=y1l5Xkboycg` } } },

  { id: `55-56`, epFirst: 55, epSecond: 56, displayLabel: `第55-56直`, theme: `既存不適格マンション`,
    summary: `資産価値激減のリスクと、大手査定を鵜呑みにした買い叩き`,
    terms: [
      { term: `既存不適格マンション`, definition: `建築時は合法でも後の法改正で現行基準不適合になった建物` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=nFEEGuQZepE` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=1NzWsZS_shc` } } },

  { id: `57-58`, epFirst: 57, epSecond: 58, displayLabel: `第57-58直`, theme: `賃貸仲介手数料上限値`,
    summary: `仲介手数料は交渉で半額にできるという事実と、「1ヶ月分」誤解の解消`,
    terms: [
      { term: `仲介手数料`, definition: `家賃1ヶ月分は上限で法律上の下限ではなく、交渉で下げられる余地がある(宅地建物取引業法46条)` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=gu7YffJbIhI` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=BIhoUhdoVBc` } } },

  { id: `59-60`, epFirst: 59, epSecond: 60, displayLabel: `第59-60直`, theme: `契約解除`,
    summary: `年収25%ローンの危うさと、解除できず1500万円の和解金`,
    terms: [
      { term: `契約解除`, definition: `一定の条件下で契約を取りやめること、タイミング次第で違約金・和解金が高額に` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=B2SYMG3uMx0` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=znVCIEvdCpw` } } },

  { id: `61-62`, epFirst: 61, epSecond: 62, displayLabel: `第61-62直`, theme: `立ち退き`,
    summary: `立ち退かない居住者への過激な手法と、No.1営業マンへの悪魔化`,
    terms: [
      { term: `立ち退き`, definition: `借主に退去を求めること。正当事由や立退料の交渉が必要` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=fBgzzFRgyys` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=86pSrESNuG4` } } },

  { id: `63-64`, epFirst: 63, epSecond: 64, displayLabel: `第63-64直`, theme: `フラット35`,
    summary: `低収入でも家が持てるフラット35と、アパート経営の是非`,
    terms: [
      { term: `フラット35`, definition: `住宅金融支援機構と民間が提携する全期間固定金利の住宅ローン` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=-0uOI8LtvBo` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=2sIi787IaRU` } } },

  { id: `65-66`, epFirst: 65, epSecond: 66, displayLabel: `第65-66直`, theme: `管理費等滞納マンション`,
    summary: `中古購入後の前所有者滞納分請求と、法的責任の範囲`,
    terms: [
      { term: `管理費等滞納`, definition: `前所有者の滞納分は新所有者に請求されうるが、前所有者への法的追及は難しい` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=cQ-mQU9lW7E` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=r7WaoHrwkUA` } } },

  { id: `67-68`, epFirst: 67, epSecond: 68, displayLabel: `第67-68直`, theme: `水害マンション`,
    summary: `水害後のタワマンの値下がりと、「水災特約」の重要性`,
    terms: [
      { term: `水災特約`, definition: `火災保険等に付帯する水害補償特約。ハザードマップと合わせ確認したい` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=lRVgmyvJsZA` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=WbDge4P0Sc0` } } },

  { id: `69-70`, epFirst: 69, epSecond: 70, displayLabel: `第69-70直`, theme: `搾取マンション`,
    summary: `住み始めたら抜け出せない実態と、管理費を上げ続ける手口`,
    terms: [
      { term: `搾取マンション`, definition: `管理会社等が住民に気づかれず管理費等を上げ続け利益を得る構造` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=IJbq06kDqEA` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=6ejN4X2gO4E` } } },

  { id: `71-72`, epFirst: 71, epSecond: 72, displayLabel: `第71-72直`, theme: `通行地役権`,
    summary: `高額な通行料を請求されるトラブルと、支払わずに済ませる対処法`,
    terms: [
      { term: `通行地役権`, definition: `他人の土地を通行するための権利。登記・契約での確認が必要` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=dsXHXPuA50U` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=_1KftPIpXEo` } } },

  { id: `73-74`, epFirst: 73, epSecond: 74, displayLabel: `第73-74直`, theme: `眺望悪化マンション`,
    summary: `目の前に建つ巨大ビルと、「眺望」が権利として保護されるか`,
    terms: [
      { term: `眺望権`, definition: `眺めの良さそのものへの権利。日本では原則法的保護の対象外` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=5na1tFLJL9I` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=zVp2P0C_WIQ` } } },

  { id: `75-76`, epFirst: 75, epSecond: 76, displayLabel: `第75-76直`, theme: `原状回復`,
    summary: `敷金返還トラブルと、悪徳オーナーの見分け方`,
    terms: [
      { term: `原状回復`, definition: `退去時に入居前の状態に戻す義務、通常損耗は借主負担外が原則` },
      { term: `敷金`, definition: `第1-2直も参照` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=bymFowNoLRQ` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=6KZb4VhMJps` } } },

  { id: `77-78`, epFirst: 77, epSecond: 78, displayLabel: `第77-78直`, theme: `未公開物件`,
    summary: `未公開物件の営業戦略と、月下の負けられない戦い`,
    terms: [
      { term: `未公開物件`, definition: `レインズ等に出さず自社顧客にのみ紹介する物件。囲い込みの温床にも` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=MXrmUW6vpO8` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=gBSI86FhZL0` } } },

  { id: `79-80`, epFirst: 79, epSecond: 80, displayLabel: `第79-80直`, theme: `狭小住宅`,
    summary: `狭小住宅の謎と、販売を競う月下VS花澤`,
    terms: [
      { term: `狭小住宅`, definition: `極端に狭い敷地に建つ住宅。再建築不可や変形地との関連も多い` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=Xi0dXXqSqts` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=qGIDGS_ZWuE` } } },

  { id: `81-82`, epFirst: 81, epSecond: 82, displayLabel: `第81-82直`, theme: `負動産`,
    summary: `激安リゾートマンションの検証と、バブル崩壊後の負動産の実態`,
    terms: [
      { term: `負動産`, definition: `資産価値より維持費・管理費の負担が重く、持っているだけで負担になる不動産` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=vLH6_IDlrDI` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=9ZV6x9AJEpY` } } },

  { id: `83-84`, epFirst: 83, epSecond: 84, displayLabel: `第83-84直`, theme: `担ボ物件`,
    summary: `担ボ物件の闇と、嘘つき営業マンの実態`,
    terms: [
      { term: `担ボ物件(担当者ボーナス物件)`, definition: `売主や元付業者が営業担当者個人に直接謝礼金を払う物件、利益相反が起きやすい` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=DiEViLDKZiU` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=Eui2hG2UCHs` } } },

  { id: `85-86`, epFirst: 85, epSecond: 86, displayLabel: `第85-86直`, theme: `持ち回り契約`,
    summary: `内見せず契約を進める持ち回り契約と、騒音トラブル`,
    terms: [
      { term: `持ち回り契約`, definition: `売主買主が同じ場所に集まらず書類を順に回す方式、見落としリスク上昇` },
      { term: `インスペクション`, definition: `第25-26直も参照` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=y2hUnSLegjk` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=C7HAu-Y3rpo` } } },

  { id: `87-88`, epFirst: 87, epSecond: 88, displayLabel: `第87-88直`, theme: `契約不適合責任`,
    summary: `契約書の文言で責任回避と、インスペクションの重要性再確認`,
    terms: [
      { term: `契約不適合責任(旧・瑕疵担保責任)`, definition: `第11-12直も参照` },
      { term: `インスペクション`, definition: `事前の建物状況調査` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=v0wsUAVtd6E` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=g7SmgVd7pPg` } } },

  { id: `89-90`, epFirst: 89, epSecond: 90, displayLabel: `第89-90直`, theme: `賃貸併用住宅`,
    summary: `賃貸併用住宅が売れない理由と、夢の家の実態`,
    terms: [
      { term: `賃貸併用住宅`, definition: `一部を自宅、一部を賃貸として使う建物。家賃収入でローンを賄う設計` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=0vgeobBNbDA` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=HXic3Ly4URU` } } },

  { id: `91-92`, epFirst: 91, epSecond: 92, displayLabel: `第91-92直`, theme: `二重譲渡`,
    summary: `別の買主に奪われる恐怖と、違約金でも高値で売る方が得になる構造`,
    terms: [
      { term: `二重譲渡`, definition: `同じ不動産を複数の相手に売却すること。先に登記した方が権利を主張できる` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=Sgg34l0Xxek` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=sLCvh92KSyA` } } },

  { id: `93-94`, epFirst: 93, epSecond: 94, displayLabel: `第93-94直`, theme: `建築確認`,
    summary: `クソ物件の実例と、建築基準法の抜け穴トラブル`,
    terms: [
      { term: `建築確認`, definition: `着工前に建築基準法適合を行政・指定機関が確認する手続き` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=4RLtD3HA_L0` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=Y6lscBUlpYk` } } },

  { id: `95-96`, epFirst: 95, epSecond: 96, displayLabel: `第95-96直`, theme: `賃貸保証会社`,
    summary: `保証人がいても通らない審査の謎と、入居審査のポイント`,
    terms: [
      { term: `賃貸保証会社`, definition: `連帯保証人の代わりに家賃滞納を保証する会社、独自審査基準を持つ` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=k5X67Su4lHY` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=_HbEsmOq3J4` } } },

  { id: `97-98`, epFirst: 97, epSecond: 98, displayLabel: `第97-98直`, theme: `大規模開発`,
    summary: `80人の地権者説得と、立ち退かない地主への対応`,
    terms: [
      { term: `大規模開発・地上げ`, definition: `広域の土地をまとめて買収・再開発する事業とその用地取得活動` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=feCW6qiUzLM` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=-r94glnyucM` } } },

  { id: `99-100`, epFirst: 99, epSecond: 100, displayLabel: `第99-100直`, theme: `底地投資`,
    summary: `FIREを夢見る投資家の危うさと、同時売却の解決策`,
    terms: [
      { term: `底地投資`, definition: `借地権が設定された土地(底地)を購入し地代収入を得る投資` },
      { term: `借地権`, definition: `第23-24直も参照` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=VrRqKcMctUA` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=41m0yH0YdQ8` } } },

  { id: `101-102`, epFirst: 101, epSecond: 102, displayLabel: `第101-102直`, theme: `事故物件サイト`,
    summary: `事故物件情報サイトと、高齢者の賃貸問題`,
    terms: [
      { term: `事故物件サイト`, definition: `過去の事件事故情報を地図上に公開する民間サービス` },
      { term: `告知義務`, definition: `第13-14直も参照` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=-wjRbvFoqTs` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=PujP1HmwdTU` } } },

  { id: `103-104`, epFirst: 103, epSecond: 104, displayLabel: `第103-104直`, theme: `原野商法`,
    summary: `土地買取勧誘の罠と、騙されやすい心理`,
    terms: [
      { term: `原野商法`, definition: `将来値上がりすると偽り資産価値のない山林・原野を高値で売りつける詐欺的商法` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=0O4UqG20KPs` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=VlFeVqQg26U` } } },

  { id: `105-106`, epFirst: 105, epSecond: 106, displayLabel: `第105-106直`, theme: `住宅ローン事務手数料`,
    summary: `悪徳不動産屋を見抜くポイントと、カモられやすい客の特徴`,
    terms: [
      { term: `住宅ローン事務手数料`, definition: `融資実行時に金融機関等に支払う手数料。定額型/定率型があり上乗せされやすい` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=EkMRVAEKEpo` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=CjWp1XbJm78` } } },

  { id: `107-108`, epFirst: 107, epSecond: 108, displayLabel: `第107-108直`, theme: `物上げ`,
    summary: `物上げビジネスの儲けのからくりと、Z世代営業マンの転落`,
    terms: [
      { term: `物上げ`, definition: `「土地を売ってください」系チラシ等で売却希望者を探し出す営業活動` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=cWHfsBWi8FU` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=zKQigEDT_p8` } } },

  { id: `109-110`, epFirst: 109, epSecond: 110, displayLabel: `第109-110直`, theme: `家賃滞納`,
    summary: `滞納しても出ていかない入居者への対応と、居座りの法的リスク`,
    terms: [], termsNote: `家賃滞納が続くと最終的には契約解除・強制執行に至りうる(契約解除: 第59-60直も参照)`,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=8CoGQgxcohA` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=QUgo9JSXpeY` } } },

  { id: `111-112`, epFirst: 111, epSecond: 112, displayLabel: `第111-112直`, theme: `更新料`,
    summary: `契約直後に引っ越すことになった借主が更新料の返金を求める交渉術と、大家に直接交渉して更新料は返金されるのかという駆け引き`,
    terms: [
      { term: `更新料`, definition: `契約更新時に借主が貸主側に支払う金銭。特約がなければ法律上一律の支払い義務があるわけではない` },
    ], termsNote: null,
    videos: { zenpen: { label: `前編`, url: `https://www.youtube.com/watch?v=xaDX1BwH710` }, kouhen: { label: `後編`, url: `https://www.youtube.com/watch?v=7W3713HbcOQ` } } },
];
