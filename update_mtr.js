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
  
  // 1. 優先直連官方 API (速度最快，唔怕被 Proxy 限速)
  let data = await fetchJSON(targetUrl);
  if (data && data.status === 1) {
    console.log(`[Direct] 成功抓取 ${line}-${sta}`);
    return data;
  }
  
  // 2. 備援 Proxy 1: AllOrigins
  console.log(`[Direct] 失敗，嘗試 AllOrigins...`);
  let proxy1 = await fetchJSON(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`);
  if (proxy1 && proxy1.contents) {
    try {
      let parsed = JSON.parse(proxy1.contents);
      if (parsed.status === 1) {
        console.log(`[AllOrigins] 成功抓取 ${line}-${sta}`);
        return parsed;
      }
    } catch(e) {}
  }
  
  // 3. 備援 Proxy 2: CorsProxy
  console.log(`[AllOrigins] 失敗，嘗試 CorsProxy...`);
  let proxy2 = await fetchJSON(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
  if (proxy2 && proxy2.status === 1) {
    console.log(`[CorsProxy] 成功抓取 ${line}-${sta}`);
    return proxy2;
  }
  
  console.log(`[Error] 所有連線方法均失敗 ${line}-${sta}`);
  return null;
}

// 提取 ETA，無懼資料缺失
function getMinutes(trainList) {
  if (!trainList || !Array.isArray(trainList) || trainList.length === 0) return '約 -- 分鐘';
  
  for (let train of trainList) {
    if (train.ttnt !== undefined && train.ttnt !== null && train.ttnt !== '') {
      const ttnt = parseInt(train.ttnt);
      if (!isNaN(ttnt)) {
        return `約 ${ttnt} 分鐘`;
      }
    }
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

  const result = {
    ktl_up: getMinutes(ktl?.data?.['KTL-WHA']?.UP),
    eal_dn: getMinutes(eal?.data?.['EAL-HUH']?.DOWN),
    eal_up: getMinutes(eal?.data?.['EAL-HUH']?.UP),
    tml_up: getMinutes(tml?.data?.['TML-HUH']?.UP),
    tml_dn: getMinutes(tml?.data?.['TML-HUH']?.DOWN),
    update_time: `${h}:${m}`
  };

  fs.writeFileSync('mtr_data.json', JSON.stringify(result, null, 2));
  console.log('數據寫入成功:', result);
}

fetchAll();
