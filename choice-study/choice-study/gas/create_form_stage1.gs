/**
 * 第1段階（画像アンケート）のGoogleフォームを自動で作るスクリプト
 *
 * 使い方
 *   1. https://script.google.com を開き「新しいプロジェクト」
 *   2. 最初からある中身を全部消して、このファイルの中身を貼り付ける
 *   3. 下の「設定」の APP_URL と CLASSES を書き換える
 *   4. 関数の選択で createStage1Form を選び「実行」（初回は権限の許可が必要）
 *   5. 実行ログに出る「編集用URL」を開いて中身を確認する
 *
 * フォームの流れ
 *   セクション1  はじめに（リンク・クラス・完了コード）
 *   セクション2  選び方について（全員）
 *                └「数字は表示されていましたか？」が「はい」の人だけセクション3へ
 *   セクション3  数字について（数字が表示された人だけ）
 *   セクション4  さいごに（全員）
 */

// ===================== 設定 =====================
const APP_URL = 'https://xxxx.vercel.app'; // デプロイしたアプリのURLに書き換える
const CLASSES = ['1組', '2組'];             // 実際のクラス名に書き換える
const FORM_TITLE = '画像アンケート';
// ================================================

function createStage1Form() {
  const form = FormApp.create(FORM_TITLE);

  // ---------- フォームの設定 ----------
  form.setLimitOneResponsePerUser(true); // 回答を1回に制限（ログインが必要）
  form.setCollectEmail(false);           // メールアドレスは集めない
  form.setProgressBar(true);
  form.setAllowResponseEdits(false);
  form.setPublishingSummary(false);
  form.setShowLinkToRespondAgain(false);
  form.setConfirmationMessage('回答を受け付けました。ありがとうございました。');

  // ---------- セクション1：はじめに ----------
  form.setDescription([
    'この調査では、画像を2枚ずつ見て、よいと思うほうを選んでもらいます。',
    '',
    '画像に数字（いいね数）が表示されることがあります。その数字は、この調査のために設定したもので、実際の人数ではありません。',
    '',
    '名前は記録されません。参加は自由で、成績には関係ありません。答えに正解はありません。調査のくわしい目的は、すべての調査が終わったあとに説明します。',
  ].join('\n'));

  form.addSectionHeaderItem()
    .setTitle('手順')
    .setHelpText([
      '1. 下のリンクを開いて、画像を選んでください。',
      '2. 最後に表示される「完了コード」をこのページに入力して「次へ」を押してください。',
      '3. 完了コードは後日使うことがあるので、メモしておいてください。',
      '',
      'リンク：' + APP_URL,
    ].join('\n'));

  form.addMultipleChoiceItem()
    .setTitle('何組ですか？')
    .setChoiceValues(CLASSES)
    .setRequired(true);

  form.addTextItem()
    .setTitle('ページの最後に表示された完了コード（6文字）を入力してください')
    .setValidation(
      FormApp.createTextValidation()
        .requireTextMatchesPattern('^[A-Za-z0-9]{6}$')
        .setHelpText('ページの最後に出る6文字のコードを入力してください')
        .build()
    )
    .setRequired(true);

  // ---------- セクション2：選び方について（全員） ----------
  form.addPageBreakItem().setTitle('選び方について');

  form.addCheckboxItem()
    .setTitle('画像を選ぶとき、何を参考にしましたか？（すべて選んでください）')
    .setChoiceValues([
      '色',
      '形や模様',
      '写っているものが好きかどうか',
      'なんとなく（直感）',
      '画像に付いていた数字',
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addScaleItem()
    .setTitle('選ぶとき、どのくらい迷いましたか？')
    .setBounds(1, 5)
    .setLabels('まったく迷わなかった', 'とても迷った')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('迷った画像があれば、どんな画像で、最後は何で決めたか教えてください')
    .setRequired(false);

  // 分かれ道になる質問（行き先は、下でセクションを作ってから設定する）
  const shown = form.addMultipleChoiceItem()
    .setTitle('画像に、数字（いいね数）は表示されていましたか？')
    .setRequired(true);

  // ---------- セクション3：数字について（表示された人だけ） ----------
  const secNumbers = form.addPageBreakItem().setTitle('数字について');

  form.addScaleItem()
    .setTitle('選ぶとき、数字をどのくらい参考にしましたか？')
    .setBounds(1, 5)
    .setLabels('まったく参考にしなかった', 'とても参考にした')
    .setRequired(true);

  form.addScaleItem()
    .setTitle('数字が多いほうの画像は、少ないほうよりも良く見えましたか？')
    .setBounds(1, 5)
    .setLabels('まったくそう思わない', 'とてもそう思う')
    .setRequired(true);

  form.addScaleItem()
    .setTitle('数字が調査のために設定されたものだということを、選んでいる間どのくらい意識していましたか？')
    .setBounds(1, 5)
    .setLabels('ほとんど忘れていた', 'ずっと意識していた')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('数字を見て、どう感じましたか？選び方は変わりましたか？')
    .setRequired(false);

  // ---------- セクション4：さいごに（全員） ----------
  const secLast = form.addPageBreakItem().setTitle('さいごに');

  form.addMultipleChoiceItem()
    .setTitle('SNSや動画サイトをどのくらい見ますか？')
    .setChoiceValues(['ほぼ毎日', '週に数回', 'たまに', 'ほとんど見ない'])
    .setRequired(true);

  form.addScaleItem()
    .setTitle('自分はほかの人の意見に流されやすいと思いますか？')
    .setBounds(1, 5)
    .setLabels('まったく思わない', 'とても思う')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('感想や気づいたことがあれば自由に書いてください')
    .setRequired(false);

  form.addSectionHeaderItem()
    .setTitle('ご協力ありがとうございました')
    .setHelpText('全員が終わるまで、画像や数字のことはほかの人に話さないでください。自分のデータを使わないでほしいときは、完了コードを伝えてくれれば、名前を出さずに取り消せます。');

  // 分かれ道の行き先：「はい」→ 数字について／それ以外 → さいごに
  shown.setChoices([
    shown.createChoice('はい', secNumbers),
    shown.createChoice('いいえ', secLast),
    shown.createChoice('覚えていない', secLast),
  ]);

  // ---------- 回答を集めるスプレッドシート ----------
  const ss = SpreadsheetApp.create(FORM_TITLE + '（回答）');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log('編集用URL：' + form.getEditUrl());
  Logger.log('回答用URL（Classroomに貼る）：' + form.getPublishedUrl());
  Logger.log('回答スプレッドシート：' + ss.getUrl());
}
