'use strict';
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const src=path.join(root,'node_modules','pdfjs-dist','build');
const dest=path.join(root,'public','vendor');
fs.mkdirSync(dest,{recursive:true});
for(const file of ['pdf.min.js','pdf.worker.min.js']) {
 const from=path.join(src,file);
 if(!fs.existsSync(from))throw Error('Missing local PDF.js: '+from);
 fs.copyFileSync(from,path.join(dest,file));
}
console.log('PDF.js installed locally for in-page worksheet and answer rendering');
