const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// スケジュール設定で毎日17:15に定期実行
exports.getRatioFromSiteAndSet = functions.region('asia-northeast1').pubsub.schedule('15 17 * * *').timeZone('Asia/Tokyo').onRun((context) => {
  const client = require('cheerio-httpcli');
  const url = 'https://nikkeiyosoku.com/up_down_ratio/';

  client.fetch(url, function (err, $, res) {
    if (err) {
      console.error(err);
    }

    // 最新の騰落レシオを取得
    let ratioDate;
    let ratio;
    $('td').each(function (i, e) {
      if (i === 29) {
        ratioDate = new Date($(e).text());
      }
      if (i === 33) {
        ratio = Number($(e).text());
      }
    });

    setRatioToFS(ratioDate, ratio);
  });
});

exports.setRatio = functions.region('asia-northeast1').https.onRequest((request, response) => {
  // 騰落レシオ日はYYYYMMDD形式を想定
  const ratioDateYYYYMMDD = request.query.ratioDate;
  const ratioDate = new Date(ratioDateYYYYMMDD.substr(0, 4), Number(ratioDateYYYYMMDD.substr(4, 2)) - 1, ratioDateYYYYMMDD.substr(6, 2));
  const ratio = Number(request.query.ratio);

  setRatioToFS(ratioDate, ratio);
  response.send(ratioDate + ': ' + ratio);
});

function setRatioToFS(ratioDate, ratio) {
  const ratioDateYYYYMMDD = ratioDate.getFullYear() + ('00' + (ratioDate.getMonth() + 1)).slice(-2) + ('00' + ratioDate.getDate()).slice(-2);
  const data = {
    ratioDate: ratioDate,
    ratio: ratio,
    date: new Date()
  };

  db.collection('ratios').doc(ratioDateYYYYMMDD).set(data);
}

// スケジュール設定で毎日17:30に定期実行
exports.notifyUsers = functions.region('asia-northeast1').runWith({ secrets: ['MAIL_USER', 'MAIL_PASS'] })
  .pubsub.schedule('30 17 * * *').timeZone('Asia/Tokyo').onRun((context) => {
    Promise.all([
      getLatestRatiosFromFS(),
      getUserSettingsFromFS()
    ]).then(
      response => {
        // どちらが先にセットされるかは保証されないが、どちらのインデックス番号にセットされるかは保証される模様
        const latestRatios = response[0];
        const userSettings = response[1];

        // 最新の騰落レシオ
        const latestRatioDate = latestRatios.get('latestRatioDate');
        const latestRatio = latestRatios.get('latestRatio');
        const latestDate = latestRatios.get('latestDate');
        // 1つ前の騰落レシオ
        const prevRatio = latestRatios.get('prevRatio');

        // 株式市場の営業日のみ通知する
        if (latestRatioDate === latestDate) {
          // ユーザー分繰り返し
          userSettings.forEach((doc) => {
            // ユーザー設定情報
            const fields = doc.data();
            const upperNotifyFlg = fields.upperNotifyFlg
            const upperValue = fields.upperValue;
            const lowerNotifyFlg = fields.lowerNotifyFlg;
            const lowerValue = fields.lowerValue;

            // 上限値での通知
            if (upperNotifyFlg) {
              if (prevRatio < upperValue && upperValue <= latestRatio) {
                // 上回った場合
                const subject = '上限値を上回りました(' + latestRatioDate + '時点)';
                const content = '騰落レシオが上限値を上回りました。\n' + getCommonContent();
                notifyUser(doc.id, subject, content);
              } else if (prevRatio >= upperValue && upperValue > latestRatio) {
                // 下回った場合
                const subject = '上限値を下回りました(' + latestRatioDate + '時点)';
                const content = '騰落レシオが上限値を下回りました。\n' + getCommonContent();
                notifyUser(doc.id, subject, content);
              }
            }

            // 下限値での通知
            if (lowerNotifyFlg) {
              if (prevRatio > lowerValue && lowerValue >= latestRatio) {
                // 下回った場合
                const subject = '下限値を下回りました(' + latestRatioDate + '時点)';
                const content = '騰落レシオが下限値を下回りました。\n' + getCommonContent();
                notifyUser(doc.id, subject, content);
              } else if (prevRatio <= lowerValue && lowerValue < latestRatio) {
                // 上回った場合
                const subject = '下限値を上回りました(' + latestRatioDate + '時点)';
                const content = '騰落レシオが下限値を上回りました。\n' + getCommonContent();
                notifyUser(doc.id, subject, content);
              }
            }

            // 本文の共通文言を記載
            function getCommonContent() {
              // 騰落レシオの前日比（誤差がでるので小数点第一位で四捨五入）
              const diffRatio = Math.round((latestRatio - prevRatio) * 10) / 10;

              return '\n'
                + '■ ' + latestRatioDate + '時点\n'
                + '騰落レシオ: ' + latestRatio + '%\n'
                + '前日比: ' + ((diffRatio > 0) ? ('+' + diffRatio) : diffRatio) + '%\n'
                + '\n'
                + '■ あなたの通知設定\n'
                + '上限値で通知する: ' + (upperNotifyFlg ? 'ON' : 'OFF') + '\n'
                + '上限値: ' + upperValue + '%\n'
                + '下限値で通知する: ' + (lowerNotifyFlg ? 'ON' : 'OFF') + '\n'
                + '下限値: ' + lowerValue + '%\n'
            }
          });
        }
      }
    );
  });

exports.notifyRegistration = functions.region('asia-northeast1').runWith({ secrets: ['MAIL_USER', 'MAIL_PASS'] })
  .https.onCall((data, context) => {
    const subject = 'ユーザー登録完了のお知らせ';
    const content =
      'この度は「騰落レシオ通知」にユーザー登録いただき誠にありがとうございます。\n'
      + '\n'
      + '引き続き、通知設定の画面でお好みの通知条件を設定してください。\n'
      + 'あとは条件を満たしたら通知が届きます！\n';

    // uidをdocIdにしている
    notifyUser(context.auth.uid, subject, content);
  });

// Firestoreから最新と1つ前の騰落レシオを取得
async function getLatestRatiosFromFS() {
  const snapshot = await db.collection('ratios').orderBy('ratioDate', 'desc').limit(2).get();
  let latestRatios = new Map();

  let docIndex = 1;
  snapshot.forEach((doc) => {
    const fields = doc.data();
    // 最新と1つ前を識別するいい方法が分からない…
    if (docIndex === 1) {
      latestRatios.set('latestRatioDate', formatSlashYYYYMMDD(fields.ratioDate));
      latestRatios.set('latestRatio', fields.ratio);
      latestRatios.set('latestDate', formatSlashYYYYMMDD(fields.date));
    } else {
      latestRatios.set('prevRatioDate', formatSlashYYYYMMDD(fields.ratioDate));
      latestRatios.set('prevRatio', fields.ratio);
      latestRatios.set('prevDate', formatSlashYYYYMMDD(fields.date));
    }
    docIndex++;
  });

  return latestRatios;
};

function formatSlashYYYYMMDD(fsTimestamp) {
  const date = fsTimestamp.toDate();
  // YYYY/MM/DD形式の文字列
  return date.getFullYear() + '/' + (date.getMonth() + 1) + '/' + date.getDate();
}

// Firestoreからユーザー設定を取得
async function getUserSettingsFromFS() {
  return (await db.collection('userSettings').get()).docs;
};

function notifyUser(docId, subject, content) {
  admin.auth().getUser(docId).then((userRecord) => {
    sendMail(userRecord.email, subject, content);
  }).catch((error) => {
    console.error(error);
  });
};

function sendMail(to, subject, content) {
  const nodemailer = require('nodemailer');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    port: 465,
    secure: true,
    auth: {
      // メールアドレス（シークレットから取得）
      user: process.env.MAIL_USER,
      // 16桁のアプリパスワード（シークレットから取得）
      pass: process.env.MAIL_PASS,
    },
  });

  const text = content
    + '\n'
    + '〜 騰落レシオ通知 〜\n'
    + '通知設定の変更、通知メールの配信停止等はこちらから\n'
    + 'https://updownratio.web.app/\n'
    + '';

  transporter.sendMail({
    from: '"騰落レシオ通知" <noreply@updownratio.firebaseapp.com>',
    to: to,
    subject: subject,
    text: text,
  }, function (err, info) {
    if (err) {
      console.error(err);
    } else {
      console.log(info.response)
    }
  });
}