const fs = require('fs');
const https = require('https');

// 抓取數據模組
function fetchURL(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// 代理伺服器備援
async function fetchWithProxy(url) {
  let data = await fetchURL(`https://corsproxy.io/?${encodeURIComponent(url)}`);
  if (data) return data;

  let proxy2 = await fetchURL(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
  if (proxy2 && proxy2.contents) {
    try { return JSON.parse(proxy2.contents); } catch (e) {}
  }
  return null;
}

// 👑 終極 ETA 算法：多重防呆，絕對唔會再出 NaN
function getMinutes(trainList) {
  if (!trainList || trainList.length === 0) return '約 -- 分鐘';
  
  try {
    // 方法 1：直接讀取港鐵提供嘅官方 ttnt（下一班車倒數時間）
    if (trainList[0].ttnt !== undefined && trainList[0].ttnt !== null) {
      const ttnt = parseInt(trainList[0].ttnt);
      if (!isNaN(ttnt)) {
        return '約 ' + ttnt + ' 分鐘';
      }
    }
    
    // 方法 2：如果冇 ttnt，安全計算兩班車相差時間
    if (trainList.length >= 2 && trainList[0].time && trainList[1].time) {
      const time1 = new Date(trainList[0].time.replace(' ', 'T') + '+08:00').getTime();
      const time2 = new Date(trainList[1].time.replace(' ', 'T') + '+08:00').getTime();
      const diff = Math.round(Math.abs(time2 - time1) / 60000);
      if (!isNaN(diff) && diff > 0) return '約 ' + diff + ' 分鐘';
    }
  } catch (e) {
    console.error('Error parsing train data');
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
      ktl_up: getMinutes(ktl?.data?.['KTL-WHA']?.UP),
      eal_dn: getMinutes(eal?.data?.['EAL-HUH']?.DOWN),
      eal_up: getMinutes(eal?.data?.['EAL-HUH']?.UP),
      tml_up: getMinutes(tml?.data?.['TML-HUH']?.UP),
      tml_dn: getMinutes(tml?.data?.['TML-HUH']?.DOWN),
      update_time: `${h}:${m}`
    };

    fs.writeFileSync('mtr_data.json', JSON.stringify(result, null, 2));
    console.log('MTR Data updated successfully:', result);
  } catch (err) {
    console.error('System Error:', err);
  }
}

fetchMTR();
