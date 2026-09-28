/* eslint-disable @typescript-eslint/no-require-imports */
// One explicit paid diagnostic, never retries. Preserves response for review.
require('@next/env').loadEnvConfig(process.cwd());
const fs=require('node:fs');
(async()=>{
 const original=fs.readFileSync('.runtime/design-images/904c87b9bbd9569dae3a0dfd21dd8468caf1d140d774f507881c8810612f5dc0.original');
 const job=JSON.parse(fs.readFileSync('.runtime/design-images/904c87b9bbd9569dae3a0dfd21dd8468caf1d140d774f507881c8810612f5dc0.json','utf8'));
 const started=Date.now();
 const response=await fetch('https://cn.pixellelabs.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent',{method:'POST',headers:{Authorization:'Bearer '+process.env.IMAGE_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(240000),body:JSON.stringify({contents:[{role:'user',parts:[{text:job.prompt},{inlineData:{mimeType:'image/jpeg',data:original.toString('base64')}}]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{imageSize:'1K'}}})});
 const raw=await response.text();const payload=JSON.parse(raw);let safeError=payload.error?.message||payload.error;
 if(typeof safeError==='string')safeError=safeError.replaceAll(process.env.IMAGE_API_KEY,'[redacted]').replace(/sk-[\w-]+/g,'[redacted]');
 const summary={status:response.status,elapsedMs:Date.now()-started,requestId:response.headers.get('x-oneapi-request-id'),error:safeError,finishReason:payload.candidates?.[0]?.finishReason};
 fs.writeFileSync('.runtime/acceptance/image-provider-diagnostic.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 const part=payload.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.data||p.inline_data?.data);if(part){const data=part.inlineData||part.inline_data;fs.writeFileSync('.runtime/acceptance/image-provider-diagnostic.png',Buffer.from(data.data,'base64'));console.log('IMAGE_SAVED');}
})().catch(e=>{fs.writeFileSync('.runtime/acceptance/image-provider-diagnostic.json',JSON.stringify({testedAt:new Date().toISOString(),error:e.message,code:e.cause?.code,timeoutMs:240000,imageReturned:false},null,2));console.error(e.message,e.cause?.code);process.exitCode=1;});
