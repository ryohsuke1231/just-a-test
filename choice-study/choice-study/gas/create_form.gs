/**
 * コメント欄アンケートのGoogleフォームを自動で作るスクリプト（質問は必要なものだけ・全8問）
 *
 * 使い方
 *   1. https://script.google.com を開き「新しいプロジェクト」
 *   2. 最初からある中身を全部消して、このファイルの中身を貼り付ける
 *   3. 下の「設定」の APP_URL と CLASSES を書き換える
 *   4. 関数の選択で createForm を選び「実行」（初回は権限の許可が必要）
 *   5. 実行ログに出る「編集用URL」を開いて中身を確認する
 *
 * フォームの流れ（3ページ）
 *   1. はじめに：リンク・クラス・完了コード（コードがないと次へ進めない＝ページを見る前に質問は見えない）
 *   2. あなたの考え：記事ごとの考え（コメント欄のことを聞く前に聞く）
 *   3. コメント欄について：影響の自己評価・自由記述
 */

// ===================== 設定 =====================
const APP_URL = 'https://xxxx.vercel.app'; // デプロイしたアプリのURLに書き換える
const CLASSES = ['1組', '2組'];             // 実際のクラス名に書き換える
const FORM_TITLE = 'ネット記事とコメント欄についてのアンケート';
// ================================================

function createForm() {
  const form = FormApp.create(FORM_TITLE);

  form.setLimitOneResponsePerUser(true); // 回答を1回に制限（ログインが必要）
  form.setCollectEmail(false);           // メールアドレスは集めない
  form.setProgressBar(true);
  form.setAllowResponseEdits(false);
  form.setPublishingSummary(false);
  form.setShowLinkToRespondAgain(false);
  form.setConfirmationMessage('回答を受け付けました。ありがとうございました。全員が終わるまで、記事やコメントの内容はほかの人に話さないでください。');

  // ---------- 1ページ目：はじめに ----------
  form.setDescription([
    'ニュース記事とコメント欄を模したページを見て、コメントを書いてもらいます。',
    'コメントといいね数は、この調査のために用意したもので、実在の人の投稿ではありません。',
    '名前は記録されません。参加は自由で、成績には関係ありません。くわしい目的は、全員が終わったあとに説明します。',
  ].join('\n'));

  form.addSectionHeaderItem()
    .setTitle('手順')
    .setHelpText([
      '1. 下のリンクを開いて、記事を3本読み、それぞれにコメントを書いてください。',
      '2. 最後に表示される「完了コード」を入力して「次へ」を押してください。',
      '',
      'リンク：' + APP_URL,
    ].join('\n'));

  form.addMultipleChoiceItem()
    .setTitle('何組ですか？')
    .setChoiceValues(CLASSES)
    .setRequired(true);

  form.addTextItem()
    .setTitle('ページの最後に表示された完了コード（6文字）')
    .setValidation(
      FormApp.createTextValidation()
        .requireTextMatchesPattern('^[A-Za-z0-9]{6}$')
        .setHelpText('ページの最後に出る6文字のコードを入力してください')
        .build()
    )
    .setRequired(true);

  // ---------- 2ページ目：あなたの考え ----------
  form.addPageBreakItem()
    .setTitle('あなたの考え')
    .setHelpText('コメント欄に関係なく、今のあなたの本当の考えに一番近いものを選んでください。');

  const opinion = (title) =>
    form.addScaleItem().setTitle(title).setBounds(1, 5).setLabels('反対', '賛成').setRequired(true);

  opinion('【記事1】市が条例で「スマホは1日2時間以内」という目安を決めること');
  opinion('【記事2】リーネ島の「夜の消灯ルール」（架空の話題）');
  opinion('【記事3】学校のプールをなくして、民間のプールで水泳の授業をすること');

  form.addMultipleChoiceItem()
    .setTitle('ページで書いたコメントや返信に、本当の考えとちがうところはありましたか？')
    .setChoiceValues(['なかった', '少しあった', 'かなりあった'])
    .setRequired(true);

  // ---------- 3ページ目：コメント欄について ----------
  form.addPageBreakItem().setTitle('コメント欄について');

  form.addScaleItem()
    .setTitle('コメントやいいね数が用意されたものだと知っていても、気になりましたか？')
    .setBounds(1, 5)
    .setLabels('まったく気にならなかった', 'とても気になった')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('コメント欄を読んで、考えが変わったり迷ったりしたことはありましたか？あれば、どの記事で、どんなふうにだったか教えてください（なければ「なし」）')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('感想があれば自由にどうぞ')
    .setRequired(false);

  // ---------- 回答を集めるスプレッドシート ----------
  const ss = SpreadsheetApp.create(FORM_TITLE + '（回答）');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log('編集用URL：' + form.getEditUrl());
  Logger.log('回答用URL（Classroomに貼る）：' + form.getPublishedUrl());
  Logger.log('回答スプレッドシート：' + ss.getUrl());
}
