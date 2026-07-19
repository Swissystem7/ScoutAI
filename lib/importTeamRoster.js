const fs = require('fs');
const { randomUUID } = require('crypto');
const allowed = new Set(['Goalkeeper','GK','Defender','DF','Midfielder','MF','Forward','FW']);

function csvRows(text) {
  const rows=[]; let row=[], cell='', quoted=false;
  for (let i=0;i<text.length;i++) { const c=text[i];
    if (c==='"' && quoted && text[i+1]==='"') { cell+='"'; i++; }
    else if (c==='"') quoted=!quoted;
    else if (c===',' && !quoted) { row.push(cell); cell=''; }
    else if ((c==='\n'||c==='\r') && !quoted) { if(c==='\r'&&text[i+1]==='\n')i++; row.push(cell); rows.push(row); row=[]; cell=''; }
    else cell+=c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (quoted) throw new SyntaxError('Invalid CSV');
  return rows;
}

async function importTeamRoster(filePath, mappingConfig) {
  const fail=reason=>({success:false,players:[],errors:[{rowNumber:0,reason}]});
  if (!mappingConfig || typeof mappingConfig.nameField!=='string') return fail('Missing required nameField');
  let raw; try { raw=await fs.promises.readFile(filePath,'utf8'); } catch(e) { return fail(e.code==='ENOENT'?'File not found':e.message); }
  raw=raw.replace(/^\uFEFF/,''); let objects;
  try {
    if (/\.json$/i.test(filePath)) { objects=JSON.parse(raw); if(!Array.isArray(objects)) throw new SyntaxError('Invalid JSON format'); }
    else if (/\.csv$/i.test(filePath)) { const rows=csvRows(raw), headers=(rows.shift()||[]).map(x=>x.trim()); objects=rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||'').trim()]))); }
    else return fail('Unsupported file format. Use .csv or .json');
  } catch(e) { return fail(e.message); }
  const players=[], errors=[], seen=new Set();
  for (let i=0;i<objects.length;i++) { const o=objects[i], rowNumber=i+(/\.csv$/i.test(filePath)?2:1), name=String(o?.[mappingConfig.nameField]??'').trim();
    if(!name){errors.push({rowNumber,reason:'Missing required name field'});continue}
    if(seen.has(name)){errors.push({rowNumber,reason:`Duplicate player name: ${name}`});continue} seen.add(name);
    const position=mappingConfig.positionField?String(o[mappingConfig.positionField]??'').trim():'';
    if(position&&!allowed.has(position)){errors.push({rowNumber,reason:`Invalid position: ${position}`});continue}
    const rawJ=mappingConfig.jerseyNumberField?String(o[mappingConfig.jerseyNumberField]??'').trim():'';
    const jerseyNumber=rawJ===''?undefined:Number(rawJ);
    if(rawJ!==''&&(!Number.isInteger(jerseyNumber)||jerseyNumber<0||jerseyNumber>99)){errors.push({rowNumber,reason:`Jersey number out of range (0-99): ${rawJ}`});continue}
    players.push({id:randomUUID(),name,position:position||undefined,jerseyNumber,teamName:String((mappingConfig.teamNameField&&o[mappingConfig.teamNameField])||mappingConfig.defaultTeamName||'').trim()});
  }
  return {success:errors.length===0,players,errors};
}
module.exports = { importTeamRoster };
