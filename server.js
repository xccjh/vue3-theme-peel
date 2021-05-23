const express = require('express');
// const proxy = require('http-proxy-middleware');
const app = express();
const https = require('https');
const path = require('path');
const fs = require('fs');

const PORT = 8089;
const privateKey = fs.readFileSync(path.join(__dirname, './private.key'), 'utf8');
const certificate = fs.readFileSync(path.join(__dirname, './file.crt'), 'utf8');
const credentials = { key: privateKey, cert: certificate };
const server = https.createServer(credentials, app);
const httpsArgv = process.argv.slice(2)[0];
const flag = httpsArgv && httpsArgv.split('=')[1];
const serverInstance = flag ? server : app;
const protocol = flag ? 'https' : 'http';
// 路径以 '/api' 的配置
// const apiProxy = proxy('/api/**', {
//   target: "http://localhost:3000",
//   changeOrigin: true,
//   pathRewrite: {
//     "^/api": ""
//   }
// });
//
// 路径以 '/' 的配置
// const apiProxy = proxy('/**', {
//   target: "http://localhost:3000",
//   changeOrigin: true
// });
// app.use(apiProxy);
// app.use(proxy(['/**','/api/**'],{
//         target: 'http://localhost:3000',
//         ws: false,
//         changeOrigin: false,
//         logLevel: 'info'
// }));
app.all('*', (req, res, next) => {
  // 设置允许跨域的域名，*代表允许任意域名跨域
  res.header('Access-Control-Allow-Origin', '*');
  // 允许的header类型
  res.header('Access-Control-Allow-Headers', 'content-type');
  // 跨域允许的请求方式
  res.header('Access-Control-Allow-Methods', 'DELETE,PUT,POST,GET,OPTIONS');
  if (req.method.toLowerCase() === 'options') {
    res.send(200);
  } else {
    next(); // 让options尝试请求快速结束
  }
});
const context = [''];
app.use(context, express.static('docs'));

serverInstance.listen(PORT, (err) => {
  if (err) {
    console.log('err :', err);
  } else {
    console.log(`Listen at ${protocol}://localhost:${PORT}`);
    console.log(`Listen at ${protocol}://ky.qicoursezjh.com:${PORT}`);
  }
});
