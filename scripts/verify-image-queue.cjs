/* eslint-disable @typescript-eslint/no-require-imports */
require('./verify-design.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const sharp=require('sharp');const photo=await sharp({create:{width:20,height:20,channels:3,background:'red'}}).jpeg().toBuffer();
 process.chdir(fs.mkdtempSync(path.join(os.tmpdir(),'selection-image-queue-')));
 require('../src/lib/image-review.ts').reviewGarmentEdit=async()=>({decision:'pass',observed:'test',reason:'test'});
 const {createImageJob,readImageJob}=require('../src/lib/image-jobs.ts');
 process.env.IMAGE_API_KEY='test';
 let inFlight=0,max=0,calls=0;
 global.fetch=async url=>{if(!url.includes('generateContent'))return new Response(photo);calls++;inFlight++;max=Math.max(max,inFlight);await new Promise(r=>setTimeout(r,30));inFlight--;return new Response('{}',{status:503});};
 const input={model:'gemini-3.1-flash-image-preview',anchorAsin:'TEST000001',imageUrl:'https://m.media-amazon.com/test.jpg',prompt:'只修改衣服图案为条纹'};
 const jobs=await Promise.all([1,2,3].map(n=>createImageJob({...input,nonce:String(n)})));
 assert.equal((await createImageJob({...input,nonce:'2'})).id,jobs[1].id);
 for(let i=0;i<100;i++){const states=await Promise.all(jobs.map(j=>readImageJob(j.id)));if(states.every(j=>j.status==='failed'))break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(calls,3);assert.equal(max,1);assert((await Promise.all(jobs.map(j=>readImageJob(j.id)))).every(j=>j.status==='failed'));
 console.log('PASS: three accepted jobs, one upstream at a time, duplicate reused, failure advances queue without retry');
})().catch(e=>{console.error(e);process.exitCode=1;});
