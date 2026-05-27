const https = require('https');

class SttService {
  constructor() {
    this.apiKey = '';
    this.secretKey = '';
    this.accessToken = '';
    this.tokenExpiry = 0;
  }

  configure(apiKey, secretKey) {
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.accessToken = '';
    this.tokenExpiry = 0;
  }

  async _getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.apiKey || !this.secretKey) {
      throw new Error('NO_CONFIG');
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.apiKey,
      client_secret: this.secretKey
    });

    console.log('[SttService] Requesting token with client_id:', this.apiKey.substring(0, 8) + '...');

    return new Promise((resolve, reject) => {
      const url = `https://aip.baidubce.com/oauth/2.0/token?${params.toString()}`;
      const req = https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log('[SttService] Token response:', data.substring(0, 200));
          try {
            const json = JSON.parse(data);
            if (json.access_token) {
              this.accessToken = json.access_token;
              this.tokenExpiry = Date.now() + (json.expires_in - 3600) * 1000;
              resolve(this.accessToken);
            } else {
              reject(new Error(json.error_description || json.error || '获取百度token失败'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('token请求超时')); });
    });
  }

  async recognize(audioBase64, byteLength) {
    if (!this.apiKey || !this.secretKey) {
      throw new Error('NO_CONFIG');
    }

    const token = await this._getAccessToken();

    const body = JSON.stringify({
      format: 'pcm',
      rate: 16000,
      channel: 1,
      cuid: 'electron_calendar',
      token: token,
      speech: audioBase64,
      len: byteLength || (audioBase64.length * 3 / 4)
    });

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'vop.baidu.com',
        port: 443,
        path: '/server_api',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.err_no === 0 && json.result && json.result.length > 0) {
              resolve(json.result[0]);
            } else {
              reject(new Error(json.err_msg || '识别失败'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('识别请求超时')); });
      req.write(body);
      req.end();
    });
  }
}

module.exports = { SttService };
