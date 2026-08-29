const fs = require('fs');

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
      fetch('https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=KTL&sta=WHA').then(r=>r.json()).catch(()=>null),
      fetch('https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=EAL&sta=HUH').then(r=>r.json()).catch(()=>null),
      fetch('https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=TML&sta=HUH').then(r=>r.json()).catch(()=>null)
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
