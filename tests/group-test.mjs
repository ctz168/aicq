import http from 'http';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const opts = {hostname:'127.0.0.1',port:3000,path,method,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}};
    const r = http.request(opts, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({status: res.statusCode, data: b ? JSON.parse(b) : null}));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function test() {
  let pass = 0, fail = 0;
  const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✅ ' + name); } catch(e) { fail++; console.log('  ❌ ' + name + ': ' + e.message); } };
  
  console.log('\n🧪 AICQ Group Chat Tests\n');

  await t('Register node', async () => { const r = await req('POST','/api/v1/node/register',{id:'grp-test-'+Date.now(),publicKey:'AAA'}); if(r.status!==200) throw new Error('status '+r.status); });
  await t('GET /group/list returns empty', async () => { const r = await req('GET','/api/v1/group/list?accountId=nonexist'); if(r.status!==200||!Array.isArray(r.data.groups)) throw new Error(JSON.stringify(r.data)); });
  await t('POST /group/create requires account', async () => { const r = await req('POST','/api/v1/group/create',{name:'Test',ownerId:'nonexist'}); if(r.status!==400||!r.data.error) throw new Error(JSON.stringify(r.data)); });
  await t('GET /group/:id not found', async () => { const r = await req('GET','/api/v1/group/nonexist?accountId=x'); if(r.status!==404) throw new Error('got '+r.status); });
  await t('POST /group/:id/invite exists', async () => { const r = await req('POST','/api/v1/group/test/invite',{accountId:'x',targetId:'y'}); if(r.status===404) throw new Error('route not found'); });
  await t('POST /group/:id/kick exists', async () => { const r = await req('POST','/api/v1/group/test/kick',{accountId:'x',targetId:'y'}); if(r.status===404) throw new Error('route not found'); });
  await t('POST /group/:id/leave exists', async () => { const r = await req('POST','/api/v1/group/test/leave',{accountId:'x'}); if(r.status===404) throw new Error('route not found'); });
  await t('DELETE /group/:id exists', async () => { const r = await req('DELETE','/api/v1/group/test',{accountId:'x'}); if(r.status===404) throw new Error('route not found'); });
  await t('PUT /group/:id exists', async () => { const r = await req('PUT','/api/v1/group/test',{accountId:'x',name:'new'}); if(r.status===404) throw new Error('route not found'); });
  await t('POST /group/:id/transfer exists', async () => { const r = await req('POST','/api/v1/group/test/transfer',{accountId:'x',targetId:'y'}); if(r.status===404) throw new Error('route not found'); });
  await t('POST /group/:id/role exists', async () => { const r = await req('POST','/api/v1/group/test/role',{accountId:'x',targetId:'y',role:'admin'}); if(r.status===404) throw new Error('route not found'); });
  await t('POST /group/:id/mute exists', async () => { const r = await req('POST','/api/v1/group/test/mute',{accountId:'x',targetId:'y',muted:true}); if(r.status===404) throw new Error('route not found'); });

  console.log('\n' + '─'.repeat(50));
  console.log('\n📊 Results: ' + pass + ' passed, ' + fail + ' failed, ' + (pass+fail) + ' total\n');
}

test().catch(console.error);
