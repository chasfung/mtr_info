const fs = require('fs');
const https = require('https');

// 基本抓取模組
function fetchJSON(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// 智能切換抓取引擎：直連 -> Proxy 1 -> Proxy 2
async function fetchMTRData(line, sta) {
  const targetUrl = `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${line}&sta=${sta}`;
  
  let data = await fetchJSON(targetUrl);
  if (data && data.status === 1) return data;
  
  let proxy1 = await fetchJSON(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`);
  if (proxy1 && proxy1.contents) {
    try {
      let parsed = JSON.parse(proxy1.contents);
      if (parsed.status === 1) return parsed;
    } catch(e) {}
  }
  
  let proxy2 = await fetchJSON(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
  if (proxy2 && proxy2.status === 1) return proxy2;
  
  return null;
}

// 👑 班次密度算法（Train 2 - Train 1），附帶防呆機制
function getFrequency(trainList) {
  if (!trainList || !Array.isArray(trainList) || trainList.length === 0) return '約 -- 分鐘';
  
  try {
    // 正常情況：如果有 2 班車或以上，計算班次相隔時間
    if (trainList.length >= 2) {
      // 優先使用官方倒數分鐘 (ttnt) 相減
      const ttnt1 = parseInt(trainList[0].ttnt);
      const ttnt2 = parseInt(trainList[1].ttnt);
      
      if (!isNaN(ttnt1) && !isNaN(ttnt2)) {
        const diff = Math.abs(ttnt2 - ttnt1);
        if (diff > 0) return `約 ${diff} 分鐘`;
      }
      
      // 備援：如果冇 ttnt，用絕對時間相減
      if (trainList[0].time && trainList[1].time) {
        const time1 = new Date(trainList[0].time.replace(' ', 'T') + '+08:00').getTime();
        const time2 = new Date(trainList[1].time.replace(' ', 'T') + '+08:00').getTime();
        const diff = Math.round(Math.abs(time2 - time1) / 60000);
        if (!isNaN(diff) && diff > 0) return `約 ${diff} 分鐘`;
      }
    }
    
    // 極端情況：如果 API 只提供咗 1 班車，安全退回顯示該班車嘅 ETA
    const ttnt = parseInt(trainList[0].ttnt);
    if (!isNaN(ttnt)) return `約 ${ttnt} 分鐘`;

  } catch (e) {
    console.error('Calculation error:', e);
  }
  
  return '約 -- 分鐘';
}

async function fetchAll() {
  console.log('開始更新港鐵數據...');
  const [ktl, eal, tml] = await Promise.all([
    fetchMTRData('KTL', 'WHA'),
    fetchMTRData('EAL', 'HUH'),
    fetchMTRData('TML', 'HUH')
  ]);

  const hkTime = new Date(Date.now() + 8 * 3600000);
  const h = String(hkTime.getUTCHours()).padStart(2, '0');
  const m = String(hkTime.getUTCMinutes()).padStart(2, '0');

  // 使用班次密度算法計算
  const result = {
    ktl_up: getFrequency(ktl?.data?.['KTL-WHA']?.UP),
    eal_dn: getFrequency(eal?.data?.['EAL-HUH']?.DOWN),
    eal_up: getFrequency(eal?.data?.['EAL-HUH']?.UP),
    tml_up: getFrequency(tml?.data?.['TML-HUH']?.UP),
    tml_dn: getFrequency(tml?.data?.['TML-HUH']?.DOWN),
    update_time: `${h}:${m}`
  };

  fs.writeFileSync('mtr_data.json', JSON.stringify(result, null, 2));
  console.log('數據寫入成功:', result);
}

fetchAll();
