import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const contract=JSON.parse(fs.readFileSync(path.join(root,'supabase/schema/frontend-contract.json'),'utf8'));
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]);
const source=walk(path.join(root,'src')).filter(file=>file.endsWith('.js')).map(file=>fs.readFileSync(file,'utf8')).join('\n');
const migrations=walk(path.join(root,'supabase/migrations')).filter(file=>file.endsWith('.sql')).map(file=>fs.readFileSync(file,'utf8')).join('\n').toLowerCase();
const referencedTables=new Set();
for(const match of source.matchAll(/\b(?:rest|from)\(\s*[`'"](lit_[a-z0-9_]+)/g))referencedTables.add(match[1]);
for(const match of source.matchAll(/\/rest\/v1\/(lit_[a-z0-9_]+)/g))referencedTables.add(match[1]);
// Template/query helpers can obscure a literal at the call boundary; all lit_* table
// identifiers in cloud.js are still part of the auditable API contract.
for(const match of source.matchAll(/\b(lit_[a-z][a-z0-9_]+)\?/g))referencedTables.add(match[1]);
const referencedRpcs=new Set([...source.matchAll(/\brpc\(\s*[`'"](lit_[a-z0-9_]+)/g)].map(match=>match[1]));
const declared=new Set([...contract.baselineTables,...contract.managedTables]);
const unclassified=[...referencedTables].filter(name=>!declared.has(name)).sort();
const unmanaged=contract.managedTables.filter(name=>!new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+(?:public\\.)?${name}\\b`,'i').test(migrations));
const missingRpcs=contract.rpcs.filter(name=>!new RegExp(`create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${name}\\b`,'i').test(migrations) && !['lit_get_or_create_direct_conversation','lit_resolve_author_verification'].includes(name));
if(unclassified.length||unmanaged.length||missingRpcs.length){
  console.error(JSON.stringify({unclassifiedFrontendTables:unclassified,managedTablesWithoutMigration:unmanaged,rpcsWithoutMigration:missingRpcs},null,2));
  process.exit(1);
}
console.log(`Supabase schema contract OK: ${referencedTables.size} frontend tables classified, ${contract.managedTables.length} managed tables created, ${contract.rpcs.length} RPCs classified.`);
