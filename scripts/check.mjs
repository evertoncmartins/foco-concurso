import {execFileSync} from 'node:child_process';
import {readdir} from 'node:fs/promises';
for (const dir of ['src','scripts','server','api']) for (const f of await readdir(dir,{recursive:true})) if(/\.(mjs|js)$/.test(f)) execFileSync(process.execPath,['--check',`${dir}/${f}`]);
console.log('Sintaxe dos módulos verificada.');
