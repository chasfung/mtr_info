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

// 👑 終極算法：親自提取兩班車嘅標準時間做減法，保證一定出「真實分鐘」！
function calcFreq(trainList) {
  if (!trainList || trainList.length < 2) return '約 -- 分鐘';
  
  try {
    // 提取兩班車嘅實際到站時間 (例如 API 給的 "2024-08-29 20:25:00")
    // 將空格換成 T，加上 +08:00，確保時區與計算絕對正確
    const time1Str = trainList[0].time.replace(' ', 'T') + '+08:00';
    const time2Str = trainList[1].time.replace(' ', 'T') + '+08:00';
    
    const t1 = new Date(time1Str).getTime();
    const t2 = new Date(time2Str).getTime();
    
    if (!isNaN(t1) && !isNaN(t2)) {
      // 計算兩班車相距嘅毫秒數，再除以 60000 變成「分鐘」
      const diffMins = Math.round(Math.abs(t2 - t1) / 60000);
      if (diffMins > 0) {
        return '約 ' + diffMins + ' 分鐘';
      }
    }
  } catch (e) {
    console.log('Time calculation error:', e);
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
      ktl_up: calcFreq(ktl?.data?.['KTL-WHA']?.UP),
      eal_dn: calcFreq(eal?.data?.['EAL-HUH']?.DOWN),
      eal_up: calcFreq(eal?.data?.['EAL-HUH']?.UP),
      tml_up: calcFreq(tml?.data?.['TML-HUH']?.UP),
      tml_dn: calcFreq(tml?.data?.['TML-HUH']?.DOWN),
      update_time: `${h}:${m}`
    };

    fs.writeFileSync('mtr_data.json', JSON.stringify(result, null, 2));
    console.log('MTR Data updated successfully at ' + result.update_time);
  } catch (err) {
    console.error('Error:', err);
  }
}

fetchMTR();
