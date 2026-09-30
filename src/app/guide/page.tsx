import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Cloud, Command, HardDrive, History, Keyboard, List, Monitor, Plus, TriangleAlert, Trophy, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ColorLegend, GuideSection, Keys, PageLink, Points, Topic, guideLink } from "@/components/Guide/GuideParts"

export const metadata: Metadata = {
  title: "使い方 | Typle",
  description: "Typleの練習の始め方、単語リストの作り方、記録の見方、データの保存先、キーボード操作をまとめています。",
}

const contents = [
  { id: "practice", title: "練習する" },
  { id: "lists", title: "単語リストを作る" },
  { id: "records", title: "結果と記録を見る" },
  { id: "devices", title: "端末を登録する" },
  { id: "storage", title: "保存先とデータ" },
  { id: "shortcuts", title: "キーボード操作" },
]

const steps: { icon: LucideIcon; title: string; text: string; href: string; action: string }[] = [
  { icon: Keyboard, title: "サンプルで練習する", text: "サンプルのリストが入っているので、すぐに始められます。表示された単語をタイプします。", href: "/play", action: "練習する" },
  { icon: Plus, title: "自分のリストを作る", text: "覚えたい単語を登録します。CSV・TSVファイルからも取り込めます。", href: "/create", action: "リストを作成" },
  { icon: Trophy, title: "記録を振り返る", text: "最後まで打つと記録が自動で保存され、自己ベストや所要時間の推移を確認できます。", href: "/rankings", action: "ベスト記録" },
]

const shortcuts: { screen: string; rows: { keys: string[][]; action: string }[] }[] = [
  { screen: "練習する", rows: [
    { keys: [["Backspace"]], action: "1文字戻る" },
    { keys: [["Esc"]], action: "最初からやり直す" },
    { keys: [["任意のキー"]], action: "入力欄の外をクリックした後、入力に戻る" },
  ] },
  { screen: "練習の完了画面", rows: [{ keys: [["Enter"]], action: "もう一度練習する" }] },
  { screen: "リストを作成・単語リストの編集", rows: [
    { keys: [["Enter"]], action: "次の単語へ移る（最後の単語では行を追加）" },
    { keys: [["Alt", "↑"], ["↓"]], action: "単語を1つ上・下へ移動" },
    { keys: [["Ctrl", "Enter"]], action: "保存する（Mac は ⌘ + Enter）" },
  ] },
]

export default function Guide() {
  return <main className="mx-auto w-full max-w-5xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
    <header className="mb-8 space-y-1">
      <h1 className="text-2xl font-bold">使い方</h1>
      <p className="text-sm text-muted-foreground">練習の始め方から、単語リストの作り方、記録の見方、データの保存先までをまとめています。ログインしなくても、すべての機能を使えます。</p>
    </header>
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_11rem] xl:items-start xl:gap-10">
      <nav aria-labelledby="guide-contents" className="mb-10 rounded-xl border bg-card p-4 xl:sticky xl:top-20 xl:order-2 xl:mb-0 xl:border-0 xl:bg-transparent xl:p-0">
        <h2 id="guide-contents" className="mb-2 text-xs font-bold text-muted-foreground">このページの内容</h2>
        <ol className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 xl:grid-cols-1 xl:gap-0 xl:border-l">
          {contents.map(item => <li key={item.id}>
            <a href={`#${item.id}`} className="-ml-px flex min-h-9 items-center rounded-md px-2 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 xl:rounded-none xl:border-l xl:border-transparent xl:px-3 xl:hover:border-foreground xl:hover:bg-transparent">{item.title}</a>
          </li>)}
        </ol>
      </nav>

      <div className="min-w-0 space-y-10 text-[15px] leading-[1.75] xl:order-1">
        <section aria-labelledby="start-heading">
          <h2 id="start-heading" className="mb-3 text-base font-bold">はじめの3ステップ</h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {steps.map(({ icon: Icon, title, text, href, action }, index) => <li key={href} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground" aria-hidden="true">{index + 1}</span>
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              </div>
              <h3 className="text-[15px] font-bold leading-6">{title}</h3>
              <p className="text-sm leading-6 text-muted-foreground">{text}</p>
              <Link href={href} className="mt-auto inline-flex w-fit items-center gap-1 rounded-sm pt-1 text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{action}<ArrowRight className="size-3.5" aria-hidden="true" /></Link>
            </li>)}
          </ol>
        </section>

        <GuideSection id="practice" icon={Keyboard} title="練習する" lead={<><PageLink href="/play">練習する</PageLink>で単語リストを選び、表示された単語をタイプします。</>}>
          <Topic title="入力の色">
            <ColorLegend />
            <p className="mt-3">違う文字を打つと、その位置から後ろが赤くなり、入力欄に何文字目から違うかを表示します。<Keys keys={["Backspace"]} /> で直してください。表示する単語と入力する文字が違う単語（例：「東京」を「とうきょう」と打つ）は、表示の下に入力する文字を出し、そちらに色を付けます。</p>
          </Topic>
          <Topic title="練習の流れ">
            <Points>
              <li>すべての文字が一致すると次の単語へ進み、最後の単語で完了します。</li>
              <li>最初の入力から完了までを計時し、練習中は経過時間・速度（1分あたりに正しく入力した文字数）・正確率・ミス数を表示します。</li>
              <li>日本語は IME で確定した文字で判定します。変換中の文字は判定しません。貼り付けとドラッグ入力は使えません。</li>
              <li>進捗バーの下に次の3語を表示し、「すべての単語を表示」で全体を確認できます。</li>
            </Points>
          </Topic>
          <Topic title="リストと端末を選ぶ">
            <Points>
              <li>上部のリスト名を押すと、リストを検索して切り替えられます。右側（スマートフォンでは下）の一覧からも選べます。</li>
              <li>練習の途中で別のリストを選ぶと、中断してよいか確認します。途中までの練習は記録しません。</li>
              <li>「やり直す」または <Keys keys={["Esc"]} /> で、同じリストを最初からやり直します。</li>
              <li>上部の「端末」で、練習に使う端末を最初の文字を打つ前に選びます（<a href="#devices" className={guideLink}>端末を登録する</a>）。</li>
            </Points>
          </Topic>
        </GuideSection>

        <GuideSection id="lists" icon={List} title="単語リストを作る" lead={<><PageLink href="/create">リストを作成</PageLink>で新しいリストを作り、<PageLink href="/edit">単語リスト</PageLink>で保存したリストを編集します。</>}>
          <Topic title="単語を入力する">
            <Points>
              <li>リスト名と、単語ごとに「表示する単語」「入力する文字」を入力します。補足は任意です。</li>
              <li>入力する文字を空欄にすると、表示する単語と同じ文字を使います。</li>
              <li>単語はドラッグ、「…」メニュー、<Keys keys={["Alt", "↑↓"]} /> で並べ替えられます。<Keys keys={["Enter"]} /> で次の単語へ移り、最後の単語では新しい行を追加します。</li>
              <li>「保存」または <Keys keys={["Ctrl", "Enter"]} />（Mac は <Keys keys={["⌘", "Enter"]} />）で保存します。</li>
            </Points>
          </Topic>
          <Topic title="保存できないとき">
            <Points>
              <li>空の行があるリスト、単語のないリスト、ほかと同じ名前のリストは保存できません。</li>
              <li>1つのリストに入れられる単語は1,000語まで、保存できるリストは100件までです。</li>
              <li>保存していない変更があるときは、キャンセルやブラウザーの戻るの前に確認します。</li>
              <li>単語数を変えると、それまでの記録はベスト記録の順位から外れます（記録は残ります。<a href="#word-count" className={guideLink}>単語数を変えたとき</a>）。</li>
            </Points>
          </Topic>
          <Topic title="リストを管理する">
            <Points>
              <li><PageLink href="/edit">単語リスト</PageLink>では、リスト名や単語で検索し、並び順を変えられます。</li>
              <li>各リストの「練習」「編集」と「…」メニューから、ベスト記録・練習記録・CSVエクスポート・複製・削除ができます。</li>
              <li>複製では単語だけを写します。練習記録は写しません。</li>
            </Points>
          </Topic>
          <Topic title="CSV・TSVファイル">
            <Points>
              <li>リストの編集中に「CSV・TSVを読み込む」でファイルを選ぶと、内容を確認してから、今の単語の末尾に追加するか置き換えるかを選べます。</li>
              <li>1行目は列名です。input（入力する文字）と display（表示する単語）が必要で、annotation（補足）は省略できます。UTF-8 で保存した 1 MiB 以内・1,000語までのファイルを読み込めます。</li>
              <li>「CSVエクスポート」は、入力・表示・補足を UTF-8 の CSV ファイルに書き出します（練習記録は含みません）。書き出したファイルはそのまま読み込めます。</li>
            </Points>
            <pre aria-label="CSVファイルの例" className="mt-3 overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-[13px] leading-6">{"input,display,annotation\nとうきょう,東京,日本の首都\nおおさか,大阪,"}</pre>
          </Topic>
        </GuideSection>

        <GuideSection id="records" icon={History} title="結果と記録を見る" lead="練習を最後まで終えると、記録を自動で保存します。">
          <Topic title="完了画面">
            <Points>
              <li>所要時間、正確率とミス文字数、速度、単語数と端末を表示します。</li>
              <li>正確率は、入力した文字のうち正しかった文字の割合です。削除操作は数えず、訂正して打ち直した文字は数えます。</li>
              <li>自己ベストを更新すると、バッジと前のベストとの差を表示します。</li>
              <li>「もう一度」（<Keys keys={["Enter"]} />）で、同じリストをすぐに練習できます。保存に失敗したときは「記録の保存を再試行」を押してください。</li>
            </Points>
          </Topic>
          <Topic title="練習記録">
            <Points>
              <li><PageLink href="/records">練習記録</PageLink>では、練習の履歴を日付ごとに新しい順で表示し、リストや端末で絞り込めます。絞り込みは URL に残るので、ブックマークやリンクで同じ表示を開けます。</li>
              <li>リストで絞り込むと、そのリストの練習回数とベストを表示し、「練習する」からすぐに練習できます。</li>
              <li>各リストのベストには「ベスト」の印が付きます。ベストを削除するときは、次にベストになる記録を確認画面に表示します。</li>
            </Points>
          </Topic>
          <Topic title="ベスト記録">
            <Points>
              <li><PageLink href="/rankings">ベスト記録</PageLink>でリストを選ぶと、自己ベスト・直近5回の平均・所要時間の推移と上位の記録を表示します。</li>
              <li>順位は「正確率を優先」（正確率が高い順、同じなら速い順）と「速さを優先」を切り替えられ、端末で絞り込めます。選んだリストと条件は URL に残ります。</li>
              <li>練習画面にも、選んでいるリストの上位5件を表示し、今回の記録を強調します。</li>
            </Points>
          </Topic>
          <Topic title="単語数を変えたとき">
            <Points>
              <li id="word-count">リストの単語を追加・削除した後は、今の単語数で練習した記録だけで順位を付けます。練習画面や練習記録のベストも同じ基準です。</li>
              <li>単語数が違う記録は、ベスト記録の「含めて表示」で順位に加えられます。今の単語数の記録がまだないときは、単語数が違う記録で順位を付けます。</li>
            </Points>
          </Topic>
          <Topic title="ホーム">
            <p>記録が1件以上あると、<PageLink href="/home">ホーム</PageLink>に今週の練習回数・連続練習日数・平均正確率・練習時間、次に練習するとよいリスト、リストごとの1単語あたりの秒数と正確率の推移を表示します。日付は端末の時刻で区切り、週は月曜はじまりです。</p>
          </Topic>
        </GuideSection>

        <GuideSection id="devices" icon={Monitor} title="端末を登録する" lead={<><PageLink href="/devices">端末</PageLink>に練習で使うパソコンやキーボードを登録すると、どの端末で練習したかが記録に残ります。</>}>
          <Points>
            <li>練習画面の「端末」で選んだ端末は、このブラウザーで覚えておき、次の練習でも使います。</li>
            <li>練習記録とベスト記録を端末で絞り込めます。</li>
            <li>端末の名前を変えても、それまでの記録には練習した時点の名前が残ります。登録できる端末は100台までです。</li>
          </Points>
        </GuideSection>

        <GuideSection id="storage" icon={HardDrive} title="保存先とデータ" lead="ログインは任意です。ログインしているかどうかで、データの保存先が変わります。">
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { icon: HardDrive, title: "このブラウザーに保存", when: "ログインしていないとき", points: ["すべての機能を使えます。", "このブラウザーの LocalStorage に保存します。別の端末やブラウザーとは同期しません。"] },
              { icon: Cloud, title: "アカウントに保存", when: "GitHub でログインしたとき", points: ["アカウント専用のサーバーに保存し、ログインすればどの端末でも同じデータを使えます。", "保存にはインターネット接続が必要です。"] },
            ] as const).map(({ icon: Icon, title, when, points }) => <div key={title} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><Icon className="size-4" aria-hidden="true" /></span>
                <div>
                  <h3 className="text-[15px] font-bold leading-6">{title}</h3>
                  <p className="text-xs text-muted-foreground">{when}</p>
                </div>
              </div>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 marker:text-muted-foreground/60">{points.map(point => <li key={point}>{point}</li>)}</ul>
            </div>)}
          </div>
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
            <TriangleAlert className="mt-1 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div>
              <h3 className="text-[15px] font-bold leading-6">データが消えるとき</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 marker:text-amber-600/60">
                <li>このブラウザーに保存したデータは、ブラウザーのサイトデータを削除すると消えます。大切なリストは「CSVエクスポート」で書き出しておけます。</li>
                <li>リストを削除すると、そのリストの練習記録も削除されます。</li>
              </ul>
            </div>
          </div>
          <Points>
            <li>2つの保存先のデータは別々に保存され、ログインしても自動では移りません。</li>
            <li>以前のバージョン（v0.1.x）のデータは、<PageLink href="/home">ホーム</PageLink>の移行ボタンで今の保存先に追加できます。</li>
            <li>複数の画面で同時に変更して保存できなかったときは、最新のデータを読み込んでから、もう一度操作してください。</li>
          </Points>
        </GuideSection>

        <GuideSection id="shortcuts" icon={Command} title="キーボード操作" lead="マウスを使わずに操作できるキーの一覧です。">
          <div className="divide-y overflow-hidden rounded-xl border bg-card text-sm">
            {shortcuts.map(group => <div key={group.screen}>
              <h3 className="bg-muted/50 px-4 py-2 text-xs font-bold text-muted-foreground">{group.screen}</h3>
              <dl className="divide-y">
                {group.rows.map(row => <div key={row.action} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-3 px-4 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <dt className="flex flex-wrap items-center gap-x-2 gap-y-1">{row.keys.map((keys, index) => <span key={index} className="inline-flex items-center gap-2">{index > 0 && <span className="text-xs text-muted-foreground">/</span>}<Keys keys={keys} /></span>)}</dt>
                  <dd>{row.action}</dd>
                </div>)}
              </dl>
            </div>)}
          </div>
        </GuideSection>

        <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-bold">準備ができたら、さっそく練習してみましょう。</p>
          <Button asChild><Link href="/play"><Keyboard aria-hidden="true" />練習を始める</Link></Button>
        </div>
      </div>
    </div>
  </main>
}
