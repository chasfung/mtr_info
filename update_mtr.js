const fs = require('fs');
const https = require('https');

// 使用 Node.js 內建 https 模組抓取資料
function fetchURL(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', (err) => resolve(null));
  });
}

// 代理伺服器輪詢機制
async function fetchWithProxy(url) {
  let data = await fetchURL(`https://corsproxy.io/?${encodeURIComponent(url)}`);
  if (data) return data;

  console.log('Proxy 1 failed, trying Proxy 2...');
  let proxy2Data = await fetchURL(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
  if (proxy2Data && proxy2Data.contents) {
    try {
      return JSON.parse(proxy2Data.contents);
    } catch (e) {}
  }
  return null;
}

// 👑 終極 ETA 算法：直接提取第一班車嘅官方倒數時間，避開所有數學運算錯誤
function calcETA(trainList) {
  if (!trainList || trainList.length === 0) return '約 -- 分鐘';
  
  try {
    const nextTrain = trainList[0];
    
    // 1. 優先使用官方原生提供嘅 ttnt (Time To Next Train)
    if (nextTrain.ttnt !== undefined && nextTrain.ttnt !== '') {
       const min = parseInt(nextTrain.ttnt);
       if (!isNaN(min)) {
         return '約 ' + min + ' 分鐘';
       }
    }

    // 2. 備援：如果官方無畀 ttnt，我哋親自用官方時間減去而家時間
    if (nextTrain.time) {
      const timeStr = nextTrain.time.replace(' ', 'T') + '+08:00';
      const targetTime = new Date(timeStr).getTime();
      const now = Date.now();
      const diffMins = Math.round((targetTime - now) / 60000);
      if (!isNaN(diffMins) && diffMins >= 0) {
        return '約 ' + diffMins + ' 分鐘';
      }
    }
  } catch (e) {
    console.error('Time calculation error:', e);
  }
  
  return '約 -- 分鐘';
}

async function fetchMTR() {
  try {
    const [ktl, eal, tml] = await Promise.all([
      fetchWithProxy('https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=KTL&sta=WHA'),
      fetchWithProxy('https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=EAL&sta=HUH'),
      fetchWithProxy('https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=TML&sta=HUH')
    ]);

    const hkTime = new Date(Date.now() + 8 * 3600000);
    const h = String(hkTime.getUTCHours()).padStart(2, '0');
    const m = String(hkTime.getUTCMinutes()).padStart(2, '0');

    const result = {
      ktl_up: calcETA(ktl?.data?.['KTL-WHA']?.UP),
      eal_dn: calcETA(eal?.data?.['EAL-HUH']?.DOWN),
      eal_up: calcETA(eal?.data?.['EAL-HUH']?.UP),
      tml_up: calcETA(tml?.data?.['TML-HUH']?.UP),
      tml_dn: calcETA(tml?.data?.['TML-HUH']?.DOWN),
      update_time: `${h}:${m}`
    };

    fs.writeFileSync('mtr_data.json', JSON.stringify(result, null, 2));
    console.log('MTR Data updated successfully at ' + result.update_time);
  } catch (err) {
    console.error('Error:', err);
  }
}

fetchMTR();
