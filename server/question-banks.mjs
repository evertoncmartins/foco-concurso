import {repositoryCatalog,repositoryBanksDirectory} from './repository-banks.mjs';

// The public API is read-only. Changes are reviewed and published through GitHub.
export function createBankCatalogHandler({directory=repositoryBanksDirectory}={}){
  return async request=>{
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'*','Allow':'GET, HEAD'};
    if(!['GET','HEAD'].includes(request.method))return Response.json({message:'O catálogo do sistema é publicado pelo repositório GitHub.'},{status:405,headers});
    try{
      const {manifest}=repositoryCatalog(directory);
      return request.method==='HEAD'?new Response(null,{headers}):Response.json(manifest,{headers});
    }catch{return Response.json({message:'O catálogo do sistema está temporariamente indisponível.'},{status:503,headers});}
  };
}
