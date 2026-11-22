import { attachNoteBlocks } from './blocks.js';

const colors={red:'#e34242',green:'#129966',yellow:'#b58a16'};
const noteTags=new Set(['B','STRONG','U','UL','OL','LI','DIV','P','BR','SPAN','FONT','BLOCKQUOTE']);
const documentTags=new Set(['I','EM','H1','H2','H3','H4','H5','H6','TABLE','COLGROUP','COL','THEAD','TBODY','TFOOT','TR','TH','TD']);
const removedTags=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','IMG','TEMPLATE','NOSCRIPT']);
function clean(html){
 const template=document.createElement('template');
 template.innerHTML=html||'';
 function visit(node){
  for(const child of [...node.childNodes]){
   if(child.nodeType===3)continue;
   if(child.nodeType!==1||child.namespaceURI!=='http://www.w3.org/1999/xhtml'||removedTags.has(child.tagName)||
    (child.matches('button.note-table-handle[data-table-axis][contenteditable=false]'))){child.remove();continue}
   if(child.hasAttribute('data-note-caret-line')&&!child.textContent&&child.childNodes.length===1&&child.firstChild.nodeName==='BR'){
    child.remove();
    continue;
   }
   visit(child);
   if(!noteTags.has(child.tagName)&&!(documentTags.has(child.tagName))){
    child.replaceWith(...child.childNodes);
    continue;
   }
   const isDefault=child.classList.contains('note-color-default');
   const color=child.getAttribute('color')||child.style.color,indent=child.style.marginLeft;
   const weight=child.style.fontWeight;
   const spans=child.matches('th,td')?['colspan','rowspan'].map(name=>[name,child.getAttribute(name)]):[];
   const headers=child.tagName==='TABLE'?['data-header-row','data-header-column'].map(name=>[name,child.getAttribute(name)]):[];
   const width=['TABLE','COL'].includes(child.tagName)?child.style.width:'';
   const sized=child.tagName==='COLGROUP'&&child.hasAttribute('data-note-widths');
   const numberAttr=({OL:'start',LI:'value'})[child.tagName];
   const number=numberAttr&&!child.hasAttribute('data-note-derived-start')&&child.getAttribute(numberAttr);
   const depth=child.matches('ol,ul')&&child.dataset.noteListDepth;
   for(const attr of [...child.attributes])child.removeAttribute(attr.name);
   const normalized=color?.replaceAll(' ','').toLowerCase();
   const name=Object.keys(colors).find(k=>[colors[k],{red:'rgb(227,66,66)',green:'rgb(18,153,102)',yellow:'rgb(181,138,22)'}[k]].includes(normalized));
   if(isDefault)child.className='note-color-default';
   else if(name){child.className='note-color-'+name;child.style.color=colors[name]}
   if(/^\d{1,3}px$/.test(indent))child.style.marginLeft=Math.min(240,parseInt(indent))+'px';
   if(/^(?:normal|bold|[1-9]00)$/.test(weight))child.style.fontWeight=weight;
   for(const [attribute,value] of spans)if(/^[1-9]\d?$/.test(value||''))child.setAttribute(attribute,value);
   for(const [attribute,value] of headers)if(value==='true'||value==='false')child.setAttribute(attribute,value);
   if(sized)child.setAttribute('data-note-widths','');
   if(/^[1-9]\d*$/.test(depth||''))child.dataset.noteListDepth=depth;
   if(numberAttr&&/^-?\d{1,10}$/.test(number||'')&&Number(number)>=-2147483648&&Number(number)<=2147483647){
    child.setAttribute(numberAttr,String(Number(number)));
   }
   if(/^\d{1,8}px$/.test(width))child.style.width=width;
  }
 }
 visit(template.content);
 return template.innerHTML;
}
export function createRichText(textarea, toolbarHost, listen){
const editor=document.createElement('div'),toolbar=document.createElement('div');
editor.id=textarea.id;
editor.className='note-rich-editor note-document';
editor.contentEditable='true';
editor.setAttribute('role','textbox');
editor.setAttribute('aria-multiline','true');
if(textarea.hasAttribute('aria-labelledby'))editor.setAttribute('aria-labelledby',textarea.getAttribute('aria-labelledby'));
else editor.setAttribute('aria-label',textarea.getAttribute('aria-label') || '正文');
editor.dataset.placeholder=textarea.placeholder;
toolbar.className='note-rich-toolbar';
toolbar.setAttribute('role','toolbar');
toolbar.setAttribute('aria-label','文字格式');
toolbarHost.append(toolbar);
textarea.replaceWith(editor);
let range;
const blocks=attachNoteBlocks(editor);
function updateEmpty(){
 const text=editor.textContent.replace(/[\s\u200b\uFEFF]/g,'');
 editor.dataset.empty=String(!text&&!editor.querySelector('ul,ol,h2,h3,h4,table'));
}
listen(editor,'input',updateEmpty);
updateEmpty();
function remember(){
 const selection=getSelection();
 if(!selection.rangeCount)return;
 const current=selection.getRangeAt(0);
 if(editor.contains(current.commonAncestorContainer))range=current.cloneRange();
}
function applySelectionColor(selection,value){
 if(!selection.rangeCount||selection.isCollapsed)return false;
 const selected=selection.getRangeAt(0);
 if(!editor.contains(selected.commonAncestorContainer))return false;
 const colorName=value==='inherit'?'default':Object.keys(colors).find(name=>colors[name]===value);
 if(!colorName)return false;
 const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
 const pieces=[];
 for(let node=walker.nextNode();node;node=walker.nextNode()){
  if(!selected.intersectsNode(node))continue;
  const start=node===selected.startContainer?selected.startOffset:0;
  const end=node===selected.endContainer?selected.endOffset:node.length;
  if(start<end)pieces.push({node,start,end});
 }
 if(!pieces.length)return false;
 const colored=pieces.map(({node,start,end})=>{
  if(end<node.length)node.splitText(end);
  const text=start?node.splitText(start):node;
  const parent=text.parentElement;
  const span=parent.tagName==='SPAN'&&parent.childNodes.length===1&&
   Object.keys(colors).concat('default').some(name=>parent.classList.contains('note-color-'+name))
   ?parent:document.createElement('span');
  span.className='note-color-'+colorName;
  span.style.color=colors[colorName]||'';
  if(span!==parent){text.before(span);span.append(text)}
  return text;
 });
 const updated=document.createRange();
 updated.setStart(colored[0],0);
 const last=colored[colored.length-1];
 updated.setEnd(last,last.length);
 selection.removeAllRanges();
 selection.addRange(updated);
 return true;
}
function restoreSelection(){
 const savedRange=range;
 editor.focus();
 const selection=getSelection();
 if(savedRange&&editor.contains(savedRange.commonAncestorContainer)){
  selection.removeAllRanges();
  selection.addRange(savedRange);
 }else if(!savedRange)selection.collapse(editor,editor.childNodes.length);
 return selection;
}
function command(cmd,value){
 const selection=restoreSelection();
 const blockType=({formatBlock:value,insertOrderedList:'ol',insertUnorderedList:'ul'})[cmd];
 if(blockType)blocks.format(selection,blockType);
 else if(cmd!=='foreColor'||!applySelectionColor(selection,value)){
  if(cmd==='bold')document.execCommand('styleWithCSS',false,false);
  document.execCommand(cmd,false,value==='inherit'?getComputedStyle(editor).color:value);
 }
 remember();
 editor.dispatchEvent(new Event('input',{bubbles:true}));
}
const icons={bold:'<path d="M6 3h6a4 4 0 0 1 0 8H6zm0 8h7a4 4 0 0 1 0 8H6z"/>',underline:'<path d="M6 3v7a5 5 0 0 0 10 0V3M4 20h14"/>',insertUnorderedList:'<path d="M8 5h12M8 11h12M8 17h12"/><circle cx="3" cy="5" r="1"/><circle cx="3" cy="11" r="1"/><circle cx="3" cy="17" r="1"/>',foreColor:'<path d="m6 16 5-13 5 13M8 11h6M4 21h14"/>'};
const tools=[['加粗','bold'],['下划线','underline'],['项目符号','insertUnorderedList'],['红色','foreColor',colors.red],['绿色','foreColor',colors.green],['黄色','foreColor',colors.yellow],['默认色','foreColor','inherit']];
tools.unshift(['正文','formatBlock','p','¶'],['小标题','formatBlock','h3','H'],['斜体','italic',undefined,'𝑰'],['编号列表','insertOrderedList',undefined,'1.']);
for(const [text,cmd,value,label] of tools){
 const button=document.createElement('button');
 button.type='button';
 if(label)button.textContent=label;
 else button.innerHTML='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[cmd]+'</svg>';
 button.dataset.tooltip=text;
 button.setAttribute('aria-label',text);
 if(cmd==='foreColor'&&value!=='inherit')button.classList.add('note-tool-'+Object.keys(colors).find(k=>colors[k]===value));
 button.onmousedown=event=>event.preventDefault();
 button.onclick=()=>{command(cmd,value)};
 toolbar.append(button);
}
for(const event of ['keyup','mouseup','focus','input'])listen(editor,event,remember);
listen(document,'selectionchange',remember);
function constrainTripleClickSelection(event){
 if(event.detail!==3||event.button!==0||event.shiftKey||event.metaKey||event.ctrlKey||event.altKey)return;
 const block=event.target.closest('p,div,h2,h3,h4,blockquote,li,td,th');
 if(!block||!editor.contains(block)||block===editor||block.closest('td,th'))return;
 const selection=getSelection();
 if(!selection.rangeCount||selection.isCollapsed)return;
 const selected=selection.getRangeAt(0);
 const text=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);
 const line=document.createRange();
 let found=false;
 for(let node=text.nextNode();node;node=text.nextNode()){
  if(node.parentElement.closest('p,div,h2,h3,h4,blockquote,li,td,th')!==block||!selected.intersectsNode(node))continue;
  const start=selected.startContainer===node?selected.startOffset:0;
  const end=selected.endContainer===node?selected.endOffset:node.length;
  if(start>=end)continue;
  if(!found)line.setStart(node,start);
  line.setEnd(node,end);
  found=true;
 }
 if(!found)return;
 // Chromium can include the break after the block in its native triple-click range.
 selection.removeAllRanges();
 selection.addRange(line);
}
listen(editor,'click',constrainTripleClickSelection);
listen(editor,'paste',event=>{
 event.preventDefault();
 const text=event.clipboardData.getData('text/plain');
 blocks.paste(getSelection(),clean(event.clipboardData.getData('text/html')),text);
});
listen(editor,'drop',event=>event.preventDefault());
return {
 element:editor,
 set(text,html){
  const cleaned=html?clean(html):'';
  editor.innerHTML=cleaned;
  if(!cleaned&&text){
   for(const value of text.split(/\r\n|\r|\n/)){
    const line=document.createElement('p');
    line.append(value||document.createElement('br'));
    editor.append(line);
   }
  }else if(!cleaned)editor.textContent=text||'';
  blocks.normalize();
  updateEmpty();
  range=null;
 },
 text(){return editor.innerText.trim()},
 html(){
  const html=clean(editor.innerHTML);
  return blocks.serialize(html);
 },
 insertTable(){
  const table=document.createElement('table');
  const body=table.createTBody();
  for(let index=0;index<2;index++){
   const row=body.insertRow();
   for(let column=0;column<3;column++)row.insertCell().append(document.createElement('br'));
  }
  blocks.insertTable(restoreSelection(),table);
  editor.dispatchEvent(new Event('input',{bubbles:true}));
  remember();
 }
};
}
