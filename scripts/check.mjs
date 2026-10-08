import {execFileSync} from 'node:child_process';
import {readdir} from 'node:fs/promises';
for (const dir of ['src','scripts']) for (const f of await readdir(dir)) if(f.endsWith('.mjs')) execFileSync(process.execPath,['--check',`${dir}/${f}`]);
console.log('Sintaxe dos módulos verificada.');
