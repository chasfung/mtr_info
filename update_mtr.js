const fs = require('fs');

// 讓 GitHub 機器人使用代理伺服器，突破香港政府的海外 IP 封鎖
async function fetchWithProxy(url) {
  // 代理 1：CorsProxy
  try {
    const proxy1 = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const res1 = await fetch(proxy1, { headers: { 'User-Agent': 'Mozilla/5.0' }});
    if (res1.ok) return await res1.json();
  } catch (e) {
    console.log('Proxy 1 failed, trying Proxy 2...');
  }

  // 代理 2：AllOrigins 備援
  try {
    const proxy2 = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res2 = await fetch(proxy2);
    if (res2.ok) {
      const wrapper = await res2.json();
      return JSON.parse(wrapper.contents);
    }
  } catch (e) {}

  return null;
}

function calcFreq(trainList) {
  if (!trainList || trainList.length === 0) return '約 -- 分鐘';
  if (trainList.length === 1) return '約 ' + trainList[0].ttnt + ' 分鐘';
  const t1 = parseInt(trainList[0].ttnt);
  const t2 = parseInt(trainList[1].ttnt);
  if (!isNaN(t1) && !isNaN(t2)) {
    const diff = Math.abs(t2 - t1);
    if (diff > 0) return '約 ' + diff + ' 分鐘';
  }
  return '約 ' + trainList[0].ttnt + ' 分鐘';
}

async function fetchMTR() {
  try {
    const [ktl, eal, tml] = await Promise.all([
      fetchWithProxy('https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=KTL&sta=WHA'),
      fetchWithProxy('https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=EAL&sta=HUH'),
      fetchWithProxy('https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=TML&sta=HUH')
    ]);

    // 強制寫入香港時間 (UTC+8)
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
