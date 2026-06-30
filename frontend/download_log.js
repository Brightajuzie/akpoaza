const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const url = require('url');

const logUrl = "https://storage.googleapis.com/eas-workflows-production/logs/8d4405de-245d-4c45-b0c0-5331aeb2e9fe/b9843ee5-952f-47d6-8644-3ef8e292d2ac/2026-06-30T00%3A27%3A25Z-5a527f36-8433-4346-9c31-d19233af03fb.txt?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=www-production%40exponentjs.iam.gserviceaccount.com%2F20260630%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=20260630T003325Z&X-Goog-Expires=900&X-Goog-SignedHeaders=host&X-Goog-Signature=469909fcffbe9efa888628dbe0a59191b2e4238f976c02f415ef05b9cbb2d5b225da9328492fa42899771f24834b9d7e84c805f0045db968d692dd64b4f27eb3926ad0a33aca3c9aa84991b69a3edb6e51c05e08e8ee4ee6dc13483336d262f52cc1c04fc4e4b1bf81236c65bd76ce6bddda76be949eed82c0500ee2f2b4ef5891ed01233992ff11dffc5f0709f3b72f938fe444bcb1d2fa37e6f06c5cc03af87b506d13695a8abd5f4e10ad5196e808fe07608abf7929fb82c61ad0bb78237788f0f51d8445f9dc5ef9eece7099b611034292e14921c0e03947c6badc3c52b50a599c104aaa79c051ffce9c0f0f081449e1b37ada7251bff60a804cc10fb422";

function download(targetUrl) {
  console.log('Downloading from:', targetUrl.substring(0, 100) + '...');
  
  const options = url.parse(targetUrl);
  options.headers = {
    'Accept-Encoding': 'gzip, deflate, br'
  };

  https.get(options, (res) => {
    console.log('Status Code:', res.statusCode);
    console.log('Response Headers:', JSON.stringify(res.headers, null, 2));

    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      download(res.headers.location);
      return;
    }

    if (res.statusCode !== 200) {
      console.error('Failed to download log, status:', res.statusCode);
      return;
    }

    let output = fs.createWriteStream('../clean_build_log.txt');
    let decompressor;

    const encoding = res.headers['content-encoding'];
    if (encoding === 'gzip') {
      console.log('Decompressing gzip...');
      decompressor = zlib.createGunzip();
    } else if (encoding === 'deflate') {
      console.log('Decompressing deflate...');
      decompressor = zlib.createInflate();
    } else if (encoding === 'br') {
      console.log('Decompressing brotli...');
      decompressor = zlib.createBrotliDecompress();
    }

    if (decompressor) {
      res.pipe(decompressor).pipe(output);
    } else {
      console.log('Writing raw response...');
      res.pipe(output);
    }

    output.on('finish', () => {
      console.log('Done!');
    });
  }).on('error', (err) => {
    console.error('Error:', err);
  });
}

download(logUrl);
