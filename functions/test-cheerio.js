const client = require('cheerio-httpcli');
const url = 'https://nikkeiyosoku.com/up_down_ratio/';

client.fetch(url, function (err, $, res) {
  if (err) {
    console.error(err);
  }

  $('td').each(function (i, e) {
    console.log(i + ':' + $(e).text());
  });
});