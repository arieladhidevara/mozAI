const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sendInvitationEmail}=require('../lib/invitation-email');

const invitation={email:'guest@example.com',label:'Taylor & <Team>',token:'x'.repeat(43),id:'11111111-1111-4111-8111-111111111111',origin:'https://mozai.cc'};

test('invitation mail is optional and missing Resend credentials keep manual sharing available',async()=>{
  const prior=process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try{
    assert.deepEqual(await sendInvitationEmail({...invitation,email:null}),{status:'not_requested'});
    assert.deepEqual(await sendInvitationEmail(invitation),{status:'not_configured'});
  }finally{if(prior===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=prior}
});

test('email delivery has an invite-specific idempotency key and escapes names',async()=>{
  const oldKey=process.env.RESEND_API_KEY,oldFetch=global.fetch;
  process.env.RESEND_API_KEY='test-key-only';
  let called=0;
  global.fetch=async(url,options)=>{
    called++;
    assert.equal(url,'https://api.resend.com/emails');
    assert.equal(options.headers.Authorization,'Bearer test-key-only');
    assert.equal(options.headers['Idempotency-Key'],'mozai-invite-'+invitation.id);
    const payload=JSON.parse(options.body);
    assert.deepEqual(payload.to,[invitation.email]);
    assert.match(payload.text,/https:\/\/mozai.cc\/#invite=/);
    assert.match(payload.html,/Taylor &amp; &lt;Team&gt;/);
    assert.doesNotMatch(payload.html,/<Team>/);
    return {ok:true};
  };
  try{
    assert.deepEqual(await sendInvitationEmail(invitation),{status:'sent'});
    assert.equal(called,1);
  }finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=oldKey}
});

test('email delivery failures leave the invite link available for manual copy',async()=>{
  const oldKey=process.env.RESEND_API_KEY,oldFetch=global.fetch;
  process.env.RESEND_API_KEY='test-key-only';
  global.fetch=async()=>({ok:false,status:403});
  try{assert.deepEqual(await sendInvitationEmail(invitation),{status:'failed'})}
  finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=oldKey}
});
