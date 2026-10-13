import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareProfilePhoto,isProfilePhoto,saveProfilePhoto} from '../src/profile-photo.mjs';
import {AccountStorage} from '../src/account.mjs';
import {TemporaryStorage} from '../src/temporary-storage.mjs';
const photo='data:image/jpeg;base64,/9j/AAAA';
const file={type:'image/png',size:2048};

test('foto é recortada no centro, redimensionada e convertida em JPEG local',async()=>{
  const calls=[];let closed=false;const image={width:800,height:600,close(){closed=true;}};
  const canvas={getContext:()=>({fillRect(...args){calls.push(['fill',...args]);},drawImage(...args){calls.push(['draw',...args]);}}),toDataURL(type,quality){assert.equal(type,'image/jpeg');assert.equal(quality,.86);return photo;}};
  assert.equal(await prepareProfilePhoto(file,{decode:async()=>image,createCanvas:()=>canvas}),photo);
  assert.equal(canvas.width,256);assert.equal(canvas.height,256);assert(closed);
  assert.deepEqual(calls[1],['draw',image,100,0,600,600,0,0,256,256]);
});

test('foto inválida, muito grande ou que não pode ser decodificada não é aceita',async()=>{
  await assert.rejects(prepareProfilePhoto({...file,type:'image/svg+xml'}),/JPG, PNG ou WebP/);
  await assert.rejects(prepareProfilePhoto({...file,size:6*1024*1024}),/5 MB/);
  await assert.rejects(prepareProfilePhoto(file,{decode:async()=>{throw new Error('bad image');}}),/abrir essa foto/);
  let closed=false;await assert.rejects(prepareProfilePhoto(file,{decode:async()=>({width:10000,height:10000,close(){closed=true;}})}),/megapixels/);assert(closed);
  assert(!isProfilePhoto('https://example.com/photo.jpg'));assert(!isProfilePhoto('data:image/svg+xml;base64,AAAA'));
  assert(!isProfilePhoto(photo+'A'.repeat(180000)));
});

test('foto pertence à conta, persiste ao reabrir e pode voltar às iniciais',()=>{
  const local=new TemporaryStorage(),owner=new AccountStorage(local,'111'),other=new AccountStorage(local,'222'),config={name:'Estudante',photo:''};
  saveProfilePhoto(config,owner,photo);assert.equal(config.photo,photo);assert.equal(JSON.parse(owner.getItem('foco:config')).photo,photo);assert.equal(other.getItem('foco:config'),null);
  saveProfilePhoto(config,owner,'');assert.equal(JSON.parse(owner.getItem('foco:config')).photo,'');
});

test('falha de armazenamento preserva a foto atual e não altera preferências',()=>{
  const config={name:'Estudante',photo},before=structuredClone(config);
  assert.throws(()=>saveProfilePhoto(config,{setItem(){throw new DOMException('Full','QuotaExceededError');}},''),{name:'QuotaExceededError'});
  assert.deepEqual(config,before);assert.throws(()=>saveProfilePhoto(config,{setItem(){}},'javascript:alert(1)'),/inválida/);
});
