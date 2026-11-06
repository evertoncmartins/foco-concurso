import {createHmac} from 'node:crypto';

const key=id=>`foco:bank-attribution:v1:${id}`;
// Check all banks before writing any attribution. The same state keys guard
// deletion, so a session and a deletion cannot both win the race.
export const ASSIGN_SCRIPT=`
for i=1,#KEYS,3 do
  if redis.call('GET',KEYS[i]) or redis.call('GET',KEYS[i+2]) then return 0 end
end
for i=2,#KEYS,3 do redis.call('SADD',KEYS[i],ARGV[1]) end
return 1`;
export const RESERVE_SCRIPT=`
if redis.call('GET',KEYS[1]) then return 0 end
if redis.call('SCARD',KEYS[2])>0 then return 0 end
redis.call('SET',KEYS[1],ARGV[1])
return 1`;
const FINISH_SCRIPT=`
if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end
if ARGV[2]=='release' then redis.call('DEL',KEYS[1]) else redis.call('SET',KEYS[1],'deleted') end
return 1`;
export const PUBLISH_SCRIPT=`
local state=redis.call('GET',KEYS[1])
if state and not (ARGV[2]=='create' and state=='deleted') then return 0 end
redis.call('SET',KEYS[1],ARGV[1])
if state=='deleted' then return 2 end
return 1`;
export const ACTIVATE_SCRIPT=`
if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end
if ARGV[2]=='enabled' then redis.call('DEL',KEYS[2]) else redis.call('SET',KEYS[2],'1') end
redis.call('DEL',KEYS[1])
return 1`;

export class BankAssignments{
  constructor({env=process.env,fetcher=globalThis.fetch}={}){
    this.url=env.UPSTASH_REDIS_REST_URL||env.KV_REST_API_URL;
    this.token=env.UPSTASH_REDIS_REST_TOKEN||env.KV_REST_API_TOKEN;
    this.secret=env.BANK_ASSIGNMENT_SECRET;
    this.fetcher=fetcher;
    this.configured=!!(this.url&&this.token&&this.secret?.length>=32);
  }
  async command(command){
    if(!this.configured)throw new Error('Registro de atribuições não configurado.');
    const response=await this.fetcher(this.url,{method:'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},
      body:JSON.stringify(command),cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Registro de atribuições indisponível.');
    const data=await response.json();
    if(data.error)throw new Error('Registro de atribuições indisponível.');
    return data.result;
  }
  async status(ids){
    const result=[];
    for(const id of ids){
      const values=await this.command(['MGET',`${key(id)}:state`,`${key(id)}:disabled`]),assigned=await this.command(['SCARD',`${key(id)}:users`]);
      if(!Array.isArray(values)||values.length!==2||values.some(value=>value!==null&&typeof value!=='string')||!Number.isSafeInteger(assigned)||assigned<0)throw new Error('Resposta de atribuições inválida.');
      const [state,disabled]=values;
      result.push({id,state:state?'pending':null,assigned,disabled:!!disabled});
    }
    return result;
  }
  async assign(ids,subject){
    const member=createHmac('sha256',this.secret).update(subject).digest('hex');
    const keys=ids.flatMap(id=>[`${key(id)}:state`,`${key(id)}:users`,`${key(id)}:disabled`]);
    return await this.command(['EVAL',ASSIGN_SCRIPT,keys.length,...keys,member])===1;
  }
  async reserve(id,operation){return await this.command(['EVAL',RESERVE_SCRIPT,2,`${key(id)}:state`,`${key(id)}:users`,operation])===1;}
  async reservePublication(id,operation,{create=false}={}){
    const result=await this.command(['EVAL',PUBLISH_SCRIPT,1,`${key(id)}:state`,operation,create?'create':'update']);
    if(![0,1,2].includes(result))throw new Error('Resposta de publicação inválida.');
    return {reserved:result>0,previousDeleted:result===2};
  }
  async finishPublication(id,operation,active){
    const result=await this.command(['EVAL',ACTIVATE_SCRIPT,2,`${key(id)}:state`,`${key(id)}:disabled`,operation,active?'enabled':'disabled']);
    if(result!==1)throw new Error('Não foi possível confirmar a publicação.');
  }
  async finish(id,operation,{release=false}={}){
    const result=await this.command(['EVAL',FINISH_SCRIPT,1,`${key(id)}:state`,operation,release?'release':'deleted']);
    if(result!==1)throw new Error('Não foi possível confirmar a exclusão.');
  }
}
